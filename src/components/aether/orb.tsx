import { Mic, Square } from "lucide-react";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

export function Orb({ onTap, onStop }: { onTap: () => void; onStop: () => void }) {
  const listen = useAether((s) => s.listen);
  const steps = useAether((s) => s.steps);
  const busy = listen !== "idle";

  const label =
    listen === "recording"
      ? "Listening. Tap when you're done"
      : listen === "thinking"
        ? "Thinking"
        : listen === "speaking"
          ? "Speaking"
          : "Tap to speak";

  // The newest step tells the user exactly what is happening right now.
  const detail = busy ? steps[steps.length - 1] : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        aria-label={label}
        onClick={onTap}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative grid size-[7.5rem] touch-manipulation select-none place-items-center rounded-full",
          "bg-elevated shadow-[var(--shadow-border)]",
          "transition-[scale,box-shadow] duration-150 ease-out active:scale-[0.97]",
          "focus-visible:ring-2 focus-visible:ring-ring/70",
          listen === "recording" && "scale-[1.03]",
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute inset-[-10px] rounded-full border border-border",
            listen === "recording" && "animate-[aether-breathe_1.8s_ease-in-out_infinite]",
            listen === "speaking" && "border-accent/40",
          )}
        />
        <span className="grid size-[5.25rem] place-items-center rounded-full bg-accent text-accent-fg">
          {listen === "speaking" ? (
            <span className="flex h-7 items-end gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-[3px] origin-bottom rounded-full bg-accent-fg"
                  style={{
                    height: "100%",
                    animation: `aether-speak 0.9s ease-in-out ${i * 0.08}s infinite`,
                  }}
                />
              ))}
            </span>
          ) : listen === "thinking" ? (
            <span
              className="text-xs font-medium tracking-wide"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-accent-fg) 55%, transparent), transparent)",
                backgroundSize: "200% 100%",
                animation: "aether-shimmer 1.2s linear infinite",
                WebkitBackgroundClip: "text",
              }}
            >
              …
            </span>
          ) : (
            <Mic className="size-7" strokeWidth={1.75} />
          )}
        </span>
      </button>

      <p className="text-sm text-muted">{label}</p>
      {detail ? (
        <p className="max-w-[16rem] text-center text-xs text-faint" aria-live="polite">
          {detail}
        </p>
      ) : null}

      {busy ? (
        <button
          type="button"
          onClick={onStop}
          className="flex h-11 items-center gap-2 rounded-full bg-danger/10 px-5 text-sm font-medium text-danger active:scale-[0.97]"
          aria-label="Stop"
        >
          <Square className="size-3.5 fill-current" />
          Stop
        </button>
      ) : null}
    </div>
  );
}
