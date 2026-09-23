import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  LANGUAGES,
  VOICES,
  type ChatMessage,
  type LanguageId,
  type PhoneAction,
  type PhoneActionName,
  type VoiceId,
} from "./types";

const ACTIONS: PhoneActionName[] = [
  "flashlight_on",
  "flashlight_off",
  "volume",
  "brightness",
  "call",
  "sms",
  "alarm",
  "timer",
  "open_app",
  "camera",
  "note",
  "reminder",
  "lock",
  "home",
  "back",
  "wifi",
  "bluetooth",
  "hotspot",
  "type_text",
  "navigate",
  "location",
  "search_web",
  "open_url",
];

const LANG_NAME: Record<LanguageId, string> = {
  en: "English",
  fr: "French",
  hi: "Hindi",
  ar: "Arabic",
  sw: "Swahili",
  es: "Spanish",
  pt: "Portuguese",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "phone_action",
      description:
        "Control the phone. Use this whenever the user wants the phone to do something, not for general knowledge.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ACTIONS },
          value: {
            type: "string",
            description:
              "volume: 0-15. brightness: 0-100. timer: seconds. alarm: HH:MM. wifi/bluetooth/hotspot: on|off. type_text: the exact text to type into the focused field of another app.",
          },
          target: {
            type: "string",
            description: "Phone number, app name, place, note text, search query, URL, or contact/chat name.",
          },
          extra: {
            type: "string",
            description: "SMS body, alarm label, or extra detail.",
          },
        },
        required: ["action"],
      },
    },
  },
];

function systemPrompt(language: LanguageId) {
  const now = new Date().toISOString();
  const name = LANG_NAME[language] ?? "English";
  return `You are Eta (E.T.A), the personal mobile voice assistant on this phone.\n\nCRITICAL LANGUAGE RULE — never break this:\n- The user's selected language is ${name} (code: ${language}).\n- Every spoken reply MUST be written entirely in ${name}.\n- Do NOT answer in English with a ${name} accent. Write real ${name} words and grammar.\n- Only use English if the language code is en.\n- Greetings, confirmations (flashlight on, opening WhatsApp, etc.) must also be in ${name}.\n\nIdentity:\n- Name: Eta.\n- Short, warm, clear. One to three sentences unless they ask for more.\n- No markdown, no emoji walls.\n\nPhone control: call phone_action when they want the phone to DO something.\nActions include: flashlight, volume, brightness, call, sms, alarm, timer, open_app (any app), camera, note, reminder, lock, home, back, wifi (value on/off), bluetooth (on/off), hotspot (on/off), type_text (value = text to type into the currently focused field of another app), navigate, location, search_web, open_url.\n\nOnly act on the latest user request.\n\nCurrent UTC time: ${now}.`;
}

const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [LanguageId, ...LanguageId[]];
const VOICE_IDS = VOICES.map((v) => v.id) as [VoiceId, ...VoiceId[]];

const accessCode = z.string().max(256).default("");

const ChatInput = z.object({
  accessCode,
  language: z.enum(LANGUAGE_IDS),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(2000),
      }),
    )
    .min(1)
    .max(24)
    .refine((m) => m[m.length - 1]?.role === "user", "Last message must be from the user"),
});

const SpeakInput = z.object({
  accessCode,
  text: z.string().max(1200),
  voice: z.enum(VOICE_IDS),
  language: z.enum(LANGUAGE_IDS),
});

const MAX_AUDIO_B64 = 4_000_000;
const MAX_AUDIO_BYTES = 3_000_000;

const HearInput = z.object({
  accessCode,
  audioBase64: z.string().min(1).max(MAX_AUDIO_B64),
  mimeType: z.string().max(100).regex(/^audio\/[a-z0-9.+-]+(;.*)?$/i),
  language: z.enum(LANGUAGE_IDS).optional(),
});

type ChatOutput =
  | { ok: true; text: string; actions: PhoneAction[] }
  | { ok: false; error: string };

async function authorize(code: string) {
  const { authorize: gate } = await import("./guard.server");
  return gate(code);
}

type Upstream = { headers?: Record<string, string>; body: string | FormData };

async function getProvider() {
  const { getProvider: resolve } = await import("./provider.server");
  return resolve();
}

