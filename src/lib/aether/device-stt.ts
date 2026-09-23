/**
 * On-device speech-to-text.
 * Order: (1) Vosk offline in the ETA APK  (2) browser / OS SpeechRecognition
 *        (3) caller falls back to online hearAether.
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

type NativeChannel = {
  postMessage: (message: string) => void;
};

declare global {
  interface Window {
    AetherNative?: NativeChannel;
  }
}

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

function hasNativeBridge(): boolean {
  return typeof window !== "undefined" && typeof window.AetherNative?.postMessage === "function";
}

export function hasOnDeviceStt(): boolean {
  return hasNativeBridge() || getSpeechRecognition() !== null;
}

/** Offline Vosk inside the APK (English model ~40MB, no network). */
function recognizeNativeOffline(timeoutMs: number): Promise<string | null> {
  if (!hasNativeBridge()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    let settled = false;
    const finish = (text: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("aether-offline-stt", onEvt as EventListener);
      resolve(text);
    };

    const onEvt = (ev: Event) => {
      try {
        const data = (ev as MessageEvent).data;
        const raw = typeof data === "string" ? data : String(data ?? "");
        const msg = JSON.parse(raw) as {
          id?: string;
          result?: { ok?: boolean; text?: string };
        };
        if (msg.id && msg.id !== id) return;
        const t = msg.result?.text?.trim();
        finish(t || null);
      } catch {
        finish(null);
      }
    };

    window.addEventListener("aether-offline-stt", onEvt as EventListener);
    const timer = window.setTimeout(() => finish(null), timeoutMs + 4000);

    try {
      window.AetherNative!.postMessage(
        JSON.stringify({ id, type: "listen_offline", maxMs: timeoutMs }),
      );
    } catch {
      finish(null);
    }
  });
}

function recognizeWebSpeech(language: string, timeoutMs: number): Promise<string | null> {
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

/**
 * Listen once. Prefer APK Vosk offline, then OS Web Speech, else null
 * (caller uses online STT).
 */
export async function recognizeOnce(language: string, timeoutMs = 12_000): Promise<string | null> {
  if (hasNativeBridge()) {
    const offline = await recognizeNativeOffline(timeoutMs);
    if (offline) return offline;
  }
  return recognizeWebSpeech(language, timeoutMs);
}
