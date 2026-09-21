import {
  AtSign,
  Camera,
  Clock,
  Flashlight,
  Globe,
  Image,
  MapPin,
  MessageCircle,
  Music,
  Play,
  Search,
  Settings,
  Sun,
  Timer,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sendText } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type Suggestion = {
  text: string;
  icon: LucideIcon;
};

/**
 * Full pool — welcome chips are a rotating sample so the screen stays alive.
 * Icons are semantic (Lucide dropped trademark brand marks).
 */
const SUGGESTION_POOL: Suggestion[] = [
  { text: "Turn on the flashlight", icon: Flashlight },
  { text: "Turn off the flashlight", icon: Flashlight },
  { text: "Open WhatsApp", icon: MessageCircle },
  { text: "Open Instagram", icon: Image },
  { text: "Open Facebook", icon: Users },
  { text: "Open YouTube", icon: Play },
  { text: "Open Twitter", icon: AtSign },
  { text: "Open Chrome", icon: Globe },
  { text: "Open Maps", icon: MapPin },
  { text: "Open Settings", icon: Settings },
  { text: "Open the camera", icon: Camera },
  { text: "Open Spotify", icon: Music },
  { text: "Where am I?", icon: MapPin },
  { text: "Search the web for weather", icon: Search },
  { text: "Search the web for news", icon: Globe },
  { text: "Set a timer for five minutes", icon: Timer },
  { text: "Set an alarm for 7 AM", icon: Clock },
  { text: "Brightness to 50 percent", icon: Sun },
  { text: "Volume to 10", icon: Volume2 },
  { text: "Open Wi-Fi settings", icon: Settings },
];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayBlockSeed(now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  // 4 blocks per day → set changes through the day, not only overnight
  const block = Math.floor(now.getHours() / 6);
  return y * 100_000 + m * 1_000 + d * 10 + block;
}

function pickSuggestions(count = 4, now = new Date()): Suggestion[] {
  const rand = mulberry32(dayBlockSeed(now));
  const pool = [...SUGGESTION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function Transcript() {
  const messages = useAether((s) => s.messages);
  const error = useAether((s) => s.error);
  const steps = useAether((s) => s.steps);
  const listen = useAether((s) => s.listen);
  const bottom = useRef<HTMLDivElement>(null);
  const [greeting] = useState(timeGreeting);
  const busy = listen !== "idle";

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const suggestions = useMemo(() => pickSuggestions(4), [tick]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, error, steps.length, listen]);

  if (!messages.length && !error && !steps.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 animate-[eta-fade-in_0.55s_ease-out]">
        <div className="relative mb-8 grid size-28 place-items-center">
          <span className="absolute inset-0 rounded-full bg-accent/10 animate-[eta-pulse_3s_ease-in-out_infinite]" />
          <span className="absolute inset-3 rounded-full bg-accent/15 animate-[eta-pulse_3s_ease-in-out_0.4s_infinite]" />
          <span className="relative size-16 rounded-full bg-gradient-to-br from-[#e8ecf2] to-[#9aa3b2] shadow-[0_0_40px_rgba(215,221,230,0.25)]" />
        </div>

        <p className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
          {greeting}
        </p>
        <p className="mt-2 max-w-[17rem] text-center text-sm leading-relaxed text-muted">
          I'm Eta, your personal mobile assistant. Tap a suggestion, the mic, or type below.
        </p>

        <ul className="mt-8 w-full max-w-sm space-y-2">
          {suggestions.map((hint, i) => {
            const Icon = hint.icon;
            return (
              <li
                key={`${hint.text}-${i}`}
                className="animate-[eta-fade-in_0.5s_ease-out]"
                style={{ animationDelay: `${0.12 + i * 0.06}s`, animationFillMode: "both" }}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendText(hint.text)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-elevated/70 px-4 py-3 text-left text-sm text-muted",
                    "transition-[background-color,border-color,color,transform] duration-150",
                    "hover:border-border-strong hover:bg-subtle hover:text-fg active:scale-[0.98]",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-fg">
                    <Icon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 font-medium leading-snug">{hint.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((m) => (
        <article
          key={m.id}
          className={cn(
            "max-w-[85%] text-[15px] leading-relaxed animate-[eta-fade-in_0.28s_ease-out]",
            m.role === "user"
              ? "ml-auto rounded-2xl rounded-br-md bg-subtle px-4 py-2.5 text-fg"
              : "mr-auto text-fg",
          )}
        >
          <p className={m.role === "assistant" ? "whitespace-pre-wrap" : undefined}>{m.text}</p>
        </article>
      ))}

      {listen !== "idle" && steps.length ? (
        <div className="mr-auto max-w-[85%] text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-muted" />
            {steps[steps.length - 1]}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      ) : null}

      <div ref={bottom} className="h-1 shrink-0" />
    </div>
  );
}