async function callProvider(url: string, key: string | undefined, init: Upstream) {
  if (!key) {
    console.error("[aether] No API key configured for the selected provider");
    return null;
  }
  try {
    return await fetch(url, {
      method: "POST",
      headers: { ...init.headers, Authorization: `Bearer ${key}` },
      body: init.body,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    console.error("[aether] upstream request failed:", err instanceof Error ? err.name : err);
    return null;
  }
}

function describeUpstream(status: number): string {
  if (status === 401) return "The AI key was rejected. Check it on the server.";
  if (status === 402 || status === 403) {
    return "The AI account refused the request (no credit or no access). Check the provider account.";
  }
  if (status === 404) return "The AI model wasn't found. Check LLM_MODEL on the server.";
  if (status === 429) return "The AI service is busy or rate-limited. Try again in a minute.";
  return `Eta's brain hit an error (${status}).`;
}

function fallbackLine(action: PhoneAction, language: LanguageId): string {
  // Minimal English only when language is en; otherwise keep short neutral tokens
  // the model usually supplies its own line in the target language.
  if (language !== "en") {
    switch (action.action) {
      case "flashlight_on":
        return language === "fr"
          ? "Lampe de poche allumée."
          : language === "es"
            ? "Linterna encendida."
            : language === "pt"
              ? "Lanterna ligada."
              : language === "hi"
                ? "फ़्लैशलाइट चालू।"
                : language === "ar"
                  ? "تم تشغيل الفلاش."
                  : language === "sw"
                    ? "Taa ya tochi imewashwa."
                    : "Done.";
      case "flashlight_off":
        return language === "fr"
          ? "Lampe de poche éteinte."
          : language === "es"
            ? "Linterna apagada."
            : language === "pt"
              ? "Lanterna desligada."
              : language === "hi"
                ? "फ़्लैशलाइट बंद।"
                : language === "ar"
                  ? "تم إطفاء الفلاش."
                  : language === "sw"
                    ? "Taa ya tochi imezimwa."
                    : "Done.";
      default:
        return language === "fr"
          ? "C'est fait."
          : language === "es"
            ? "Listo."
            : language === "pt"
              ? "Pronto."
              : language === "hi"
                ? "हो गया।"
                : language === "ar"
                  ? "تم."
                  : language === "sw"
                    ? "Imekamilika."
                    : "Done.";
    }
  }
  switch (action.action) {
    case "flashlight_on":
      return "Flashlight on.";
    case "flashlight_off":
      return "Flashlight off.";
    case "volume":
      return `Volume ${action.value}.`;
    case "brightness":
      return `Brightness ${action.value} percent.`;
    case "call":
      return `Opening the dialer for ${action.target}.`;
    case "sms":
      return `Drafting a text to ${action.target}.`;
    case "alarm":
      return "Alarm set.";
    case "timer":
      return "Timer started.";
    case "open_app":
      return `Opening ${action.target}.`;
    case "camera":
      return "Camera.";
    case "note":
      return "Saved.";
    case "reminder":
      return "Reminder set.";
    case "lock":
      return "Locking.";
    case "home":
      return "Going home.";
    case "back":
      return "Going back.";
    case "wifi":
      return action.value === "off" ? "Wi-Fi off." : "Wi-Fi on.";
    case "bluetooth":
      return action.value === "off" ? "Bluetooth off." : "Bluetooth on.";
    case "hotspot":
      return action.value === "off" ? "Hotspot off." : "Hotspot on.";
    case "type_text":
      return "Typing.";
    case "navigate":
      return `Heading to ${action.target}.`;
    case "location":
      return "Checking your location.";
    case "search_web":
      return `Searching for ${action.target}.`;
    case "open_url":
      return `Opening ${action.target}.`;
    default:
      return "Done.";
  }
}

function clip(raw: unknown, max: number): string | undefined {
  if (typeof raw === "string") return raw.slice(0, max);
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw).slice(0, max);
  return undefined;
}

function parseAction(raw: unknown): PhoneAction | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const action = String(obj.action ?? "");
  if (!ACTIONS.includes(action as PhoneActionName)) return null;
  return {
    action: action as PhoneActionName,
    value: clip(obj.value, 500),
    target: clip(obj.target, 200),
    extra: clip(obj.extra, 500),
  };
}

const MAX_ACTIONS_PER_TURN = 3;

