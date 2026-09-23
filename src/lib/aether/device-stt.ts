/**
 * On-device speech-to-text via the phone / browser engine
 * (Android WebView + Google SpeechRecognizer when available).
 * No extra model download — uses the OS voice stack already on the device.
 */

const DEVICE_LANG: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  hi: "hi-IN",
  ar: "ar-SA",
  sw: "sw-KE",
  es: "es-ES",
  pt: "pt-BR",
};

type SpeechRecCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: {
    results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean }; length: number };
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function hasOnDeviceStt(): boolean {
  return getSpeechRecognition() !== null;
}

/**
 * Listen once with the device STT engine. Resolves with transcript or null.
 * Caller should already have mic permission.
 */
export function recognizeOnce(language: string, timeoutMs = 12_000): Promise<string | null> {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (text: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      resolve(text);
    };

    const rec = new Ctor();
    rec.lang = DEVICE_LANG[language] ?? language ?? "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    rec.onresult = (ev) => {
      const t = ev.results?.[0]?.[0]?.transcript?.trim();
      finish(t || null);
    };
    rec.onerror = () => finish(null);
    rec.onend = () => {
      if (!settled) finish(null);
    };

    try {
      rec.start();
    } catch {
      finish(null);
    }
  });
}
