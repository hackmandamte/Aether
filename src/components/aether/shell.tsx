import { Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Composer } from "./composer";
import { Drawer } from "./drawer";
import { Transcript } from "./transcript";
import { isNativeBridge } from "@/lib/aether/native";
import { greetOnce, stopEverything, tapOrb } from "@/lib/aether/session";
import { useAether } from "@/lib/aether/store";
import { warmUpDeviceVoice } from "@/lib/aether/voice";

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      const covered = window.innerHeight - vv.height;
      setOpen(covered > 100);
    };
    check();
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
    };
  }, []);
  return open;
}

export function AetherShell() {
  const device = useAether((s) => s.device);
  const settings = useAether((s) => s.settings);
  const messages = useAether((s) => s.messages);
  const setDrawerOpen = useAether((s) => s.setDrawerOpen);
  const setTheme = useAether((s) => s.setTheme);
  const [mounted, setMounted] = useState(false);
  const [inApp, setInApp] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const home = messages.length === 0;

  useEffect(() => {
    setMounted(true);
    setInApp(isNativeBridge());
    warmUpDeviceVoice();
  }, []);

  useEffect(() => {
    const unlock = () => warmUpDeviceVoice();
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    const theme = settings.theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }, [settings.theme]);

  useEffect(() => {
    if (mounted && inApp && !settings.onboarded) void greetOnce();
  }, [mounted, inApp, settings.onboarded]);

  useEffect(() => {
    return () => stopEverything();
  }, []);

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

  const isLight = settings.theme === "light";

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-3xl flex-col bg-bg transition-colors duration-300">
      {device.flashlight ? (
        <div className="pointer-events-none absolute inset-0 z-20 bg-[#f4f1e6]/70 mix-blend-screen" />
      ) : null}

      <Drawer />

      <header className="flex shrink-0 items-center gap-1 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label="Open menu"
        >
          <Menu className="size-5" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setTheme(isLight ? "dark" : "light")}
          className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
        >
          {isLight ? (
            <Moon className="size-5" strokeWidth={1.75} />
          ) : (
            <Sun className="size-5" strokeWidth={1.75} />
          )}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Transcript compact={home && keyboardOpen} />
      </main>

      <div className="shrink-0 bg-bg pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 transition-colors duration-300">
        <Composer showActions={home} />
      </div>
    </div>
  );
}
