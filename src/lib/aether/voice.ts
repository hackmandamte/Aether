import { VOICES, resolveVoiceId, type VoiceId } from "./types";

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

let currentAudio: HTMLAudioElement | null = null;

export async function playAudioUrl(url: string, volume = 0.85) {
  stopAudio();
  const audio = new Audio(url);
  audio.volume = Math.min(1, Math.max(0.15, volume));
  currentAudio = audio;
  try {
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => reject(new Error("Playback failed"));
    });
  } finally {
    if (currentAudio === audio) currentAudio = null;
  }
}

export function stopAudio() {
  const audio = currentAudio;
  currentAudio = null;
  if (audio) audio.pause();
}

export function stopDeviceVoice() {
  if (hasDeviceVoice()) window.speechSynthesis.cancel();
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

export function hasDeviceVoice(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Wait until the OS exposes voices (Android often returns [] on the first call). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!hasDeviceVoice()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    // Kick engines that need a touch
    void synth.getVoices();
    window.setTimeout(finish, 800);
  });
}

function scoreVoice(
  v: SpeechSynthesisVoice,
  lang: string,
  gender: "female" | "male" | "neutral",
): number {
  const name = `${v.name} ${v.lang}`.toLowerCase();
  let score = 0;
  if (v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2))) score += 10;
  if (v.lang.toLowerCase() === lang.toLowerCase()) score += 6;
  if (v.default) score += 2;

  const femaleHints = ["female", "woman", "zira", "samantha", "karen", "moira", "fiona", "tessa", "veena", "google us english female", "en-us-x-sfg"];
  const maleHints = ["male", "man", "david", "mark", "daniel", "alex", "fred", "google us english male", "en-us-x-tpd"];

  if (gender === "female") {
    if (femaleHints.some((h) => name.includes(h))) score += 8;
    if (maleHints.some((h) => name.includes(h))) score -= 6;
  } else if (gender === "male") {
    if (maleHints.some((h) => name.includes(h))) score += 8;
    if (femaleHints.some((h) => name.includes(h))) score -= 6;
  }

  // Prefer local / higher quality when labeled
  if (name.includes("enhanced") || name.includes("premium") || name.includes("neural")) score += 3;
  if (v.localService) score += 1;
  return score;
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
  gender: "female" | "male" | "neutral",
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const lang = DEVICE_LANG[language] ?? language ?? "en-US";
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoice(v, lang, gender);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

/**
 * Speak with the phone's built-in TTS.
 * Applies selected voice profile (gender preference + rate/pitch mood).
 */
export async function speakWithDevice(
  text: string,
  language: string,
  volume = 0.85,
  voiceId: VoiceId | string = "warm-f",
): Promise<void> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!hasDeviceVoice() || !clean) return;

  const profile =
    VOICES.find((v) => v.id === resolveVoiceId(voiceId)) ?? VOICES.find((v) => v.id === "warm-f")!;

  const synth = window.speechSynthesis;
  // cancel() then immediate speak() is flaky on Android WebView — pause briefly
  synth.cancel();
  await new Promise((r) => window.setTimeout(r, 60));

  const voices = await loadVoices();
  const chosen = pickVoice(voices, language, profile.gender);

  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = chosen?.lang || DEVICE_LANG[language] || "en-US";
    if (chosen) utterance.voice = chosen;
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = Math.min(1, Math.max(0.2, volume));

    const guard = window.setTimeout(() => {
      synth.cancel();
      resolve();
    }, Math.min(60_000, 2_000 + clean.length * 80));

    const done = () => {
      window.clearTimeout(guard);
      resolve();
    };
    utterance.onend = done;
    utterance.onerror = done;

    try {
      synth.speak(utterance);
      // Chrome bug: paused synthesis after tab background — resume
      if (synth.paused) synth.resume();
    } catch {
      done();
    }
  });
}

/** One-shot warm-up so the first real reply isn't silent on Android. */
export function warmUpDeviceVoice() {
  if (!hasDeviceVoice()) return;
  void loadVoices();
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.rate = 2;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
