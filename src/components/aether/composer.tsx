import { ArrowUp, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendText, stopEverything, tapOrb } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

export function Composer() {
  const [value, setValue] = useState("");
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
      {status ? (
        <p className="mb-1.5 px-1 text-center text-xs text-muted" aria-live="polite">
          {status}
        </p>
      ) : null}

      <form
        className={cn(
          "flex items-end gap-2 rounded-[1.5rem] bg-elevated px-2 py-2 shadow-[var(--shadow-border)]",
          "transition-shadow duration-200 focus-within:shadow-[var(--shadow-border-hover)]",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          const next = value.trim();
          if (!next || busy) return;
          setValue("");
          void sendText(next);
        }}
      >
        {/* Mic / Stop with pulse while recording */}
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

          <button
            type="button"
            onClick={() => {
              if (busy && !recording) stopEverything();
              else void tapOrb();
            }}
            aria-label={recording ? "Send voice" : busy ? "Stop" : "Tap to speak"}
            className={cn(
              "relative z-10 grid size-11 place-items-center rounded-full transition-[background-color,scale] duration-150 active:scale-95",
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
          </button>
        </div>

        <label className="sr-only" htmlFor="eta-input">
          Message Eta
        </label>
        <textarea
          ref={taRef}
          id="eta-input"
          rows={1}
          value={value}
          disabled={busy}
          placeholder="Message Eta…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-[7.5rem] min-h-[2.75rem] flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-snug text-fg placeholder:text-faint outline-none disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={busy || !value.trim()}
          aria-label="Send"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,scale,opacity] duration-150 active:scale-95",
            value.trim() && !busy
              ? "bg-accent text-accent-fg"
              : "bg-subtle text-faint opacity-50",
          )}
        >
          <ArrowUp className="size-5" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
