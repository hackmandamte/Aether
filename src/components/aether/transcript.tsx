import { useEffect, useRef, useState } from "react";
import { sendText } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const SUGGESTIONS = [
  "Turn on the flashlight",
  "Open WhatsApp",
  "Where am I?",
  "Search the web for weather",
] as const;

export function Transcript() {
  const messages = useAether((s) => s.messages);
  const error = useAether((s) => s.error);
  const steps = useAether((s) => s.steps);
  const listen = useAether((s) => s.listen);
  const bottom = useRef<HTMLDivElement>(null);
  const [greeting] = useState(timeGreeting);
  const busy = listen !== "idle";

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
          I'm Eta, your personal mobile assistant. Tap the mic, type below, or try a suggestion.
        </p>

        <ul className="mt-8 w-full max-w-sm space-y-2">
          {SUGGESTIONS.map((hint, i) => (
            <li
              key={hint}
              className="animate-[eta-fade-in_0.5s_ease-out]"
              style={{ animationDelay: `${0.12 + i * 0.06}s`, animationFillMode: "both" }}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendText(hint)}
                className={cn(
                  "w-full rounded-2xl border border-border/70 bg-elevated/70 px-4 py-3 text-center text-sm text-muted",
                  "transition-[background-color,border-color,color,transform] duration-150",
                  "hover:border-border-strong hover:bg-subtle hover:text-fg active:scale-[0.98]",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {hint}
              </button>
            </li>
          ))}
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
