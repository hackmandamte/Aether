import {
  formatClockTime,
  parseClockTime,
  parseLevel,
  parseTimerSeconds,
} from "./parse";
import { useAether } from "./store";
import type { ActionResult, PhoneAction } from "./types";

/**
 * The Android app injects `AetherNative` with WebViewCompat.addWebMessageListener,
 * restricted by the WebView itself to this site's origin and its top frame.
 * It is message based: post a JSON request, get a JSON reply on "message".
 */
type NativeChannel = {
  postMessage: (message: string) => void;
  addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
};

declare global {
  interface Window {
    AetherNative?: NativeChannel;
  }
}

let torchStream: MediaStream | null = null;

const NATIVE_TIMEOUT_MS = 8000;
type NativeReply = ActionResult & { accessCode?: string };
const pendingNative = new Map<string, (result: NativeReply) => void>();
let nativeListening = false;

export function isNativeBridge(): boolean {
  return typeof window !== "undefined" && typeof window.AetherNative?.postMessage === "function";
}

function listenForNative(channel: NativeChannel) {
  if (nativeListening) return;
  nativeListening = true;
  channel.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as { id?: string; result?: NativeReply };
      const done = msg.id ? pendingNative.get(msg.id) : undefined;
      if (done && msg.result) {
        pendingNative.delete(msg.id!);
        done(msg.result);
      }
    } catch {
      /* ignore malformed replies */
    }
  });
}

/** null = not running inside the app (use the browser fallback). */
function postNative(body: Record<string, unknown>): Promise<NativeReply | null> {
  const channel = typeof window !== "undefined" ? window.AetherNative : undefined;
  if (!channel || typeof channel.postMessage !== "function") return Promise.resolve(null);
  listenForNative(channel);

  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      pendingNative.delete(id);
      resolve({ ok: false, native: true, message: "The phone didn't answer." });
    }, NATIVE_TIMEOUT_MS);
    pendingNative.set(id, (result) => {
      window.clearTimeout(timer);
      resolve({ ...result, native: true });
    });
    try {
      channel.postMessage(JSON.stringify({ id, ...body }));
    } catch {
      window.clearTimeout(timer);
      pendingNative.delete(id);
      resolve({ ok: false, native: true, message: "Native bridge failed." });
    }
  });
}

function nativeExecute(action: PhoneAction): Promise<ActionResult | null> {
  return postNative({ action });
}

let nativeCode: string | null = null;

/**
 * The access code built into the Android app (empty in a normal browser, or when the
 * app wasn't built with one). Only this site's top frame can ask; the app checks that.
 */
export async function getNativeAccessCode(): Promise<string> {
  if (!isNativeBridge()) return "";
  if (nativeCode !== null) return nativeCode;
  const reply = await postNative({ type: "config" });
  if (reply?.ok && typeof reply.accessCode === "string") nativeCode = reply.accessCode;
  return nativeCode ?? "";
}

function openUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function intentUrl(action: string, extras?: string) {
  return `intent://#Intent;action=${action};${extras ?? ""}end`;
}

