import { useEffect, useRef, useState } from "react";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function Transcript({ compact = false }: { compact?: boolean }) {
  const messages = useAether((s) => s.messages);
  const error = useAether((s) => s.error);
  const steps = useAether((s) => s.steps);
  const listen = useAether((s) => s.listen);
  const bottom = useRef<HTMLDivElement>(null);
  const [greeting] = useState(timeGreeting);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, error, steps.length, listen]);

  if (!messages.length && !error) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col px-6 transition-[justify-content,padding] duration-[2000ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          compact ? "justify-start pb-2 pt-1" : "justify-center py-8",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full max-w-lg text-center transition-all duration-[2000ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            compact ? "origin-top scale-[0.92]" : "scale-100",
          )}
        >
          <p
            className={cn(
              "font-display font-semibold tracking-tight text-fg animate-[eta-fade-in_2s_ease-out]",
              compact ? "text-lg sm:text-xl" : "text-[2.15rem] leading-[1.15] sm:text-5xl",
            )}
          >
            {greeting}.
          </p>
          <p
            className={cn(
              "mt-3 font-display font-semibold tracking-tight text-fg animate-[eta-fade-in_2s_ease-out]",
              compact ? "text-base sm:text-lg" : "text-3xl sm:text-4xl",
            )}
          >
            Hello, I am E.T.A.
          </p>
          <p
            className={cn(
              "mx-auto mt-3 max-w-sm text-muted animate-[eta-fade-in_2s_ease-out]",
              compact ? "text-xs" : "text-base leading-relaxed sm:text-lg",
            )}
          >
            Your Everyday Task Assistant.
            <br />
            What do you want to do?
          </p>
        </div>
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
