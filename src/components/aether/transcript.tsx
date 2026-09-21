import { useEffect, useRef, useState } from "react";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function Transcript() {
  const messages = useAether((s) => s.messages);
  const error = useAether((s) => s.error);
  const steps = useAether((s) => s.steps);
  const listen = useAether((s) => s.listen);
  const bottom = useRef<HTMLDivElement>(null);
  const [greeting] = useState(timeGreeting);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, error, steps.length, listen]);

  if (!messages.length && !error && !steps.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 animate-[eta-fade-in_0.5s_ease-out]">
        <p className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
          {greeting}
        </p>
        <p className="mt-2 max-w-[16rem] text-center text-sm leading-relaxed text-muted">
          I'm Eta, your personal mobile assistant. Tap the mic or type below.
        </p>
        <ul className="mt-8 w-full max-w-sm space-y-2">
          {[
            "Turn on the flashlight",
            "Set a timer for five minutes",
            "What can you do?",
          ].map((hint) => (
            <li
              key={hint}
              className="rounded-2xl border border-border/80 bg-elevated/60 px-4 py-3 text-center text-sm text-muted"
            >
              {hint}
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
            "max-w-[85%] text-[15px] leading-relaxed",
            m.role === "user"
              ? "ml-auto rounded-2xl rounded-br-md bg-subtle px-4 py-2.5 text-fg"
              : "mr-auto text-fg",
          )}
        >
          {m.role === "assistant" ? (
            <p className="whitespace-pre-wrap">{m.text}</p>
          ) : (
            <p>{m.text}</p>
          )}
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
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div ref={bottom} className="h-1 shrink-0" />
    </div>
  );
}