async function setTorch(on: boolean): Promise<boolean> {
  try {
    if (!on) {
      torchStream?.getTracks().forEach((t) => t.stop());
      torchStream = null;
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) return false;
    torchStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const track = torchStream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() as
      | { torch?: boolean }
      | undefined;
    if (!caps?.torch) {
      torchStream.getTracks().forEach((t) => t.stop());
      torchStream = null;
      return false;
    }
    await track.applyConstraints({
      advanced: [{ torch: true } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

const APP_ALIASES: Record<string, { intent?: string; web?: string; pkg?: string }> =
  {
    whatsapp: {
      web: "https://wa.me/",
      pkg: "com.whatsapp",
    },
    youtube: {
      web: "https://m.youtube.com",
      pkg: "com.google.android.youtube",
    },
    chrome: {
      web: "https://www.google.com",
      pkg: "com.android.chrome",
    },
    phone: { intent: "android.intent.action.DIAL", pkg: "com.android.dialer" },
    messages: {
      web: "sms:",
      pkg: "com.google.android.apps.messaging",
    },
    camera: {
      intent: "android.media.action.STILL_IMAGE_CAMERA",
      pkg: "com.transsion.camera",
    },
    settings: {
      intent: "android.settings.SETTINGS",
      pkg: "com.android.settings",
    },
    maps: { web: "https://maps.google.com", pkg: "com.google.android.apps.maps" },
    clock: { pkg: "com.transsion.deskclock" },
    files: { pkg: "com.transsion.filemanagerx" },
    play: {
      web: "https://play.google.com/store",
      pkg: "com.android.vending",
    },
  };

type Prepared = { action: PhoneAction } | { error: string };

/** Turn loose model output into strict values before anything touches the phone. */
function prepare(action: PhoneAction): Prepared {
  switch (action.action) {
    case "alarm": {
      const t = parseClockTime(action.value, action.target, action.extra);
      if (!t) return { error: "What time should I set the alarm for?" };
      return { action: { ...action, value: formatClockTime(t) } };
    }
    case "timer": {
      const seconds = parseTimerSeconds(action.value ?? action.target);
      if (seconds === null) return { error: "How long should the timer run?" };
      return { action: { ...action, value: String(seconds) } };
    }
    case "volume":
      return { action: { ...action, value: String(parseLevel(action.value ?? action.target, 11, 0, 15)) } };
    case "brightness":
      return {
        action: { ...action, value: String(parseLevel(action.value ?? action.target, 70, 5, 100)) },
      };
    default:
      return { action };
  }
}

export async function runPhoneAction(action: PhoneAction): Promise<ActionResult> {
  const store = useAether.getState();
  let result: ActionResult;
  let applied: PhoneAction = action;

  if (action.action === "note" || action.action === "reminder") {
    // In-app features: the phone has nothing to do, so never send these to the bridge.
    result = runLocalAction(action);
  } else {
    const prepared = prepare(action);
    if ("error" in prepared) {
      result = { ok: false, native: false, message: prepared.error };
    } else {
      applied = prepared.action;
      result = (await nativeExecute(applied)) ?? (await runWebAction(applied));
    }
  }

  // Only mirror state that actually changed.
  if (result.ok) applyLocal(applied);
  store.setLastAction(result.message);
  return result;
}

function runLocalAction(action: PhoneAction): ActionResult {
  const text = String(action.target ?? action.extra ?? "").trim();
  if (!text) {
    return {
      ok: false,
      native: false,
      message: action.action === "note" ? "What should I note down?" : "What should I remind you about?",
    };
  }
  return {
    ok: true,
    native: false,
    message: action.action === "note" ? `Saved note: ${text}` : `Reminder saved: ${text}`,
  };
}

function applyLocal(action: PhoneAction) {
  const s = useAether.getState();
  switch (action.action) {
    case "flashlight_on":
      s.patchDevice({ flashlight: true });
      break;
    case "flashlight_off":
      s.patchDevice({ flashlight: false });
      break;
    case "volume":
      s.patchDevice({ volume: parseLevel(action.value, 11, 0, 15) });
      break;
    case "brightness":
      s.patchDevice({ brightness: parseLevel(action.value, 70, 5, 100) });
      break;
    case "note": {
      const text = String(action.target ?? action.extra ?? "").trim();
      if (text) s.addNote(text);
      break;
    }
    case "reminder": {
      const text = String(action.target ?? action.extra ?? "").trim();
      // Reminders are in-app only and default to an hour from now.
      if (text) s.addReminder(text, Date.now() + 60 * 60 * 1000);
      break;
    }
    case "timer": {
      const seconds = parseTimerSeconds(action.value);
      if (seconds !== null) s.addTimer(String(action.extra ?? "Timer"), seconds);
      break;
    }
    case "camera":
      s.patchDevice({ cameraOpen: true });
      break;
    default:
      break;
  }
}

async function runWebAction(action: PhoneAction): Promise<ActionResult> {
  switch (action.action) {
    case "flashlight_on": {
      const ok = await setTorch(true);
      return {
        ok: true,
        native: false,
        message: ok
          ? "Flashlight on."
          : "Flashlight overlay on. On the phone APK this uses the real torch.",
      };
    }
    case "flashlight_off": {
      await setTorch(false);
      return { ok: true, native: false, message: "Flashlight off." };
    }
    case "volume":
      return {
        ok: true,
        native: false,
        message: `Volume set to ${action.value ?? 11} of 15 in Aether. The APK changes the real ringer.`,
      };
    case "brightness":
      return {
        ok: true,
        native: false,
        message: `Brightness ${action.value ?? 70}%. The APK writes the real screen level.`,
      };
    case "call": {
      const n = String(action.target ?? "").replace(/[^\d+]/g, "");
      if (!n) {
        return { ok: false, native: false, message: "Who should I call?" };
      }
      openUrl(`tel:${n}`);
      return { ok: true, native: false, message: `Opening dialer for ${n}.` };
    }
    case "sms": {
      const n = String(action.target ?? "").replace(/[^\d+]/g, "");
      const body = encodeURIComponent(String(action.extra ?? action.value ?? ""));
      if (!n) {
        return { ok: false, native: false, message: "Who should I text?" };
      }
      openUrl(`sms:${n}?body=${body}`);
      return { ok: true, native: false, message: `Opening messages to ${n}.` };
    }
    case "alarm": {
      const { hour, minute } = parseClockTime(action.value) ?? { hour: 7, minute: 0 };
      openUrl(
        intentUrl(
          "android.intent.action.SET_ALARM",
          `S.android.intent.extra.alarm.HOUR=${hour};S.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(String(action.extra ?? "Aether"))};`,
        ),
      );
      useAether
        .getState()
        .addReminder(
          action.extra ? String(action.extra) : `Alarm ${hour}:${String(minute).padStart(2, "0")}`,
          Date.now() + 60 * 1000,
        );
      return {
        ok: true,
        native: false,
        message: `Alarm set for ${hour}:${String(minute).padStart(2, "0")}.`,
      };
    }
    case "timer": {
      const seconds = parseTimerSeconds(action.value) ?? 60;
      return {
        ok: true,
        native: false,
        message: `Timer running for ${seconds} seconds.`,
      };
    }
    case "open_app": {
      const key = String(action.target ?? action.extra ?? "")
        .toLowerCase()
        .trim();
      const hit =
        APP_ALIASES[key] ??
        Object.entries(APP_ALIASES).find(([name]) => key.includes(name))?.[1];
      if (hit?.web) openUrl(hit.web);
      else if (hit?.intent) openUrl(intentUrl(hit.intent));
      else if (hit?.pkg) {
        openUrl(`intent://#Intent;package=${hit.pkg};end`);
      } else {
        return {
          ok: false,
          native: false,
          message: `I don't have a shortcut for ${key || "that app"} yet.`,
        };
      }
      return { ok: true, native: false, message: `Opening ${key}.` };
    }
    case "camera": {
      openUrl(intentUrl("android.media.action.STILL_IMAGE_CAMERA"));
      return { ok: true, native: false, message: "Camera ready." };
    }
    case "lock":
    case "home":
    case "back":
      return {
        ok: false,
        native: false,
        message: `I can only ${action.action} the phone from the Aether app with Accessibility turned on.`,
      };
    case "wifi":
      openUrl(intentUrl("android.settings.WIFI_SETTINGS"));
      return { ok: true, native: false, message: "Opening Wi-Fi settings." };
    case "bluetooth":
      openUrl(intentUrl("android.settings.BLUETOOTH_SETTINGS"));
      return {
        ok: true,
        native: false,
        message: "Opening Bluetooth settings.",
      };
    case "navigate": {
      const q = encodeURIComponent(String(action.target ?? action.extra ?? ""));
      openUrl(`https://maps.google.com/?q=${q}`);
      return { ok: true, native: false, message: `Navigating to ${action.target}.` };
    }
    default:
      return { ok: false, native: false, message: "I can't do that yet." };
  }
}

export async function runPhoneActions(actions: PhoneAction[]) {
  const results: ActionResult[] = [];
  for (const action of actions.slice(0, 4)) {
    results.push(await runPhoneAction(action));
  }
  return results;
}
