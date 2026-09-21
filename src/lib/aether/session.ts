import { getAccessCode } from "./access";
import { askAether, hearAether, speakAether, toChatPayload } from "./ai";
import { getNativeAccessCode, runPhoneActions } from "./native";
import { createVad } from "./silence";
import { useAether } from "./store";
import type { PhoneAction } from "./types";
import {
  base64ToAudioUrl,
  blobToBase64,
  pickRecorderMime,
  playAudioUrl,
  speakWithDevice,
  stopAudio,
  stopDeviceVoice,
} from "./voice";

/**
 * One "run" = one turn: listen -> transcribe -> think -> act -> speak.
 * Pressing Stop bumps runId, so anything still in flight notices it is stale and quietly drops its result.
 */
let runId = 0;

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let vadTimer: number | null = null;
let hardTimer: number | null = null;
let playingUrl: string | null = null;
// Flips to false once the server says it has no voice, so we stop asking every turn.
let serverVoice = true;

const OFFLINE = "Couldn't reach Eta. Check your connection.";
const DIDNT_HEAR = "I didn't hear anything. Tap the disc and try again.";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function store() {
  return useAether.getState();
}

/** Add a line to the live "what I'm doing" list. */
function step(text: string) {
  store().pushStep(text);
}

/** Back to idle with a message the user can read. */
function fail(message: string) {
  const s = store();
  s.setSteps([]);
  s.setListen("idle");
  s.setError(message);
}

/** The app's built-in code if there is one, otherwise whatever was typed into Settings. */
async function accessCode(): Promise<string> {
  return (await getNativeAccessCode()) || getAccessCode();
}

function actionLabel(a: PhoneAction): string {
  const name = a.action.replace(/_/g, " ");
  const detail = a.target ?? a.value;
  return detail ? `${name} (${String(detail).slice(0, 40)})` : name;
}

// ---------------------------------------------------------------------------
// Microphone
// ---------------------------------------------------------------------------

function stopVad() {
  if (vadTimer !== null) window.clearInterval(vadTimer);
  if (hardTimer !== null) window.clearTimeout(hardTimer);
  vadTimer = null;
  hardTimer = null;
  if (audioCtx) {
    void audioCtx.close().catch(() => undefined);
    audioCtx = null;
  }
}

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** Throw the current recording away and release the microphone. */
function teardownRecorder() {
  stopVad();
  try {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  } catch {
    /* ignore */
  }
  recorder = null;
  chunks = [];
  stopStream();
}

function stopRecorder(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const rec = recorder;
    if (!rec || rec.state === "inactive") {
      resolve(null);
      return;
    }
    rec.onstop = () => {
      const type = rec.mimeType || "audio/webm";
      resolve(new Blob(chunks, { type }));
      recorder = null;
      chunks = [];
    };
    rec.stop();
  });
}

/** Watch the mic level; send automatically once the user stops talking. */
function watchForSilence(id: number, ctx: AudioContext | null) {
  // Safety net: whatever happens, a recording never runs past 22 seconds.
  hardTimer = window.setTimeout(() => void finishListening(id), 22_000);
  if (!ctx || !stream) return;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const vad = createVad();
  let announced = false;

  vadTimer = window.setInterval(() => {
    if (id !== runId) {
      stopVad();
      return;
    }
    // Some WebViews start the audio engine suspended; then there is nothing to measure,
    // and the tap-to-send button and the safety net still work.
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => undefined);
      return;
    }
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    const verdict = vad.feed(Math.sqrt(sum / samples.length), performance.now());

    if (vad.heardSpeech && !announced) {
      announced = true;
      step("Hearing you");
    }
    if (verdict === "send") {
      step("Quiet now, sending it");
      void finishListening(id);
    } else if (verdict === "nothing") {
      teardownRecorder();
      fail(DIDNT_HEAR);
    }
  }, 80);
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone is blocked. Allow it in Settings, Apps, Aether, Permissions.";
  }
  if (name === "NotFoundError") return "No microphone found on this phone.";
  if (name === "NotReadableError") return "Another app is using the microphone. Close it and try again.";
  return "Couldn't open the microphone.";
}

// ---------------------------------------------------------------------------
// Public controls
// ---------------------------------------------------------------------------

/** Tap on the disc: start listening, or (while listening) send now, or (while busy) stop. */
export async function tapOrb() {
  const { listen } = store();
  if (listen === "idle") return startListening();
  if (listen === "recording") return finishListening(runId);
  stopEverything();
}

/** The Stop button: cancels listening, thinking, pending actions and speech, all at once. */
export function stopEverything() {
  runId += 1; // anything still running now sees it is stale and drops its result
  teardownRecorder();
  stopAudio();
  stopDeviceVoice();
  const s = store();
  s.setSteps([]);
  s.setListen("idle");
}

/** Kept for callers that only want to drop a recording (e.g. when the screen closes). */
export const cancelRecording = stopEverything;

