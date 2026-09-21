import { useAether } from "@/lib/aether/store";
import { cn, formatClock } from "@/lib/utils";
import { useEffect, useRef } from "react";

export function Transcript() {
  const messages = useAether((s) => s.messages);
  const error = useAether((s) => s.error);
  const steps = useAether((s) => s.steps);
  const listen = useAether((s) => s.listen);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, error, steps.length]);

  if (!messages.length && !error && !steps.length) {
    return (
      <div className="flex flex-1 flex-col justify-end px-1 py-6">
        <p className="max-w-[18ch] font-display text-3xl font-medium leading-tight tracking-[-0.03em] text-fg">
          Tap the disc. Talk like you would to a person.
        </p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Try “turn on the flashlight”, “text mama I’ll be late”, or “set a timer
          for five minutes”.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
      {messages.map((m) => (
        <article
          key={m.id}
          className={cn(
            "max-w-[92%] rounded-[20px] px-4 py-3 text-sm leading-relaxed",
            m.role === "user"
              ? "ml-auto rounded-br-sm bg-subtle text-fg"
              : "mr-auto rounded-bl-sm bg-elevated text-fg shadow-[var(--shadow-border)]",
          )}
        >
          <p>{m.text}</p>
          {m.role === "assistant" && m.trace && m.trace.length > 1 ? (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer select-none">How I got this</summary>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                {m.trace.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </details>
          ) : null}
          <time className="mt-1.5 block text-[11px] text-faint tabular-nums">
            {formatClock(new Date(m.at))}
          </time>
        </article>
      ))}
      {listen !== "idle" && steps.length ? (
        <div className="mr-auto max-w-[92%] rounded-[20px] rounded-bl-sm bg-subtle px-4 py-3 text-xs text-muted">
          <ol className="space-y-1">
            {steps.map((t, i) => {
              const active = i === steps.length - 1;
              return (
                <li key={i} className={cn("flex gap-2", active ? "text-fg" : "text-faint")}>
                  <span aria-hidden>{active ? "•" : "✓"}</span>
                  <span>{t}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-[16px] bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div ref={bottom} />
    </div>
  );
}
