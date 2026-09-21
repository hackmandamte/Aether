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
let serverVoice = true;

function stopStream() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

function clearRecorderState() {
  recorder = null;
  chunks = [];
}

export async function startRecording() {
  const mime = pickRecorderMime();
  stopStream();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  });
  chunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(100);
  useAether.getState().setListen("recording");
  useAether.getState().setError(null);
}

export async function cancelRecording() {
  const active = recorder;
  if (active && active.state !== "inactive") {
    try {
      active.stop();
    } catch {
      // ignore stop exceptions; the next cleanup path resets UI state.
    }
  }
  clearRecorderState();
  stopStream();
  useAether.getState().setListen("idle");
}

async function accessCode(): Promise<string> {
  return (await getNativeAccessCode()) || getAccessCode();
}

function fail(message: string) {
  const store = useAether.getState();
  clearRecorderState();
  stopStream();
  store.setListen("idle");
  store.setError(message);
}

const OFFLINE = "Couldn't reach Aether. Check your connection.";

export async function finishRecordingAndReply() {
  try {
    const blob = await stopRecorder();
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

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night. I'm Aether. I'm ready when you are.";
  if (hour < 12) return "Good morning. I'm Aether. I'm ready when you are.";
  if (hour < 18) return "Good afternoon. I'm Aether. I'm ready when you are.";
  return "Good evening. I'm Aether. I'm ready when you are.";
}

const GREETING = "Hi, I'm Aether, your personal assistant. Hold the disc and talk to me, or long-press Home.";

export async function greetOnce() {
  const store = useAether.getState();
  if (store.settings.onboarded) return;
  store.setOnboarded();
  const greeting = getTimeGreeting();
  store.addMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: greeting,
    at: Date.now(),
  });
  await speak(greeting);
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
    await speakWithDevice(text, store.settings.language, vol);
  } catch {
    /* autoplay or network — text is already on screen */
  } finally {
    useAether.getState().setListen("idle");
  }
}

function stopRecorder(): Promise<Blob | null> {
  const current = recorder;
  if (!current || current.state === "inactive") {
    clearRecorderState();
    stopStream();
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const type = current.mimeType || "audio/webm";
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearRecorderState();
      stopStream();
      try {
        current.onstop = null;
        current.onerror = null;
      } catch {
        // ignore cleanup errors on Android WebView
      }
      resolve(blob && blob.size > 0 ? blob : null);
    };

    const fallback = () => {
      const blob = new Blob(chunks, { type });
      finish(blob.size > 0 ? blob : null);
    };

    const timeout = window.setTimeout(() => {
      try {
        if (current.state !== "inactive") current.stop();
      } catch {
        // ignore stop errors; the timeout fallback resolves anyway.
      }
      fallback();
    }, 1500);

    current.onstop = () => {
      window.clearTimeout(timeout);
      fallback();
    };
    current.onerror = () => {
      window.clearTimeout(timeout);
      fallback();
    };

    try {
      current.stop();
    } catch {
      window.clearTimeout(timeout);
      fallback();
    }
  });
}
