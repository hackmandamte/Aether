import {
  formatClockTime,
  parseClockTime,
  parseLevel,
  parseTimerSeconds,
} from "./parse";
import { setAccessCode } from "./access";
import { useAether } from "./store";
import type { ActionResult, PhoneAction } from "./types";
import { allowPhoneAction } from "./security";

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
type NativeReply = ActionResult & { accessCode?: string; latitude?: number; longitude?: number };
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
      /* ignore */
    }
  });
}

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
  const payload: Record<string, unknown> = { action: action.action };
  if (action.value !== undefined && action.value !== null) payload.value = String(action.value);
  if (action.target !== undefined && action.target !== null) payload.target = String(action.target);
  if (action.extra !== undefined && action.extra !== null) payload.extra = String(action.extra);
  return postNative({ action: payload });
}

let nativeCode: string | null = null;
let nativeCodeFetched = false;

export async function getNativeAccessCode(): Promise<string> {
  if (!isNativeBridge()) return "";
  if (nativeCodeFetched) return nativeCode ?? "";
  nativeCodeFetched = true;
  const reply = await postNative({ type: "config" });
  if (reply?.ok && typeof reply.accessCode === "string" && reply.accessCode.trim()) {
    nativeCode = reply.accessCode.trim();
    setAccessCode(nativeCode);
  } else {
    nativeCode = "";
  }
  return nativeCode;
}

function openUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.target = "_blank";
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
    const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
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

const APP_ALIASES: Record<string, { intent?: string; web?: string; pkg?: string }> = {
  whatsapp: { web: "https://wa.me/", pkg: "com.whatsapp" },
  "whatsapp business": { pkg: "com.whatsapp.w4b" },
  telegram: { web: "https://t.me/", pkg: "org.telegram.messenger" },
  signal: { pkg: "org.thoughtcrime.securesms" },
  instagram: { web: "https://instagram.com", pkg: "com.instagram.android" },
  facebook: { web: "https://m.facebook.com", pkg: "com.facebook.katana" },
  messenger: { pkg: "com.facebook.orca" },
  tiktok: { web: "https://www.tiktok.com", pkg: "com.zhiliaoapp.musically" },
  twitter: { web: "https://x.com", pkg: "com.twitter.android" },
  x: { web: "https://x.com", pkg: "com.twitter.android" },
  snapchat: { pkg: "com.snapchat.android" },
  youtube: { web: "https://m.youtube.com", pkg: "com.google.android.youtube" },
  "youtube music": { pkg: "com.google.android.apps.youtube.music" },
  spotify: { web: "https://open.spotify.com", pkg: "com.spotify.music" },
  netflix: { web: "https://www.netflix.com", pkg: "com.netflix.mediaclient" },
  chrome: { web: "https://www.google.com", pkg: "com.android.chrome" },
  browser: { web: "https://www.google.com", pkg: "com.android.chrome" },
  gmail: { web: "https://mail.google.com", pkg: "com.google.android.gm" },
  mail: { web: "https://mail.google.com", pkg: "com.google.android.gm" },
  email: { web: "https://mail.google.com", pkg: "com.google.android.gm" },
  phone: { intent: "android.intent.action.DIAL", pkg: "com.android.dialer" },
  dialer: { intent: "android.intent.action.DIAL", pkg: "com.android.dialer" },
  contacts: { pkg: "com.android.contacts" },
  messages: { web: "sms:", pkg: "com.google.android.apps.messaging" },
  sms: { web: "sms:", pkg: "com.google.android.apps.messaging" },
  camera: {
    intent: "android.media.action.STILL_IMAGE_CAMERA",
    pkg: "com.transsion.camera",
  },
  settings: { intent: "android.settings.SETTINGS", pkg: "com.android.settings" },
  maps: { web: "https://maps.google.com", pkg: "com.google.android.apps.maps" },
  google: { web: "https://www.google.com", pkg: "com.google.android.googlequicksearchbox" },
  clock: { pkg: "com.transsion.deskclock" },
  calendar: { pkg: "com.google.android.calendar" },
  files: { pkg: "com.transsion.filemanagerx" },
  gallery: { pkg: "com.google.android.apps.photos" },
  photos: { pkg: "com.google.android.apps.photos" },
  play: { web: "https://play.google.com/store", pkg: "com.android.vending" },
  "play store": { web: "https://play.google.com/store", pkg: "com.android.vending" },
  calculator: { pkg: "com.google.android.calculator" },
  weather: { pkg: "com.google.android.apps.weather" },
  uber: { pkg: "com.ubercab" },
  bolt: { pkg: "com.bolt.client" },
};

