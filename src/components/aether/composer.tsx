import {
  ArrowUp,
  AtSign,
  Camera,
  Clock,
  Flashlight,
  Globe,
  Image,
  MapPin,
  MessageCircle,
  Mic,
  Music,
  NotebookPen,
  Play,
  Search,
  Settings,
  Square,
  Sun,
  Timer,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sendText, stopEverything, tapOrb } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

type Suggestion = { text: string; icon: LucideIcon };

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
  { text: "Take notes", icon: NotebookPen },
  { text: "Where am I?", icon: MapPin },
  { text: "Search the web for weather", icon: Search },
  { text: "Set a timer for five minutes", icon: Timer },
  { text: "Set an alarm for 7 AM", icon: Clock },
  { text: "Brightness to 50 percent", icon: Sun },
  { text: "Volume to 10", icon: Volume2 },
];

function pickSuggestions(count = 4): Suggestion[] {
  const pool = [...SUGGESTION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const spring = { type: "spring" as const, stiffness: 400, damping: 28 };

export function Composer({
  showActions = false,
  onKeyboard,
}: {
  showActions?: boolean;
  onKeyboard?: (open: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [suggestions] = useState(() => pickSuggestions(4));
  const listen = useAether((s) => s.listen);
  const steps = useAether((s) => s.steps);
  const busy = listen !== "idle";
  const recording = listen === "recording";
  const speaking = listen === "speaking";
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const status =
    listen === "recording"
      ? "Listening… tap mic when done"
      : listen === "thinking"
        ? (steps[steps.length - 1] ?? "Thinking…")
        : listen === "speaking"
          ? "Speaking…"
          : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-3">
      {showActions ? (
        <ul className="mb-2.5 flex flex-wrap justify-center gap-2">
          {suggestions.map((hint, i) => {
            const Icon = hint.icon;
            return (
              <motion.li
                key={`${hint.text}-${i}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 0.08 + i * 0.05 }}
              >
                <motion.button
                  type="button"
                  disabled={busy}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => void sendText(hint.text)}
                  className={cn(
                    "eta-glass inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-left text-xs font-medium text-fg",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">{hint.text}</span>
                </motion.button>
              </motion.li>
            );
          })}
        </ul>
      ) : null}

      {status ? (
        <p className="mb-1.5 px-1 text-center text-xs text-muted" aria-live="polite">
          {status}
        </p>
      ) : null}

      <motion.form
        layout
        className={cn(
          "eta-glass flex items-end gap-2 rounded-[1.5rem] px-2 py-2",
          "transition-[box-shadow] duration-200 focus-within:shadow-[var(--shadow-border-hover)]",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          const next = value.trim();
          if (!next || busy) return;
          setValue("");
          void sendText(next);
        }}
      >
        <label className="sr-only" htmlFor="eta-input">
          Message Eta
        </label>
        <textarea
          ref={taRef}
          id="eta-input"
          rows={1}
          value={value}
          disabled={busy}
          placeholder="What do you want to do?"
          onFocus={() => onKeyboard?.(true)}
          onBlur={() => onKeyboard?.(false)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-[7.5rem] min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-snug text-fg placeholder:text-faint outline-none disabled:opacity-50"
        />

        <div className="relative grid size-11 shrink-0 place-items-center">
          {recording ? (
            <>
              <span
                className="pointer-events-none absolute inset-0 rounded-full border border-danger/40"
                style={{ animation: "eta-mic-ring 1.4s ease-out infinite" }}
              />
              <span
                className="pointer-events-none absolute inset-0 rounded-full border border-danger/30"
                style={{ animation: "eta-mic-ring 1.4s ease-out 0.35s infinite" }}
              />
            </>
          ) : null}

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (busy && !recording) stopEverything();
              else void tapOrb();
            }}
            aria-label={recording ? "Send voice" : busy ? "Stop" : "Tap to speak"}
            className={cn(
              "relative z-10 grid size-11 place-items-center rounded-full transition-colors duration-150",
              recording
                ? "bg-danger/20 text-danger"
                : busy
                  ? "bg-subtle text-muted"
                  : "bg-accent text-accent-fg",
              recording && "animate-[eta-mic-glow_1.6s_ease-in-out_infinite]",
            )}
          >
            {busy && !recording ? (
              speaking ? (
                <span className="flex h-4 items-end gap-[3px]">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[2.5px] origin-bottom rounded-full bg-current"
                      style={{
                        height: "100%",
                        animation: `aether-speak 0.85s ease-in-out ${i * 0.09}s infinite`,
                      }}
                    />
                  ))}
                </span>
              ) : (
                <Square className="size-3.5 fill-current" />
              )
            ) : (
              <Mic className="size-5" strokeWidth={1.75} />
            )}
          </motion.button>
        </div>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.9 }}
          disabled={busy || !value.trim()}
          aria-label="Send"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150",
            value.trim() && !busy
              ? "bg-accent text-accent-fg"
              : "bg-subtle text-faint opacity-50",
          )}
        >
          <ArrowUp className="size-5" strokeWidth={2} />
        </motion.button>
      </motion.form>
    </div>
  );
}
