import type { BrainChatResult } from "./types";

export function offlineRulesChat(text: string): BrainChatResult {
  const t = text.trim();
  if (!t) {
    return { ok: false, provider: "offline-rules", error: "Empty request." };
  }

  const intents: string[] = [];
  if (/\b(flash\s*light|torch)\s+on\b/i.test(t) || /\bturn\s+on\s+(the\s+)?(flash|torch)/i.test(t)) {
    intents.push("flashlight_on");
  }
  if (/\b(flash\s*light|torch)\s+off\b/i.test(t) || /\bturn\s+off\s+(the\s+)?(flash|torch)/i.test(t)) {
    intents.push("flashlight_off");
  }
  if (/\b(wi-?fi|wifi)\s+on\b/i.test(t) || /\bturn\s+on\s+(the\s+)?wi-?fi\b/i.test(t)) {
    intents.push("wifi_on");
  }
  if (/\b(wi-?fi|wifi)\s+off\b/i.test(t) || /\bturn\s+off\s+(the\s+)?wi-?fi\b/i.test(t)) {
    intents.push("wifi_off");
  }
  if (/\b(date|time)\b/i.test(t)) {
    intents.push("datetime");
  }

  if (!intents.length) {
    return {
      ok: false,
      provider: "offline-rules",
      error:
        "I'm offline and the local model isn't ready. I can still try simple phone actions like flashlight or Wi-Fi when you ask clearly.",
      retryable: true,
    };
  }

  const lines = intents.map((i) => {
    switch (i) {
      case "flashlight_on":
        return "Turning the flashlight on.";
      case "flashlight_off":
        return "Turning the flashlight off.";
      case "wifi_on":
        return "Turning Wi-Fi on.";
      case "wifi_off":
        return "Turning Wi-Fi off.";
      case "datetime":
        return "Checking the date and time on this phone.";
      default:
        return i;
    }
  });

  return {
    ok: true,
    provider: "offline-rules",
    text: lines.join(" "),
    intents,
  };
}
