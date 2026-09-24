import { getAccessCode } from "./access";
import { askAether, hearAether, speakAether, toChatPayload } from "./ai";
import { getNativeAccessCode, runPhoneActions } from "./native";
import {
  collectPhoneActions,
  planTasks,
  runTaskGraph,
  shouldUseOrchestrator,
  synthesizeReply,
} from "./orchestrator";
import { createVad } from "./silence";
import { useAether } from "./store";
import { resolveVoiceId, type PhoneAction } from "./types";
import { hasOnDeviceStt, recognizeOnce } from "./device-stt";
import {
  base64ToAudioUrl,
  blobToBase64,
  pickRecorderMime,
  playAudioUrl,
  speakWithDevice,
  stopAudio,
  stopDeviceVoice,
} from "./voice";

let runId = 0;

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let vadTimer: number | null = null;
let hardTimer: number | null = null;

const OFFLINE = "Couldn't reach Eta. Check your connection.";
const DIDNT_HEAR = "I didn't hear anything. Tap the mic and try again.";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function store() {
  return useAether.getState();
}

function step(text: string) {
  store().pushStep(text);
}

function fail(message: string) {
  const s = store();
  s.setSteps([]);
  s.setListen("idle");
  s.setError(message);
}

async function accessCode(): Promise<string> {
  return (await getNativeAccessCode()) || getAccessCode();
}

function actionLabel(a: PhoneAction): string {
  const name = a.action.replace(/_/g, " ");
  const detail = a.target ?? a.value;
  return detail ? `${name} (${String(detail).slice(0, 40)})` : name;
}

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

function watchForSilence(id: number, ctx: AudioContext | null) {
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
    return "Microphone is blocked. Allow it in Settings \u2192 Apps \u2192 Eta \u2192 Permissions.";
  }
  if (name === "NotFoundError") return "No microphone found on this phone.";
  if (name === "NotReadableError") return "Another app is using the microphone. Close it and try again.";
  return "Couldn't open the microphone.";
}

export async function tapOrb() {
  const { listen } = store();
  if (listen === "idle") return startListening();
  if (listen === "recording") return finishListening(runId);
  stopEverything();
}

export function stopEverything() {
  runId += 1;
  teardownRecorder();
  stopAudio();
  stopDeviceVoice();
  const s = store();
  s.setSteps([]);
  s.setListen("idle");
}

export const cancelRecording = stopEverything;

export async function startListening() {
  if (store().listen !== "idle") return;
  const id = ++runId;
  const s = store();
  s.setError(null);
  s.setSteps([]);
  s.setListen("recording");

  if (s.settings.preferOnDeviceSpeech && hasOnDeviceStt()) {
    step("Listening on this phone\u2026");
    try {
      const text = await recognizeOnce(s.settings.language);
      if (id !== runId) return;
      if (text) {
        step(`Heard: "${text.slice(0, 80)}"`);
        await runTurn(text, id);
        return;
      }
      step("On-device listen empty, using online ear");
    } catch {
      step("On-device listen failed, using online ear");
    }
    if (id !== runId) return;
  }

  step("Opening the microphone");

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
    step("Listening\u2026 tap the mic when you're done");
    watchForSilence(id, ctx);
  } catch (err) {
    void ctx?.close().catch(() => undefined);
    if (id !== runId) return;
    teardownRecorder();
    fail(micErrorMessage(err));
  }
}

export async function finishListening(id: number) {
  if (id !== runId || store().listen !== "recording") return;
  store().setListen("thinking");
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

export async function sendText(text: string) {
  if (store().listen !== "idle") return;
  const id = ++runId;
  store().setSteps([]);
  await runTurn(text, id);
}

/**
 * Shared turn path for typed and voice input.
 * Multi-intent messages go through the orchestrator; otherwise the existing
 * LLM + phone_action pipeline runs (now without a hard 3-action ceiling).
 */
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

  const planned = planTasks(trimmed, { language: s.settings.language });
  if (shouldUseOrchestrator(planned)) {
    step(
      planned.length === 1
        ? "Working on your request"
        : `Planning ${planned.length} tasks`,
    );
    const finished = await runTaskGraph(planned, {
      shouldContinue: () => id === runId,
      onStep: (msg) => step(msg),
    });
    if (id !== runId) return;

    const spoken = synthesizeReply(finished);
    const actions = collectPhoneActions(finished);

    step("Putting it together");
    store().addMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: spoken,
      at: Date.now(),
      actions: actions.length ? actions : undefined,
      trace: store().steps.slice(-8),
    });
    await speak(spoken, id);
    return;
  }

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
    step(
      `Working out ${reply.actions.length === 1 ? "an action" : `${reply.actions.length} actions`} on the phone`,
    );
    const results = await runPhoneActions(reply.actions, {
      shouldContinue: () => id === runId,
      onAction: (a) => step(`Doing: ${actionLabel(a)}`),
    });
    if (id !== runId) return;

    const okMsgs = results.filter((r) => r.ok).map((r) => r.message);
    const failMsgs = results.filter((r) => !r.ok).map((r) => r.message);
    if (okMsgs.length && !failMsgs.length) {
      spoken = okMsgs.join(" ");
    } else if (failMsgs.length && !okMsgs.length) {
      spoken = failMsgs.join(" ");
    } else if (okMsgs.length || failMsgs.length) {
      spoken = [...okMsgs, ...failMsgs].join(" ");
    }
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

  await speak(spoken, id);
}

function buildGreeting(): string {
  return `${timeGreeting()}. I am ETA, your everyday task assistant.`;
}

export async function greetOnce() {
  const s = store();
  if (s.settings.onboarded || s.listen !== "idle") return;
  s.setOnboarded();
  await speak(buildGreeting(), ++runId);
}

export async function speak(text: string, id: number = ++runId) {
  const s = store();
  s.setListen("speaking");
  step("Speaking");
  const vol = Math.max(0.35, s.device.volume / 15);
  const voice = resolveVoiceId(s.settings.voice);
  const language = s.settings.language;

  try {
    if (id !== runId) return;

    const forceOnlineVoice = language !== "en";

    if (s.settings.preferOnDeviceSpeech && !forceOnlineVoice) {
      step("Speaking on this phone");
      await speakWithDevice(text, language, vol, voice);
      return;
    }

    const remote = await speakAether({
      data: {
        accessCode: await accessCode(),
        text,
        voice,
        language,
      },
    });

    if (id !== runId) return;

    if (remote.ok && "audioBase64" in remote && remote.audioBase64) {
      const url = base64ToAudioUrl(remote.audioBase64, remote.mimeType || "audio/mpeg");
      try {
        await playAudioUrl(url, vol);
      } finally {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    step("Online voice busy, using phone voice");
    await speakWithDevice(text, language, vol, voice);
  } catch {
    try {
      await speakWithDevice(text, language, vol, voice);
    } catch {
      /* text stays on screen */
    }
  } finally {
    if (id === runId) {
      store().setSteps([]);
      store().setListen("idle");
    }
  }
}