export const askAether = createServerFn({ method: "POST" })
  .inputValidator(ChatInput)
  .handler(async ({ data }): Promise<ChatOutput> => {
    const gate = await authorize(data.accessCode);
    if (!gate.ok) return { ok: false, error: gate.error };

    const provider = await getProvider();
    const request = {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.chatModel,
        max_tokens: 1024,
        temperature: 0.7,
        tools: TOOLS,
        ...(provider.chatModel.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: systemPrompt(data.language) },
          ...data.messages.slice(-12).map((m) => ({ role: m.role, content: m.text })),
        ],
      }),
    };
    let res = await callProvider(provider.chatUrl, provider.key, request);
    if (res?.status === 400) {
      res = await callProvider(provider.chatUrl, provider.key, request);
    }
    if (!res) return { ok: false, error: "Eta's brain is unreachable right now." };
    if (!res.ok) {
      console.error(`[aether] chat (${provider.name}) -> ${res.status}`);
      return { ok: false, error: describeUpstream(res.status) };
    }

    const json = (await res.json().catch(() => ({}))) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
    };

    const message = json.choices?.[0]?.message;
    const actions: PhoneAction[] = [];
    for (const call of message?.tool_calls ?? []) {
      if (actions.length >= MAX_ACTIONS_PER_TURN) break;
      if (call.function?.name !== "phone_action") continue;
      try {
        const parsed = parseAction(JSON.parse(call.function.arguments ?? "{}"));
        if (parsed) actions.push(parsed);
      } catch {
        /* ignore */
      }
    }

    let text = (message?.content ?? "").trim();
    if (!text && actions.length) {
      text = actions.map((a) => fallbackLine(a, data.language)).join(" ");
    }
    if (!text) {
      text =
        data.language === "fr"
          ? "Pouvez-vous répéter ?"
          : data.language === "es"
            ? "¿Puedes repetir?"
            : data.language === "pt"
              ? "Pode repetir?"
              : data.language === "hi"
                ? "फिर से कहें?"
                : data.language === "ar"
                  ? "أعد من فضلك؟"
                  : data.language === "sw"
                    ? "Unaweza kurudia?"
                    : "Say that again?";
    }

    return { ok: true, text: text.slice(0, 1200), actions };
  });

const EDGE_VOICE: Record<VoiceId, string> = {
  "calm-f": "en-US-JennyNeural",
  "warm-f": "en-US-AriaNeural",
  "joyful-f": "en-US-SaraNeural",
  "gentle-f": "en-US-EmmaNeural",
  "clear-m": "en-US-GuyNeural",
  "deep-m": "en-GB-RyanNeural",
  "upbeat-m": "en-US-DavisNeural",
  "serious-m": "en-GB-ThomasNeural",
};

const EDGE_LANG: Record<LanguageId, string> = {
  en: "en-US",
  fr: "fr-FR",
  hi: "hi-IN",
  ar: "ar-SA",
  sw: "sw-KE",
  es: "es-ES",
  pt: "pt-BR",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;")
    .replace(/'/g, "&" + "apos;");
}

/** Real neural voices per language — never fall back to English accent for non-en. */
const LOCALE_EDGE_VOICE: Record<LanguageId, { f: string; m: string }> = {
  en: { f: "en-US-AriaNeural", m: "en-US-GuyNeural" },
  fr: { f: "fr-FR-DeniseNeural", m: "fr-FR-HenriNeural" },
  hi: { f: "hi-IN-SwaraNeural", m: "hi-IN-MadhurNeural" },
  ar: { f: "ar-SA-ZariyahNeural", m: "ar-SA-HamedNeural" },
  // Edge has no Swahili neural voice — online path uses Google Translate TTS for sw
  sw: { f: "en-US-AriaNeural", m: "en-US-GuyNeural" },
  es: { f: "es-ES-ElviraNeural", m: "es-ES-AlvaroNeural" },
  pt: { f: "pt-BR-FranciscaNeural", m: "pt-BR-AntonioNeural" },
};

function edgeVoiceFor(voiceId: VoiceId, language: LanguageId): string {
  const pair = LOCALE_EDGE_VOICE[language] ?? LOCALE_EDGE_VOICE.en;
  const isMale = voiceId.endsWith("-m");
  return isMale ? pair.m : pair.f;
}

async function edgeNeuralTts(
  text: string,
  voiceId: VoiceId,
  language: LanguageId,
): Promise<{ mime: string; b64: string } | null> {
  // Swahili: Edge has no genuine voice — skip so Google path can speak real Swahili
  if (language === "sw") return null;

  const locale = EDGE_LANG[language] ?? "en-US";
  const voice = edgeVoiceFor(voiceId, language);

  const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const endpoint =
    "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
    "?TrustedClientToken=" +
    TOKEN;

  const ssml =
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" +
    locale +
    "'><voice name='" +
    voice +
    "'>" +
    escapeXml(text) +
    "</voice></speak>";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        Referer: "https://www.bing.com/",
      },
      body: ssml,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error("[aether] edge-tts HTTP", res.status);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 200) return null;
    return { mime: "audio/mpeg", b64: buf.toString("base64") };
  } catch (err) {
    console.error("[aether] edge-tts failed", err instanceof Error ? err.message : err);
    return null;
  }
}

