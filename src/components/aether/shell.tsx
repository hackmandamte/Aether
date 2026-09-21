import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Composer } from "./composer";
import { Drawer } from "./drawer";
import { Transcript } from "./transcript";
import { isNativeBridge } from "@/lib/aether/native";
import { greetOnce, stopEverything, tapOrb } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function AetherShell() {
  const device = useAether((s) => s.device);
  const settings = useAether((s) => s.settings);
  const setDrawerOpen = useAether((s) => s.setDrawerOpen);
  const [mounted, setMounted] = useState(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInApp(isNativeBridge());
  }, []);

  // First launch inside the Android app: speak a time-aware hello.
  useEffect(() => {
    if (mounted && inApp && !settings.onboarded) void greetOnce();
  }, [mounted, inApp, settings.onboarded]);

  useEffect(() => {
    return () => stopEverything();
  }, []);

  // Spacebar = tap mic (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      void tapOrb();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-3xl flex-col bg-bg">
      {device.flashlight ? (
        <div className="pointer-events-none absolute inset-0 z-20 bg-[#f4f1e6]/70 mix-blend-screen" />
      ) : null}

      <Drawer />

      {/* Top bar — minimal */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label="Open menu"
        >
          <Menu className="size-5" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-medium tracking-tight">Eta</p>
          <p className="truncate text-[11px] text-faint">{timeGreeting()}</p>
        </div>
      </header>

      {/* Chat fills the middle */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Transcript />
      </main>

      {/* Input bar pinned to bottom */}
      <div className="shrink-0 border-t border-border/60 bg-bg pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <Composer />
      </div>
    </div>
  );
}
