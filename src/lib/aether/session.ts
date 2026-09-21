import { getAccessCode } from "./access";
import { askAether, hearAether, speakAether, toChatPayload } from "./ai";
import { getNativeAccessCode, runPhoneActions } from "./native";
import { useAether } from "./store";
import {
  base64ToAudioUrl,
  blobToBase64,
  pickRecorderMime,
  playAudioUrl,
  speakWithDevice,
} from "./voice";

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;
let playingUrl: string | null = null;
// Flips to false once the server says it has no voice, so we stop asking every turn.
let serverVoice = true;

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function startRecording() {
  const mime = pickRecorderMime();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  });
  chunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start();
  useAether.getState().setListen("recording");
  useAether.getState().setError(null);
}

export async function cancelRecording() {
  try {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  } catch {
    /* ignore */
  }
  recorder = null;
  chunks = [];
  stopStream();
  useAether.getState().setListen("idle");
}

/** The app's built-in code if there is one, otherwise whatever was typed into Settings. */
async function accessCode(): Promise<string> {
  return (await getNativeAccessCode()) || getAccessCode();
}

/** Back to idle with a message the user can read. */
function fail(message: string) {
  const store = useAether.getState();
  store.setListen("idle");
  store.setError(message);
}

const OFFLINE = "Couldn't reach Aether. Check your connection.";

export async function finishRecordingAndReply() {
  try {
    const blob = await stopRecorder();
    stopStream();
    if (!blob || blob.size < 800) {
      fail("Hold a little longer, then speak.");
      return;
    }
    useAether.getState().setListen("thinking");
    const b64 = await blobToBase64(blob);
    const language = useAether.getState().settings.language;
    const heard = await hearAether({
      data: {
        accessCode: await accessCode(),
        audioBase64: b64,
        mimeType: blob.type || "audio/webm",
        language,
      },
    });
    if (!heard.ok) {
      fail(heard.error);
      return;
    }
    await sendText(heard.text);
  } catch {
    stopStream();
    fail(OFFLINE);
  }
}

export async function sendText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const store = useAether.getState();
  store.setError(null);
  store.addMessage({
    id: crypto.randomUUID(),
    role: "user",
    text: trimmed,
    at: Date.now(),
  });
  store.setListen("thinking");

  let reply: Awaited<ReturnType<typeof askAether>>;
  try {
    reply = await askAether({
      data: {
        accessCode: await accessCode(),
        messages: toChatPayload(useAether.getState().messages),
        language: store.settings.language,
      },
    });
  } catch {
    fail(OFFLINE);
    return;
  }

  if (!reply.ok) {
    fail(reply.error);
    return;
  }

  let spoken = reply.text;
  if (reply.actions.length) {
    const results = await runPhoneActions(reply.actions);
    const failed = results.filter((r) => !r.ok).map((r) => r.message);
    if (failed.length) spoken = `${spoken} ${failed.join(" ")}`;
  }

  useAether.getState().addMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: spoken,
    at: Date.now(),
    actions: reply.actions,
  });

  await speak(spoken);
}

const GREETING =
  "Hi, I'm Aether, your personal assistant. Hold the disc and talk to me, or long-press Home.";

/** First launch inside the app: say hello once, then get out of the way. */
export async function greetOnce() {
  const store = useAether.getState();
  if (store.settings.onboarded) return;
  store.setOnboarded();
  store.addMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: GREETING,
    at: Date.now(),
  });
  await speak(GREETING);
}

export async function speak(text: string) {
  const store = useAether.getState();
  store.setListen("speaking");
  const vol = Math.max(0.2, store.device.volume / 15);
  try {
    if (serverVoice) {
      const voice = await speakAether({
        data: {
          accessCode: await accessCode(),
          text,
          voice: store.settings.voice,
          language: store.settings.language,
        },
      });
      if (voice.ok) {
        if (playingUrl) URL.revokeObjectURL(playingUrl);
        playingUrl = base64ToAudioUrl(voice.audioBase64, voice.mimeType);
        await playAudioUrl(playingUrl, vol);
        return;
      }
      if ("device" in voice && voice.device) serverVoice = false;
    }
    // No server voice (free provider) or it failed: use the phone's own voice.
    await speakWithDevice(text, store.settings.language, vol);
  } catch {
    /* autoplay or network — text is already on screen */
  } finally {
    useAether.getState().setListen("idle");
  }
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