type Prepared = { action: PhoneAction } | { error: string };

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
      return {
        action: { ...action, value: String(parseLevel(action.value ?? action.target, 11, 0, 15)) },
      };
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

  const gate = await allowPhoneAction(action, async (a) => {
    if (typeof window === "undefined") return false;
    const label =
      a.action === "call"
        ? `Place a call${a.target ? ` to ${a.target}` : ""}?`
        : a.action === "sms"
          ? `Send a message${a.target ? ` to ${a.target}` : ""}?`
          : a.action === "navigate"
            ? "Open navigation for this destination?"
            : a.action === "lock"
              ? "Lock the phone?"
              : `Allow action: ${a.action}?`;
    return window.confirm(label);
  });
  if (!gate.allowed) {
    return { ok: false, native: false, message: gate.reason ?? "Action blocked." };
  }

  if (action.action === "note" || action.action === "reminder") {
    result = runLocalAction(action);
  } else {
    const prepared = prepare(action);
    if ("error" in prepared) {
      result = { ok: false, native: false, message: prepared.error };
    } else {
      applied = prepared.action;
      const native = await nativeExecute(applied);
      if (native) {
        result = native;
      } else {
        result = await runWebAction(applied);
      }
    }
  }

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
      message:
        action.action === "note" ? "What should I note down?" : "What should I remind you about?",
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

async function getBrowserLocation(): Promise<ActionResult> {
  if (!navigator.geolocation) {
    return {
      ok: false,
      native: false,
      message: "Location is not available in this browser. Use the Eta app on your phone.",
    };
  }
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      });
    });
    const { latitude, longitude } = pos.coords;
    openUrl(`https://maps.google.com/?q=${latitude},${longitude}`);
    return {
      ok: true,
      native: false,
      message: `You're around ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Opening maps.`,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? Number((err as GeolocationPositionError).code)
        : 0;
    if (code === 1) {
      return {
        ok: false,
        native: false,
        message: "Location permission denied. Allow it in the browser, then try again.",
      };
    }
    if (code === 2) {
      return { ok: false, native: false, message: "Location is unavailable right now." };
    }
    if (code === 3) {
      return { ok: false, native: false, message: "Location timed out. Try again outdoors." };
    }
    return {
      ok: false,
      native: false,
      message: "Couldn't get location. Allow permission and try again.",
    };
  }
}

function launchAnyApp(name: string): ActionResult {
  const key = name.toLowerCase().trim();
  if (!key) return { ok: false, native: false, message: "Which app should I open?" };

  const hit =
    APP_ALIASES[key] ??
    Object.entries(APP_ALIASES).find(([n]) => key.includes(n) || n.includes(key))?.[1];

  if (hit?.web) {
    openUrl(hit.web);
    return { ok: true, native: false, message: `Opening ${name}.` };
  }
  if (hit?.intent) {
    openUrl(intentUrl(hit.intent));
    return { ok: true, native: false, message: `Opening ${name}.` };
  }
  if (hit?.pkg) {
    openUrl(`intent://#Intent;package=${hit.pkg};end`);
    return { ok: true, native: false, message: `Opening ${name}.` };
  }
  openUrl(`https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps`);
  return {
    ok: true,
    native: false,
    message: `Couldn't open ${name} here. Opened Play Store search.`,
  };
}