function chunkText(text: string, max = 160): string[] {
  const words = text.split(/\s+/);
  const parts: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) parts.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) parts.push(cur.trim());
  return parts.slice(0, 3);
}

async function googleTranslateTts(
  text: string,
  language: LanguageId,
): Promise<{ mime: string; b64: string } | null> {
  const tl = language === "pt" ? "pt" : language;
  const chunks = chunkText(text);
  const buffers: Buffer[] = [];
  for (const part of chunks) {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
      encodeURIComponent(tl) +
      "&q=" +
      encodeURIComponent(part);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
          Referer: "https://translate.google.com/",
        },
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 100) buffers.push(buf);
    } catch {
      /* try next chunk */
    }
  }
  if (!buffers.length) return null;
  return { mime: "audio/mpeg", b64: Buffer.concat(buffers).toString("base64") };
}

async function xaiTts(
  text: string,
  ttsUrl: string,
  key: string | undefined,
): Promise<{ mime: string; b64: string } | null> {
  if (!key) return null;
  const res = await callProvider(ttsUrl, key, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.TTS_MODEL ?? "grok-tts",
      input: text,
      voice: "alloy",
    }),
  });
  if (!res || !res.ok) {
    if (res) console.error("[aether] xai tts", res.status);
    return null;
  }
  const ctype = res.headers.get("content-type") ?? "audio/mpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 100) return null;
  return { mime: ctype.split(";")[0], b64: buf.toString("base64") };
}

export const speakAether = createServerFn({ method: "POST" })
  .inputValidator(SpeakInput)
  .handler(async ({ data }) => {
    const gate = await authorize(data.accessCode);
    if (!gate.ok) return { ok: false as const, error: gate.error };

    const text = data.text.replace(/[#*_`]/g, "").trim().slice(0, 280);
    if (!text) return { ok: false as const, error: "Nothing to say." };

    // Non-English: online neural first so we never fake the language with an accent
    if (data.language === "sw") {
      const fromGoogle = await googleTranslateTts(text, data.language);
      if (fromGoogle) {
        return {
          ok: true as const,
          audioBase64: fromGoogle.b64,
          mimeType: fromGoogle.mime,
          source: "google" as const,
        };
      }
    }

    const fromEdge = await edgeNeuralTts(text, data.voice, data.language);
    if (fromEdge) {
      return {
        ok: true as const,
        audioBase64: fromEdge.b64,
        mimeType: fromEdge.mime,
        source: "edge" as const,
      };
    }

    const fromGoogle = await googleTranslateTts(text, data.language);
    if (fromGoogle) {
      return {
        ok: true as const,
        audioBase64: fromGoogle.b64,
        mimeType: fromGoogle.mime,
        source: "google" as const,
      };
    }

    const provider = await getProvider();
    if (provider.ttsUrl && data.language === "en") {
      const fromXai = await xaiTts(text, provider.ttsUrl, provider.key);
      if (fromXai) {
        return {
          ok: true as const,
          audioBase64: fromXai.b64,
          mimeType: fromXai.mime,
          source: "xai" as const,
        };
      }
    }

    return { ok: false as const, error: "Online voice is offline. Check connection." };
  });

export const hearAether = createServerFn({ method: "POST" })
  .inputValidator(HearInput)
  .handler(async ({ data }) => {
    const gate = await authorize(data.accessCode);
    if (!gate.ok) return { ok: false as const, error: gate.error };

    const bytes = Buffer.from(data.audioBase64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
      return { ok: false as const, error: "Clip is too long. Keep it under 20 seconds." };
    }

    const mime = data.mimeType.split(";")[0].toLowerCase();
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `speech.${ext}`);
    const provider = await getProvider();
    form.append("model", provider.sttModel);
    if (data.language) form.append("language", data.language);

    const res = await callProvider(provider.sttUrl, provider.key, { body: form });
    if (!res) return { ok: false as const, error: "Listening is unavailable." };
    if (!res.ok) {
      console.error(`[aether] stt (${provider.name}) -> ${res.status}`);
      return { ok: false as const, error: describeUpstream(res.status) };
    }

    const json = (await res.json().catch(() => ({}))) as { text?: string };
    const text = (json.text ?? "").trim();
    if (!text) return { ok: false as const, error: "I didn't catch that." };
    return { ok: true as const, text };
  });

export function toChatPayload(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", text: m.text.slice(0, 2000) }));
}
