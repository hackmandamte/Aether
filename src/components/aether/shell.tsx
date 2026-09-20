import {
  Download,
  Flashlight,
  MessageCircle,
  Settings2,
  StickyNote,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "./composer";
import { DevicePanel } from "./device-panel";
import { InstallPanel } from "./install-panel";
import { NotesPanel } from "./notes-panel";
import { Orb } from "./orb";
import { Transcript } from "./transcript";
import { cancelRecording, finishRecordingAndReply, startRecording } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { formatClock } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { TabId } from "@/lib/aether/types";

const TABS: { id: TabId; label: string; icon: typeof MessageCircle }[] = [
  { id: "assist", label: "Assist", icon: MessageCircle },
  { id: "device", label: "Device", icon: Flashlight },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "install", label: "Install", icon: Download },
];

export function AetherShell() {
  const tab = useAether((s) => s.tab);
  const setTab = useAether((s) => s.setTab);
  const listen = useAether((s) => s.listen);
  const device = useAether((s) => s.device);
  const settings = useAether((s) => s.settings);
  const setOnboarded = useAether((s) => s.setOnboarded);
  const holding = useRef(false);
  const [clock, setClock] = useState("--:--");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tick = () => setClock(formatClock());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onHoldStart = useCallback(() => {
    if (listen !== "idle") return;
    holding.current = true;
    void startRecording().catch((err: unknown) => {
      holding.current = false;
      const message =
        err instanceof Error ? err.message : "Microphone is blocked.";
      useAether.getState().setError(message);
      useAether.getState().setListen("idle");
    });
  }, [listen]);

  const onHoldEnd = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    void finishRecordingAndReply();
  }, []);

  useEffect(() => {
    return () => {
      void cancelRecording();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      e.preventDefault();
      if (e.type === "keydown") onHoldStart();
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
    const id = window.setTimeout(() => {
      if (holding.current) {
        holding.current = false;
        void finishRecordingAndReply();
      }
    }, 20_000);
    return () => window.clearTimeout(id);
  }, [listen]);

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg px-4 pb-[5.5rem] pt-[env(safe-area-inset-top)] md:max-w-3xl">
      {device.flashlight ? (
        <div className="pointer-events-none absolute inset-0 z-20 bg-[#f4f1e6]/80 mix-blend-screen" />
      ) : null}

      <header className="flex items-center justify-between py-4">
        <div>
          <p className="font-display text-lg font-medium tracking-[-0.03em]">Aether</p>
          <p className="text-xs text-faint tabular-nums">{clock} · Smart 8</p>
        </div>
        <button
          type="button"
          onClick={() => setTab("install")}
          className="grid size-11 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-subtle hover:text-fg"
          aria-label="Settings"
        >
          <Settings2 className="size-5" />
        </button>
      </header>

      {mounted && !settings.onboarded ? (
        <div className="mb-3 rounded-[20px] bg-elevated p-4 shadow-[var(--shadow-border)]">
          <p className="text-sm leading-relaxed">
            Hold the silver disc and speak. Spacebar works on a computer.
            Install the APK on the Infinix to replace Gemini on the Home
            button.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-accent underline-offset-4 hover:underline"
            onClick={setOnboarded}
          >
            Got it
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "assist" ? (
          <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_17rem] md:gap-8">
            <Transcript />
            <div className="flex flex-col items-center gap-5 py-4 md:justify-center">
              <Orb onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} />
              <Composer />
            </div>
          </div>
        ) : null}
        {tab === "device" ? <DevicePanel /> : null}
        {tab === "notes" ? <NotesPanel /> : null}
        {tab === "install" ? <InstallPanel /> : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-around border-t border-border bg-bg/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:max-w-3xl">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex h-12 min-w-[4.2rem] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[11px] font-medium",
                active ? "text-fg" : "text-faint",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2 : 1.7} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