async function runWebAction(action: PhoneAction): Promise<ActionResult> {
  switch (action.action) {
    case "flashlight_on": {
      const ok = await setTorch(true);
      if (!ok) {
        return {
          ok: false,
          native: false,
          message: "Can't control the flashlight in the browser. Use the Eta app on your phone.",
        };
      }
      return { ok: true, native: false, message: "Flashlight on." };
    }
    case "flashlight_off": {
      await setTorch(false);
      return { ok: true, native: false, message: "Flashlight off." };
    }
    case "volume":
      return {
        ok: false,
        native: false,
        message: "I can only change real volume from the Eta app on your phone.",
      };
    case "brightness":
      return {
        ok: false,
        native: false,
        message: "I can only change real brightness from the Eta app on your phone.",
      };
    case "call": {
      const n = String(action.target ?? "").replace(/[^\d+]/g, "");
      if (!n) return { ok: false, native: false, message: "Who should I call?" };
      openUrl(`tel:${n}`);
      return { ok: true, native: false, message: `Opening dialer for ${n}.` };
    }
    case "sms": {
      const n = String(action.target ?? "").replace(/[^\d+]/g, "");
      const body = encodeURIComponent(String(action.extra ?? action.value ?? ""));
      if (!n) return { ok: false, native: false, message: "Who should I text?" };
      openUrl(`sms:${n}?body=${body}`);
      return { ok: true, native: false, message: `Opening messages to ${n}.` };
    }
    case "alarm": {
      const { hour, minute } = parseClockTime(action.value) ?? { hour: 7, minute: 0 };
      openUrl(
        intentUrl(
          "android.intent.action.SET_ALARM",
          `S.android.intent.extra.alarm.HOUR=${hour};S.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(String(action.extra ?? "Eta"))};`,
        ),
      );
      return {
        ok: true,
        native: false,
        message: `Trying to set alarm for ${hour}:${String(minute).padStart(2, "0")}. Best from the Eta app.`,
      };
    }
    case "timer": {
      const seconds = parseTimerSeconds(action.value);
      if (seconds === null) {
        return { ok: false, native: false, message: "How long should the timer run?" };
      }
      return {
        ok: true,
        native: false,
        message: `Timer set for ${seconds} seconds in Eta. On the phone app this also starts the system timer.`,
      };
    }
    case "open_app":
      return launchAnyApp(String(action.target ?? action.extra ?? ""));
    case "camera": {
      openUrl(intentUrl("android.media.action.STILL_IMAGE_CAMERA"));
      return { ok: true, native: false, message: "Opening camera." };
    }
    case "lock":
    case "home":
    case "back":
      return {
        ok: false,
        native: false,
        message: `I can only ${action.action} the phone from the Eta app with Accessibility turned on.`,
      };
    case "wifi":
      openUrl(intentUrl("android.settings.WIFI_SETTINGS"));
      return { ok: true, native: false, message: "Opening Wi-Fi settings." };
    case "bluetooth":
      openUrl(intentUrl("android.settings.BLUETOOTH_SETTINGS"));
      return { ok: true, native: false, message: "Opening Bluetooth settings." };
    case "navigate": {
      const q = encodeURIComponent(String(action.target ?? action.extra ?? ""));
      if (!q) return { ok: false, native: false, message: "Where should I navigate to?" };
      openUrl(`https://maps.google.com/?q=${q}`);
      return { ok: true, native: false, message: `Navigating to ${action.target}.` };
    }
    case "location":
      return getBrowserLocation();
    case "search_web": {
      const q = encodeURIComponent(String(action.target ?? action.extra ?? action.value ?? ""));
      if (!q) return { ok: false, native: false, message: "What should I search for?" };
      openUrl(`https://www.google.com/search?q=${q}`);
      return { ok: true, native: false, message: "Searching the web for that." };
    }
    case "open_url": {
      let url = String(action.target ?? action.extra ?? action.value ?? "").trim();
      if (!url) return { ok: false, native: false, message: "Which website?" };
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      openUrl(url);
      return { ok: true, native: false, message: `Opening ${url}.` };
    }
    default:
      return { ok: false, native: false, message: "I can't do that yet." };
  }
}

export async function runPhoneActions(
  actions: PhoneAction[],
  opts: {
    shouldContinue?: () => boolean;
    onAction?: (action: PhoneAction) => void;
  } = {},
) {
  const results: ActionResult[] = [];
  for (const action of actions.slice(0, 12)) {
    if (opts.shouldContinue && !opts.shouldContinue()) break;
    opts.onAction?.(action);
    results.push(await runPhoneAction(action));
  }
  return results;
}
