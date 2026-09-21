import {
  Bluetooth,
  Flashlight,
  MessageSquarePlus,
  Settings2,
  StickyNote,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getAccessCode, setAccessCode } from "@/lib/aether/access";
import { getNativeAccessCode, isNativeBridge, runPhoneAction } from "@/lib/aether/native";
import { useAether } from "@/lib/aether/store";
import { LANGUAGES, VOICES } from "@/lib/aether/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Drawer() {
  const open = useAether((s) => s.drawerOpen);
  const setDrawerOpen = useAether((s) => s.setDrawerOpen);
  const clearMessages = useAether((s) => s.clearMessages);
  const settings = useAether((s) => s.settings);
  const setVoice = useAether((s) => s.setVoice);
  const setLanguage = useAether((s) => s.setLanguage);
  const device = useAether((s) => s.device);
  const notes = useAether((s) => s.notes);
  const deleteNote = useAether((s) => s.deleteNote);

  const [section, setSection] = useState<"main" | "settings" | "notes">("main");
  const [code, setCode] = useState("");
  const [hasCode, setHasCode] = useState(false);
  const [managed, setManaged] = useState(false);

  useEffect(() => {
    if (!open) {
      setSection("main");
      return;
    }
    setHasCode(getAccessCode().length > 0);
    void getNativeAccessCode().then((c) => setManaged(c.length > 0));
  }, [open]);

  function saveCode() {
    setAccessCode(code);
    setHasCode(code.trim().length > 0);
    setCode("");
  }

  function newChat() {
    clearMessages();
    setDrawerOpen(false);
  }

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!open}
      />

      {/* Panel */}
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
          <p className="font-display text-lg font-medium tracking-tight">Eta</p>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="grid size-10 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {section === "main" ? (
            <nav className="space-y-1">
              <DrawerRow
                icon={MessageSquarePlus}
                label="New chat"
                onClick={newChat}
              />
              <DrawerRow
                icon={Settings2}
                label="Settings"
                onClick={() => setSection("settings")}
              />
              <DrawerRow
                icon={StickyNote}
                label={`Notes${notes.length ? ` (${notes.length})` : ""}`}
                onClick={() => setSection("notes")}
              />

              <p className="mb-2 mt-6 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                Quick actions
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
                label="Bluetooth"
                onClick={() => void runPhoneAction({ action: "bluetooth" })}
              />
              <DrawerRow
                icon={Volume2}
                label={`Volume ${device.volume}/15`}
                onClick={() => undefined}
              />
              <input
                type="range"
                min={0}
                max={15}
                value={device.volume}
                onChange={(e) =>
                  void runPhoneAction({
                    action: "volume",
                    value: Number(e.target.value),
                  })
                }
                className="mx-3 mt-1 w-[calc(100%-1.5rem)] accent-accent"
              />
            </nav>
          ) : null}

          {section === "settings" ? (
            <div className="space-y-5 px-1">
              <button
                type="button"
                onClick={() => setSection("main")}
                className="text-sm text-muted hover:text-fg"
              >
                ← Back
              </button>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">
                  Voice
                </p>
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
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">
                  Language
                </p>
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

              {!isNativeBridge() || !managed ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">
                    Access code
                  </p>
                  <p className="mb-2 text-xs text-muted">
                    {hasCode ? "A code is saved on this device." : "Enter the server access code once."}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={hasCode ? "Replace code" : "Enter code"}
                      className="min-h-11 flex-1 rounded-xl bg-subtle px-3 text-sm outline-none focus:ring-1 focus:ring-border-strong"
                    />
                    <Button variant="quiet" size="sm" onClick={saveCode}>
                      {code.trim() ? "Save" : hasCode ? "Clear" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted">This app unlocks Eta automatically.</p>
              )}
            </div>
          ) : null}

          {section === "notes" ? (
            <div className="space-y-3 px-1">
              <button
                type="button"
                onClick={() => setSection("main")}
                className="text-sm text-muted hover:text-fg"
              >
                ← Back
              </button>
              {!notes.length ? (
                <p className="text-sm text-muted">No notes yet. Ask Eta to remember something.</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="flex items-start justify-between gap-2 rounded-xl bg-subtle px-3 py-2.5 text-sm"
                    >
                      <span className="leading-relaxed">{n.text}</span>
                      <button
                        type="button"
                        onClick={() => deleteNote(n.id)}
                        className="shrink-0 text-xs text-faint hover:text-danger"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
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
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors",
        active ? "bg-accent text-accent-fg" : "text-fg hover:bg-subtle",
      )}
    >
      <Icon className="size-5 shrink-0 opacity-80" strokeWidth={1.75} />
      <span className="font-medium">{label}</span>
    </button>
  );
}
