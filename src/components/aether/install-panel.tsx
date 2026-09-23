import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { LANGUAGES, VOICES } from "@/lib/aether/types";
import { isNativeBridge } from "@/lib/aether/native";
import { useAether } from "@/lib/aether/store";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "Install the APK",
    body: "Download the release APK from GitHub, allow install from that source, then open ETA. Access is already built in — nothing to type.",
  },
  {
    title: "Set as digital assistant (optional)",
    body: "Settings → App management → Default apps → Digital assistant app → ETA. Long-press Home can open ETA instead of Gemini.",
  },
  {
    title: "Microphone",
    body: "Grant the microphone so ETA can hear you.",
  },
  {
    title: "Display over other apps (optional)",
    body: "Needed for the floating logo hotkey over other apps.",
  },
  {
    title: "Accessibility (optional)",
    body: "Settings → Accessibility → ETA. Only for Home / Back / Lock-style actions.",
  },
];

export function InstallPanel() {
  const settings = useAether((s) => s.settings);
  const setVoice = useAether((s) => s.setVoice);
  const setLanguage = useAether((s) => s.setLanguage);
  const native = isNativeBridge();
  const [apkOk, setApkOk] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto pb-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">Get ETA</p>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-[-0.03em]">
          Put ETA on your phone
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          The release APK unlocks the server for you automatically. You never enter an access code.
          APK size around 15–30 MB is normal.
        </p>
      </header>

      {native ? (
        <p className="rounded-[16px] bg-ok/10 px-4 py-3 text-sm text-ok">
          Running inside the ETA app. Unlock is already handled. Finish assistant / overlay /
          Accessibility only if you want those extras.
        </p>
      ) : null}

      <div className="rounded-[24px] bg-elevated p-4 shadow-[var(--shadow-border)]">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 text-muted" />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">
              Build the APK once from GitHub Actions, install it, and open ETA. It connects to this
              site by itself when the site URL was baked into the build.
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
                  download="ETA.apk"
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-fg transition-[scale] duration-150 ease-out active:scale-[0.96]"
                >
                  <Download className="size-4" />
                  Download APK
                </a>
              ) : (
                <Button disabled>
                  <Download className="size-4" />
                  APK not on this host yet
                </Button>
              )}
              <Button variant="quiet" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy site link"}
              </Button>
            </div>
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
              <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">Voice</h3>
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
      </section>
    </div>
  );
}
