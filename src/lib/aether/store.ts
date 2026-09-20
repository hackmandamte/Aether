import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatMessage,
  LanguageId,
  NoteItem,
  PhoneAction,
  ReminderItem,
  TabId,
  TimerItem,
  VoiceId,
} from "./types";

export type ListenMode = "idle" | "recording" | "thinking" | "speaking";

type Settings = {
  voice: VoiceId;
  language: LanguageId;
  wakeEnabled: boolean;
  onboarded: boolean;
};

type Device = {
  flashlight: boolean;
  volume: number;
  brightness: number;
  cameraOpen: boolean;
};

type AetherState = {
  settings: Settings;
  device: Device;
  tab: TabId;
  listen: ListenMode;
  messages: ChatMessage[];
  notes: NoteItem[];
  reminders: ReminderItem[];
  timers: TimerItem[];
  lastAction: string | null;
  error: string | null;
  setTab: (tab: TabId) => void;
  setListen: (listen: ListenMode) => void;
  setVoice: (voice: VoiceId) => void;
  setLanguage: (language: LanguageId) => void;
  setWakeEnabled: (wakeEnabled: boolean) => void;
  setOnboarded: () => void;
  patchDevice: (patch: Partial<Device>) => void;
  addMessage: (msg: ChatMessage) => void;
  addNote: (text: string) => NoteItem;
  addReminder: (text: string, when: number) => ReminderItem;
  addTimer: (label: string, seconds: number) => TimerItem;
  removeTimer: (id: string) => void;
  toggleReminder: (id: string) => void;
  deleteNote: (id: string) => void;
  setLastAction: (text: string | null) => void;
  setError: (error: string | null) => void;
  rememberActions: (actions: PhoneAction[]) => void;
};

const MAX_MESSAGES = 24;

export const useAether = create<AetherState>()(
  persist(
    (set) => ({
      settings: {
        voice: "eve",
        language: "en",
        wakeEnabled: false,
        onboarded: false,
      },
      device: {
        flashlight: false,
        volume: 11,
        brightness: 70,
        cameraOpen: false,
      },
      tab: "assist",
      listen: "idle",
      messages: [],
      notes: [],
      reminders: [],
      timers: [],
      lastAction: null,
      error: null,
      setTab: (tab) => set({ tab }),
      setListen: (listen) => set({ listen }),
      setVoice: (voice) =>
        set((s) => ({ settings: { ...s.settings, voice } })),
      setLanguage: (language) =>
        set((s) => ({ settings: { ...s.settings, language } })),
      setWakeEnabled: (wakeEnabled) =>
        set((s) => ({ settings: { ...s.settings, wakeEnabled } })),
      setOnboarded: () =>
        set((s) => ({ settings: { ...s.settings, onboarded: true } })),
      patchDevice: (patch) =>
        set((s) => ({ device: { ...s.device, ...patch } })),
      addMessage: (msg) =>
        set((s) => ({
          messages: [...s.messages, msg].slice(-MAX_MESSAGES),
        })),
      addNote: (text) => {
        const item: NoteItem = {
          id: crypto.randomUUID(),
          text,
          at: Date.now(),
        };
        set((s) => ({ notes: [item, ...s.notes].slice(0, 80) }));
        return item;
      },
      addReminder: (text, when) => {
        const item: ReminderItem = {
          id: crypto.randomUUID(),
          text,
          at: Date.now(),
          when,
          done: false,
        };
        set((s) => ({ reminders: [item, ...s.reminders].slice(0, 80) }));
        return item;
      },
      addTimer: (label, seconds) => {
        const item: TimerItem = {
          id: crypto.randomUUID(),
          label,
          seconds,
          endsAt: Date.now() + seconds * 1000,
        };
        set((s) => ({ timers: [...s.timers, item] }));
        return item;
      },
      removeTimer: (id) =>
        set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),
      toggleReminder: (id) =>
        set((s) => ({
          reminders: s.reminders.map((r) =>
            r.id === id ? { ...r, done: !r.done } : r,
          ),
        })),
      deleteNote: (id) =>
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      setLastAction: (lastAction) => set({ lastAction }),
      setError: (error) => set({ error }),
      rememberActions: () => undefined,
    }),
    {
      name: "aether-v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (s) => ({
        settings: s.settings,
        device: {
          flashlight: false,
          volume: s.device.volume,
          brightness: s.device.brightness,
          cameraOpen: false,
        },
        messages: s.messages.slice(-16),
        notes: s.notes,
        reminders: s.reminders,
      }),
    },
  ),
);
