import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { sendText } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { Button } from "@/components/ui/button";

export function Composer() {
  const [value, setValue] = useState("");
  const listen = useAether((s) => s.listen);
  const busy = listen !== "idle";

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const next = value.trim();
        if (!next || busy) return;
        setValue("");
        void sendText(next);
      }}
    >
      <label className="sr-only" htmlFor="aether-input">
        Message Aether
      </label>
      <textarea
        id="aether-input"
        rows={1}
        value={value}
        disabled={busy}
        placeholder="Or type it"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="min-h-11 flex-1 resize-none rounded-[var(--radius-lg)] bg-elevated px-4 py-2.5 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-faint outline-none focus:shadow-[var(--shadow-border-hover)]"
      />
      <Button
        type="submit"
        size="icon"
        disabled={busy || !value.trim()}
        aria-label="Send"
      >
        <ArrowUp className="size-4" />
      </Button>
    </form>
  );
}
