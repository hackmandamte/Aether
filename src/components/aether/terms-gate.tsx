import { useState } from "react";
import { TERMS_BODY, TERMS_LAST_UPDATED, TERMS_TITLE, TERMS_VERSION } from "@/lib/aether/terms";
import { Button } from "@/components/ui/button";

type Props = {
  onAccept: (version: string) => void;
};

export function TermsGate({ onAccept }: Props) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-fg">
      <header className="shrink-0 border-b border-border px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-semibold tracking-tight">{TERMS_TITLE}</h1>
        <p className="text-xs text-faint">
          Version {TERMS_VERSION} · Updated {TERMS_LAST_UPDATED}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
          {TERMS_BODY}
        </pre>
      </div>

      <footer className="shrink-0 space-y-3 border-t border-border px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            I have read and agree to the ETA Terms of Use and understand that third-party services,
            downloads, integrations, and device permissions may involve risks.
          </span>
        </label>
        <Button
          type="button"
          className="w-full"
          disabled={!checked}
          onClick={() => onAccept(TERMS_VERSION)}
        >
          Accept and continue
        </Button>
      </footer>
    </div>
  );
}
