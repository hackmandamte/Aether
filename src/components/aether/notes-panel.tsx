import { Clock, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAether } from "@/lib/aether/store";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/utils";

function useNow(tick = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tick);
    return () => window.clearInterval(id);
  }, [tick]);
  return now;
}

export function NotesPanel() {
  const notes = useAether((s) => s.notes);
  const reminders = useAether((s) => s.reminders);
  const timers = useAether((s) => s.timers);
  const addNote = useAether((s) => s.addNote);
  const addReminder = useAether((s) => s.addReminder);
  const addTimer = useAether((s) => s.addTimer);
  const deleteNote = useAether((s) => s.deleteNote);
  const toggleReminder = useAether((s) => s.toggleReminder);
  const removeTimer = useAether((s) => s.removeTimer);
  const [draft, setDraft] = useState("");
  const now = useNow();

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto pb-4">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
          On this phone
        </p>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-[-0.03em]">
          Notes & time
        </h2>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          addNote(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A note to keep"
          className="h-11 flex-1 rounded-[var(--radius-md)] bg-elevated px-3.5 text-sm shadow-[var(--shadow-border)] outline-none placeholder:text-faint"
        />
        <Button type="submit">Save</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="quiet"
          size="sm"
          onClick={() => addTimer("5 minutes", 300)}
        >
          <Clock className="size-4" /> 5 min
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={() => addTimer("10 minutes", 600)}
        >
          10 min
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={() =>
            addReminder("Check back", Date.now() + 60 * 60 * 1000)
          }
        >
          Remind in 1h
        </Button>
      </div>

      {timers.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
            Timers
          </h3>
          {timers.map((t) => {
            const left = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
            const m = Math.floor(left / 60);
            const s = left % 60;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-[16px] bg-elevated px-4 py-3 shadow-[var(--shadow-border)]"
              >
                <div>
                  <p className="text-sm">{t.label}</p>
                  <p className="text-lg font-medium tabular-nums">
                    {m}:{String(s).padStart(2, "0")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTimer(t.id)}
                  aria-label="Clear timer"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
          Reminders
        </h3>
        {reminders.length === 0 ? (
          <p className="text-sm text-muted">None yet. Ask Aether out loud.</p>
        ) : (
          reminders.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleReminder(r.id)}
              className="flex w-full items-start justify-between rounded-[16px] bg-elevated px-4 py-3 text-left shadow-[var(--shadow-border)]"
            >
              <span className={r.done ? "text-muted line-through" : ""}>
                {r.text}
              </span>
              <time className="text-xs text-faint tabular-nums">
                {formatClock(new Date(r.when))}
              </time>
            </button>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-faint">
          <StickyNote className="size-3.5" /> Notes
        </h3>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">Empty. Say “note that…”</p>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 rounded-[16px] bg-elevated px-4 py-3 shadow-[var(--shadow-border)]"
            >
              <p className="text-sm leading-relaxed">{n.text}</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteNote(n.id)}
                aria-label="Delete note"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