export async function startListening() {
  if (store().listen !== "idle") return;
  const id = ++runId;
  const s = store();
  s.setError(null);
  s.setSteps([]);
  s.setListen("recording"); // show "Listening" straight away; tap now means "cancel" not "start again"
  step("Opening the microphone");

  // Create the audio engine inside the tap itself, while the browser still allows sound.
  let ctx: AudioContext | null = null;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      ctx = new Ctx();
      void ctx.resume().catch(() => undefined);
    }
  } catch {
    ctx = null;
  }

  try {
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    if (id !== runId || store().listen !== "recording") {
      // Stopped while the permission prompt was open.
      media.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      return;
    }
    stream = media;
    audioCtx = ctx;
    chunks = [];
    const mime = pickRecorderMime();
    recorder = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.start(250);
    step("Listening. Tap the disc when you're done");
    watchForSilence(id, ctx);
  } catch (err) {
    void ctx?.close().catch(() => undefined);
    if (id !== runId) return;
    teardownRecorder();
    fail(micErrorMessage(err));
  }
}

/** Stop recording and carry the audio through to a spoken reply. */
export async function finishListening(id: number) {
  if (id !== runId || store().listen !== "recording") return;
  store().setListen("thinking"); // set first so a second call (tap + silence at once) is ignored
  stopVad();
  try {
    const blob = await stopRecorder();
    stopStream();
    if (id !== runId) return;
    if (!blob || blob.size < 800) {
      fail(DIDNT_HEAR);
      return;
    }

    step("Turning your voice into text");
    const b64 = await blobToBase64(blob);
    const heard = await hearAether({
      data: {
        accessCode: await accessCode(),
        audioBase64: b64,
        mimeType: blob.type || "audio/webm",
        language: store().settings.language,
      },
    });
    if (id !== runId) return;
    if (!heard.ok) {
      fail(heard.error);
      return;
    }
    step(`Heard: "${heard.text.slice(0, 80)}"`);
    await runTurn(heard.text, id);
  } catch {
    stopStream();
    if (id === runId) fail(OFFLINE);
  }
}

/** Typed messages from the text box. */
export async function sendText(text: string) {
  if (store().listen !== "idle") return;
  const id = ++runId;
  store().setSteps([]);
  await runTurn(text, id);
}

// ---------------------------------------------------------------------------
// One turn: think -> act -> speak
// ---------------------------------------------------------------------------

async function runTurn(text: string, id: number) {
  const trimmed = text.trim();
  if (!trimmed) {
    fail(DIDNT_HEAR);
    return;
  }
  const s = store();
  s.setError(null);
  s.addMessage({ id: crypto.randomUUID(), role: "user", text: trimmed, at: Date.now() });
  s.setListen("thinking");
  step("Thinking about it");

  let reply: Awaited<ReturnType<typeof askAether>>;
  try {
    reply = await askAether({
      data: {
        accessCode: await accessCode(),
        messages: toChatPayload(store().messages),
        language: s.settings.language,
      },
    });
  } catch {
    if (id === runId) fail(OFFLINE);
    return;
  }
  if (id !== runId) return;
  if (!reply.ok) {
    fail(reply.error);
    return;
  }

  let spoken = reply.text;
  if (reply.actions.length) {
    step(`Working out ${reply.actions.length === 1 ? "an action" : `${reply.actions.length} actions`} on the phone`);
    const results = await runPhoneActions(reply.actions, {
      shouldContinue: () => id === runId,
      onAction: (a) => step(`Doing: ${actionLabel(a)}`),
    });
    if (id !== runId) return;
    const failed = results.filter((r) => !r.ok).map((r) => r.message);
    if (failed.length) spoken = `${spoken} ${failed.join(" ")}`;
  }

  step("Answering");
  store().addMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: spoken,
    at: Date.now(),
    actions: reply.actions,
    trace: store().steps.slice(-8),
  });

  // Always speak the reply out loud while the text is shown.
  await speak(spoken, id);
}

const GREETING =
  "Hello, I am Eta, your personal mobile assistant. Tap the disc and talk to me.";

/** First launch inside the app: say hello once, then get out of the way. */
export async function greetOnce() {
  const s = store();
  if (s.settings.onboarded || s.listen !== "idle") return;
  s.setOnboarded();
  s.addMessage({ id: crypto.randomUUID(), role: "assistant", text: GREETING, at: Date.now() });
  await speak(GREETING, ++runId);
}

export async function speak(text: string, id: number = ++runId) {
  const s = store();
  s.setListen("speaking");
  step("Speaking");
  const vol = Math.max(0.2, s.device.volume / 15);
  try {
    // Prefer server TTS (xAI) when available — higher quality, plays as real audio.
    if (serverVoice) {
      const voice = await speakAether({
        data: {
          accessCode: await accessCode(),
          text,
          voice: s.settings.voice,
          language: s.settings.language,
        },
      });
      if (id !== runId) return; // stopped while the voice was being made
      if (voice.ok) {
        if (playingUrl) URL.revokeObjectURL(playingUrl);
        playingUrl = base64ToAudioUrl(voice.audioBase64, voice.mimeType);
        await playAudioUrl(playingUrl, vol);
        return;
      }
      // Provider has no TTS (e.g. Groq) — fall through to device voice and remember.
      if ("device" in voice && voice.device) serverVoice = false;
    }
    // Fallback: phone/browser built-in speechSynthesis (always try so text is spoken).
    if (id !== runId) return;
    await speakWithDevice(text, s.settings.language, vol);
  } catch {
    /* autoplay or network — text is already on screen; still try device voice once */
    try {
      if (id === runId) await speakWithDevice(text, s.settings.language, vol);
    } catch {
      /* ignore */
    }
  } finally {
    if (id === runId) {
      store().setSteps([]);
      store().setListen("idle");
    }
  }
}
