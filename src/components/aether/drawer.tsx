import {
  Bluetooth,
  Flashlight,
  MessageSquarePlus,
  Moon,
  Settings2,
  StickyNote,
  Sun,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import { isNativeBridge, runPhoneAction } from "@/lib/aether/native";
import { useAether } from "@/lib/aether/store";
import { LANGUAGES, VOICES, resolveVoiceId } from "@/lib/aether/types";
import { speakWithDevice } from "@/lib/aether/voice";
import { Button } from "@/components/ui/button";
import { ConnectorsPanel } from "@/components/aether/connectors-panel";
import { TERMS_BODY, TERMS_TITLE, TERMS_VERSION } from "@/lib/aether/terms";
import { cn } from "@/lib/utils";

export function Drawer() {
  const open = useAether((s) => s.drawerOpen);
  const setDrawerOpen = useAether((s) => s.setDrawerOpen);
  const clearMessages = useAether((s) => s.clearMessages);
  const settings = useAether((s) => s.settings);
  const setLanguage = useAether((s) => s.setLanguage);
  const setTheme = useAether((s) => s.setTheme);
  const setVoice = useAether((s) => s.setVoice);
  const setBrainMode = useAether((s) => s.setBrainMode);
  const device = useAether((s) => s.device);
  const notes = useAether((s) => s.notes);
  const deleteNote = useAether((s) => s.deleteNote);

  const [section, setSection] = useState<
    "main" | "settings" | "notes" | "connectors" | "about" | "brain"
  >("main");
  const [previewing, setPreviewing] = useState(false);

  function newChat() {
    clearMessages();
    setDrawerOpen(false);
  }

  async function previewVoice(id: (typeof VOICES)[number]["id"]) {
    setVoice(id);
    setPreviewing(true);
    try {
      await speakWithDevice(
        "Hello, I am ETA, your everyday task assistant.",
        settings.language,
        Math.max(0.3, device.volume / 15),
        id,
      );
    } finally {
      setPreviewing(false);
    }
  }

  const isLight = settings.theme === "light";
  const activeVoice = resolveVoiceId(settings.voice);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!open}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col bg-elevated shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!open}
        role="dialog"
        aria-label="Menu"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <p className="text-sm font-semibold tracking-tight">ETA</p>
            <p className="text-xs text-faint">Everyday Tasks Assistant</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-subtle"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
          {section === "main" ? (
            <nav className="space-y-1">
              <DrawerRow icon={MessageSquarePlus} label="New chat" onClick={newChat} />
              <DrawerRow
                icon={Settings2}
                label="Settings"
                onClick={() => setSection("settings")}
              />
              <DrawerRow
                icon={Settings2}
                label="AI Brain"
                onClick={() => setSection("brain")}
              />
              <DrawerRow
                icon={Settings2}
                label="Connectors"
                onClick={() => setSection("connectors")}
              />
              <DrawerRow
                icon={Settings2}
                label="About & Terms"
                onClick={() => setSection("about")}
              />
              <DrawerRow
                icon={StickyNote}
                label={`Notes${notes.length ? ` (${notes.length})` : ""}`}
                onClick={() => setSection("notes")}
              />

              <p className="mb-2 mt-6 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                Device
              </p>
              <DrawerRow
                icon={Flashlight}
                label={device.flashlight ? "Flashlight off" : "Flashlight on"}
                active={device.flashlight}
                onClick={() =>
                  void runPhoneAction({
                    action: device.flashlight ? "flashlight_off" : "flashlight_on",
                  })
                }
              />
              <DrawerRow
                icon={Wifi}
                label="Wi-Fi settings"
                onClick={() => void runPhoneAction({ action: "wifi" })}
              />
              <DrawerRow
                icon={Bluetooth}
                label="Bluetooth settings"
                onClick={() => void runPhoneAction({ action: "bluetooth" })}
              />
              <DrawerRow
                icon={Volume2}
                label={`Volume ${device.volume}`}
                onClick={() => void runPhoneAction({ action: "volume", value: device.volume })}
              />
            </nav>
          ) : null}

          {section === "settings" ? (
            <div className="space-y-5 px-1">
              <button type="button" onClick={() => setSection("main")} className="text-sm text-faint">
                Back
              </button>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">
                  Voice
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={previewing}
                      onClick={() => void previewVoice(v.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm transition",
                        activeVoice === v.id
                          ? "border-accent bg-accent/10"
                          : "border-border hover:bg-subtle",
                      )}
                    >
                      <span className="font-medium">{v.label}</span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px]",
                          activeVoice === v.id ? "opacity-80" : "text-faint",
                        )}
                      >
                        {v.gender === "female" ? "Female" : "Male"} · {v.tone}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">
                  Appearance
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!isLight ? "primary" : "quiet"}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon className="size-3.5" /> Dark
                  </Button>
                  <Button
                    size="sm"
                    variant={isLight ? "primary" : "quiet"}
                    onClick={() => setTheme("light")}
                  >
                    <Sun className="size-3.5" /> Light
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">
                  Language
                </p>
                <p className="mb-2 text-xs text-muted">Speech uses this language when available.</p>
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
              </div>

              {isNativeBridge() ? (
                <p className="text-xs leading-relaxed text-muted">
                  This install unlocks ETA automatically. No access code to enter.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted">
                  Full unlock works in the ETA app. Browser preview is for testing the UI.
                </p>
              )}
            </div>
          ) : null}

          {section === "brain" ? (
            <div className="space-y-4 px-1">
              <button type="button" onClick={() => setSection("main")} className="text-sm text-faint">
                Back
              </button>
              <p className="text-sm font-medium">AI Brain</p>
              <p className="text-xs text-muted">
                Cloud uses xAI/Groq. Local needs an APK with on-device Qwen. Hybrid picks
                automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["cloud", "local", "hybrid"] as const).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={(settings.brainMode ?? "hybrid") === m ? "primary" : "quiet"}
                    onClick={() => setBrainMode(m)}
                  >
                    {m === "cloud" ? "Cloud" : m === "local" ? "Local" : "Hybrid"}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {section === "connectors" ? (
            <>
              <div className="flex items-center gap-2 border-b border-border px-1 py-2">
                <button
                  type="button"
                  className="text-sm text-faint"
                  onClick={() => setSection("main")}
                >
                  Back
                </button>
                <span className="text-sm font-medium">Connectors</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ConnectorsPanel />
              </div>
            </>
          ) : null}

          {section === "about" ? (
            <div className="space-y-3 px-1 pb-6">
              <button type="button" onClick={() => setSection("main")} className="text-sm text-faint">
                Back
              </button>
              <p className="text-sm font-medium">{TERMS_TITLE}</p>
              <p className="text-xs text-faint">Version {TERMS_VERSION}</p>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted">
                {TERMS_BODY}
              </pre>
            </div>
          ) : null}

          {section === "notes" ? (
            <div className="space-y-3 px-1">
              <button type="button" onClick={() => setSection("main")} className="text-sm text-faint">
                Back
              </button>
              {!notes.length ? (
                <p className="text-sm text-muted">No notes yet.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="rounded-xl border border-border p-3 text-sm">
                    <p>{n.text}</p>
                    <button
                      type="button"
                      className="mt-2 text-xs text-faint"
                      onClick={() => deleteNote(n.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function DrawerRow({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Settings2;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
        active ? "bg-accent/15 text-fg" : "text-muted hover:bg-subtle hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
