export const VOICES = [
  { id: "eve", label: "Eve", tone: "Warm, female" },
  { id: "ara", label: "Ara", tone: "Calm, female" },
  { id: "rex", label: "Rex", tone: "Bold, male" },
  { id: "leo", label: "Leo", tone: "Deep, male" },
  { id: "sal", label: "Sal", tone: "Neutral" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

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
  | "navigate";

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
