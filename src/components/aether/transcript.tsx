import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const spring = { type: "spring" as const, stiffness: 280, damping: 28 };

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
      <motion.div
        layout
        transition={spring}
        className={cn(
          "flex flex-1 flex-col px-6",
          compact ? "justify-start pb-2 pt-1" : "justify-center py-8",
        )}
      >
        <motion.div
          layout
          transition={spring}
          className={cn(
            "mx-auto w-full max-w-lg text-center",
            compact ? "origin-top" : "",
          )}
          animate={{
            scale: compact ? 0.92 : 1,
          }}
        >
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.05 }}
            className={cn(
              "font-display font-semibold tracking-tight text-fg",
              compact ? "text-lg sm:text-xl" : "text-[2.15rem] leading-[1.15] sm:text-5xl",
            )}
          >
            {greeting}.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.15 }}
            className={cn(
              "mt-3 font-display font-semibold tracking-tight text-fg",
              compact ? "text-base sm:text-lg" : "text-3xl sm:text-4xl",
            )}
          >
            I am ETA
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.28 }}
            className={cn(
              "mx-auto mt-3 max-w-sm text-muted",
              compact ? "text-xs" : "text-base leading-relaxed sm:text-lg",
            )}
          >
            your everyday task assistant.
            <br />
            What do you want to do?
          </motion.p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <motion.article
            key={m.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring}
            className={cn(
              "max-w-[85%] text-[15px] leading-relaxed",
              m.role === "user"
                ? "ml-auto rounded-2xl rounded-br-md bg-subtle/90 px-4 py-2.5 text-fg shadow-[var(--shadow-border)]"
                : "mr-auto text-fg",
            )}
          >
            <p className={m.role === "assistant" ? "whitespace-pre-wrap" : undefined}>{m.text}</p>
          </motion.article>
        ))}
      </AnimatePresence>

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
