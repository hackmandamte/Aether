export const VOICES = [
  { id: "calm-f", label: "Calm", gender: "female", tone: "Soft, steady", rate: 0.92, pitch: 1.0 },
  { id: "warm-f", label: "Warm", gender: "female", tone: "Friendly", rate: 1.0, pitch: 1.05 },
  { id: "joyful-f", label: "Joyful", gender: "female", tone: "Bright, upbeat", rate: 1.1, pitch: 1.18 },
  { id: "gentle-f", label: "Gentle", gender: "female", tone: "Quiet, soft", rate: 0.88, pitch: 0.95 },
  { id: "clear-m", label: "Clear", gender: "male", tone: "Neutral male", rate: 1.0, pitch: 1.0 },
  { id: "deep-m", label: "Deep", gender: "male", tone: "Low, steady", rate: 0.94, pitch: 0.82 },
  { id: "upbeat-m", label: "Upbeat", gender: "male", tone: "Energetic", rate: 1.08, pitch: 1.08 },
  { id: "serious-m", label: "Serious", gender: "male", tone: "Grave", rate: 0.9, pitch: 0.78 },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function resolveVoiceId(raw: string | undefined | null): VoiceId {
  if (raw && VOICES.some((v) => v.id === raw)) return raw as VoiceId;
  if (raw === "eve" || raw === "ara") return "warm-f";
  if (raw === "rex" || raw === "leo") return "deep-m";
  if (raw === "sal") return "clear-m";
  return "warm-f";
}

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "fr", label: "French" },
  { id: "hi", label: "Hindi" },
  { id: "ar", label: "Arabic" },
  { id: "sw", label: "Swahili" },
  { id: "es", label: "Spanish" },
  { id: "pt", label: "Portuguese" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

/** @deprecated tabs removed — kept for persist migration */
export type TabId = "assist" | "device" | "notes" | "install";

export type PhoneActionName =
  | "flashlight_on"
  | "flashlight_off"
  | "volume"
  | "brightness"
  | "call"
  | "sms"
  | "alarm"
  | "timer"
  | "open_app"
  | "camera"
  | "note"
  | "reminder"
  | "lock"
  | "home"
  | "back"
  | "wifi"
  | "bluetooth"
  | "hotspot"
  | "type_text"
  | "navigate"
  | "location"
  | "search_web"
  | "open_url";

export type PhoneAction = {
  action: PhoneActionName;
  value?: string | number;
  target?: string;
  extra?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: number;
  actions?: PhoneAction[];
  trace?: string[];
};

export type NoteItem = {
  id: string;
  text: string;
  at: number;
};

export type ReminderItem = {
  id: string;
  text: string;
  at: number;
  when: number;
  done: boolean;
};

export type TimerItem = {
  id: string;
  label: string;
  endsAt: number;
  seconds: number;
};

export type ActionResult = {
  ok: boolean;
  message: string;
  native: boolean;
};
