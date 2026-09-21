import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { sendText } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { Orb } from "./orb";

export function Composer({ onHoldStart, onHoldEnd }: { onHoldStart: () => void; onHoldEnd: () => void }) {
  const [value, setValue] = useState("");
  const listen = useAether((s) => s.listen);
  const busy = listen !== "idle";
  return (
    <form className="flex w-full items-end gap-2 rounded-[24px] bg-elevated p-2 shadow-[var(--shadow-border)]" onSubmit={(e) => {
      e.preventDefault();
      const next = value.trim();
      if (!next || busy) return;
      setValue("");
      void sendText(next);
    }}>
      <Orb onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} />
      <label className="sr-only" htmlFor="aether-input">Message Aether</label>
      <textarea id="aether-input" rows={1} value={value} disabled={busy} placeholder="Message Aether"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-fg outline-none placeholder:text-faint" />
      {value.trim() ? <button type="submit" disabled={busy} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40"><ArrowUp className="size-4" /></button> : null}
    </form>
  );
}
