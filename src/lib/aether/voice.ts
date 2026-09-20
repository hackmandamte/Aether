export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToAudioUrl(b64: string, mimeType: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function pickRecorderMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

export async function playAudioUrl(url: string, volume = 0.85) {
  const audio = new Audio(url);
  audio.volume = Math.min(1, Math.max(0.15, volume));
  await audio.play();
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Playback failed"));
  });
}

const DEVICE_LANG: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  hi: "hi-IN",
  ar: "ar-SA",
  sw: "sw-KE",
  es: "es-ES",
  pt: "pt-BR",
};

/** True when the phone/browser has its own text-to-speech. */
export function hasDeviceVoice(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speak with the phone's built-in voice. Free, works offline, sounds more robotic. */
export function speakWithDevice(text: string, language: string, volume = 0.85): Promise<void> {
  return new Promise((resolve) => {
    if (!hasDeviceVoice() || !text.trim()) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = DEVICE_LANG[language] ?? "en-US";
    utterance.volume = Math.min(1, Math.max(0.15, volume));
    // Some engines never fire end/error; don't leave the orb stuck on "speaking".
    const guard = window.setTimeout(() => {
      synth.cancel();
      resolve();
    }, 45_000);
    const done = () => {
      window.clearTimeout(guard);
      resolve();
    };
    utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
}
