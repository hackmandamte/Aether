import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { LANGUAGES, VOICES } from "@/lib/aether/types";
import { getAccessCode, setAccessCode } from "@/lib/aether/access";
import { isNativeBridge } from "@/lib/aether/native";
import { useAether } from "@/lib/aether/store";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "Install the APK",
    body: "On this Infinix: Chrome menu → Allow unknown apps, then open Aether.apk. Then open Aether, paste this site's link, and confirm.",
  },
  {
    title: "Set as digital assistant",
    body: "Settings → App management → Default apps → Digital assistant app → Aether. Long-press Home now opens Aether, not Gemini.",
  },
  {
    title: "Microphone",
    body: "Grant the microphone so it can hear you. Calls and texts open your dialer or Messages with everything filled in; you tap to dial or send.",
  },
  {
    title: "Accessibility (for lock / home / back)",
    body: "Settings → Additional settings → Accessibility → Aether. Required for true system keys.",
  },
];

export function InstallPanel() {
  const settings = useAether((s) => s.settings);
  const setVoice = useAether((s) => s.setVoice);
  const setLanguage = useAether((s) => s.setLanguage);
  const native = isNativeBridge();
  const [apkOk, setApkOk] = useState(false);
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [hasCode, setHasCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setHasCode(getAccessCode().length > 0);
  }, []);

  // Check for the APK, and keep checking only until it exists.
  useEffect(() => {
    let cancelled = false;
    let id: number | undefined;
    const check = () =>
      fetch("/aether.apk", { method: "HEAD" })
        .then((r) => {
          if (cancelled) return;
          setApkOk(r.ok);
          if (r.ok && id !== undefined) window.clearInterval(id);
        })
        .catch(() => {
          if (!cancelled) setApkOk(false);
        });
    void check();
    id = window.setInterval(() => void check(), 15_000);
    return () => {
      cancelled = true;
      if (id !== undefined) window.clearInterval(id);
    };
  }, []);

  function saveCode() {
    setAccessCode(code);
    setHasCode(code.trim().length > 0);
    setCode("");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is shown on screen */
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto pb-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
          Replace Gemini
        </p>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-[-0.03em]">
          Put Aether on the Smart 8
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          This preview talks and drives phone actions in the browser. The APK
          is what appears in XOS Default apps and can long-press Home.
        </p>
      </header>

      {native ? (
        <p className="rounded-[16px] bg-ok/10 px-4 py-3 text-sm text-ok">
          Running inside the Aether APK. Finish Default assistant + Accessibility
          if you have not.
        </p>
      ) : null}

      <div className="rounded-[24px] bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 text-muted" />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">
              3 GB tuned. After install, open Aether and paste this site's
              link when it asks.
            </p>
            {origin ? (
              <p className="break-all rounded-[12px] bg-subtle px-3 py-2 text-xs tabular-nums text-muted">
                {origin}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {apkOk ? (
                <a
                  href="/aether.apk"
                  download="Aether.apk"
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-fg transition-[scale] duration-150 ease-out active:scale-[0.96]"
                >
                  <Download className="size-4" />
                  Download APK
                </a>
              ) : (
                <Button disabled>
                  <Download className="size-4" />
                  APK not built yet
                </Button>
              )}
              <Button variant="quiet" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy site link"}
              </Button>
            </div>
            {!apkOk ? (
              <p className="text-xs text-muted">
                You can still use voice here, or Add to Home screen from Chrome.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-[20px] bg-elevated p-4 shadow-[var(--shadow-border)]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-subtle text-sm tabular-nums">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
          Access code
        </h3>
        <p className="text-xs leading-relaxed text-muted">
          The code set as AETHER_ACCESS_CODE on the server. It stays on this
          device and unlocks talking to Aether.{" "}
          {hasCode ? "A code is saved." : "No code saved yet."}
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={hasCode ? "Replace code" : "Enter code"}
            aria-label="Access code"
            className="min-h-11 flex-1 rounded-[var(--radius-lg)] bg-elevated px-4 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-faint outline-none focus:shadow-[var(--shadow-border-hover)]"
          />
          <Button variant="quiet" onClick={saveCode} disabled={!code.trim() && !hasCode}>
            {code.trim() ? "Save" : "Clear"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
          Voice
        </h3>
        <div className="flex flex-wrap gap-2">
          {VOICES.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={settings.voice === v.id ? "primary" : "quiet"}
              onClick={() => setVoice(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Button
              key={l.id}
              size="sm"
              variant={settings.language === l.id ? "primary" : "quiet"}
              onClick={() => setLanguage(l.id)}
            >
              {l.label}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-faint">
          True “Hey Google” with the screen off is reserved by Google. With
          Aether set as the default assistant, long-press Home or the power
          assist gesture launches it instead.
        </p>
      </section>
    </div>
  );
}
