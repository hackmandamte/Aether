import {
  Menu,
  MessageCircle,
  Settings2,
  StickyNote,
  Smartphone,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "./composer";
import { DevicePanel } from "./device-panel";
import { NotesPanel } from "./notes-panel";
import { SettingsPanel } from "./settings-panel";
import { Transcript } from "./transcript";
import { isNativeBridge } from "@/lib/aether/native";
import {
  cancelRecording,
  finishRecordingAndReply,
  greetOnce,
  startRecording,
} from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import type { TabId } from "@/lib/aether/types";
import { cn } from "@/lib/utils";

const DESTINATIONS: { id: TabId; label: string; icon: typeof MessageCircle }[] = [
  { id: "assist", label: "Assistant", icon: MessageCircle },
  { id: "device", label: "Device", icon: Smartphone },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function AetherShell() {
  const tab = useAether((s) => s.tab);
  const setTab = useAether((s) => s.setTab);
  const listen = useAether((s) => s.listen);
  const device = useAether((s) => s.device);
  const messages = useAether((s) => s.messages);
  const holding = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isNativeBridge()) void greetOnce();
  }, []);

  const selectTab = useCallback(
    (next: TabId) => {
      setTab(next);
      setDrawerOpen(false);
    },
    [setTab],
  );

  const onHoldStart = useCallback(() => {
    if (listen !== "idle") return;
    holding.current = true;
    void startRecording().catch((err: unknown) => {
      holding.current = false;
      const message = err instanceof Error ? err.message : "Microphone is blocked.";
      useAether.getState().setError(message);
      useAether.getState().setListen("idle");
    });
  }, [listen]);

  const onHoldEnd = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    void finishRecordingAndReply();
  }, []);

  useEffect(() => () => void cancelRecording(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      if (event.type === "keydown") onHoldStart();
      else onHoldEnd();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [onHoldStart, onHoldEnd]);

  useEffect(() => {
    if (listen !== "recording") return;
    const timeout = window.setTimeout(() => {
      if (holding.current) {
        holding.current = false;
        void finishRecordingAndReply();
      }
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [listen]);

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-bg px-4 pt-[env(safe-area-inset-top)] sm:px-6">
      {device.flashlight ? <div className="pointer-events-none absolute inset-0 z-20 bg-[#f4f1e6]/80 mix-blend-screen" /> : null}

      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/60">
        <button type="button" onClick={() => setDrawerOpen(true)} className="grid size-11 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <button type="button" onClick={() => selectTab("assist")} className="font-display text-lg font-medium tracking-[-0.03em]">Aether</button>
        <button type="button" onClick={() => selectTab("settings")} className="grid size-11 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Open settings">
          <Settings2 className="size-5" />
        </button>
      </header>

      <main className={cn("flex min-h-0 flex-1 flex-col py-3", mounted && "animate-[aether-enter_420ms_ease-out]")}>
        {tab === "assist" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Transcript />
            <div className="mt-3 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Composer onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} />
            </div>
          </div>
        ) : null}
        {tab === "device" ? <DevicePanel /> : null}
        {tab === "notes" ? <NotesPanel /> : null}
        {tab === "settings" ? <SettingsPanel /> : null}
      </main>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Aether menu">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} aria-label="Close menu" />
          <aside className="relative flex h-full w-[min(21rem,86vw)] flex-col bg-elevated px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl animate-[aether-drawer_220ms_ease-out]">
            <div className="flex h-16 items-center justify-between border-b border-border/60">
              <p className="font-display text-lg font-medium">Aether</p>
              <button type="button" onClick={() => setDrawerOpen(false)} className="grid size-10 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Close menu"><X className="size-5" /></button>
            </div>
            <nav className="space-y-1 py-4">
              {DESTINATIONS.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => selectTab(item.id)} className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm", tab === item.id ? "bg-subtle text-fg" : "text-muted hover:bg-subtle hover:text-fg")}><Icon className="size-5" />{item.label}</button>;
              })}
            </nav>
            <div className="mt-2 border-t border-border/60 pt-4">
              <p className="px-3 text-xs font-medium uppercase tracking-[0.14em] text-faint">Recent</p>
              <div className="mt-2 space-y-1">
                {messages.slice(-5).reverse().map((message) => <button key={message.id} type="button" onClick={() => selectTab("assist")} className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-subtle hover:text-fg"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent/70" /><span className="line-clamp-2">{message.text}</span></button>)}
                {!messages.length ? <p className="px-3 py-2 text-sm text-faint">No conversations yet.</p> : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
