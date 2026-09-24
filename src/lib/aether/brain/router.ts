import type { BrainDecision, BrainMode, BrainRequest } from "./types";
import { isLocalBrainReady } from "./model-manager";

const SIMPLE_RE =
  /\b(flash\s*light|torch|wi-?fi|bluetooth|hotspot|volume|brightness|lock|home|back|open\s+\w+|turn\s+on|turn\s+off|alarm|timer|note|reminder)\b/i;

const INFO_RE =
  /\b(weather|forecast|temperature|location|where\s+am\s+i|nearby|pharmacy|shop|restaurant|hospital|search\s+the\s+web|what\s+is|who\s+is|explain|research)\b/i;

const COMPLEX_RE =
  /\b(compare|analyze|plan\s+a|write\s+a\s+(long|detailed)|summarize\s+this\s+article|debug|code\s+review)\b/i;

export type RouteOptions = {
  mode: BrainMode;
  online?: boolean;
};

export function routeBrain(req: BrainRequest, opts: RouteOptions): BrainDecision {
  const online = opts.online !== false && !req.offline;
  const text = req.text.trim();
  const localReady = isLocalBrainReady();

  if (opts.mode === "cloud") {
    if (!online) {
      return {
        provider: "offline-rules",
        reason: "Cloud mode but offline — rule fallback for simple actions only.",
        needsNetwork: false,
      };
    }
    return {
      provider: "xai",
      reason: "User selected cloud brain.",
      needsNetwork: true,
    };
  }

  if (opts.mode === "local") {
    if (localReady) {
      return {
        provider: "local-qwen",
        reason: "User selected local brain; model loaded.",
        needsNetwork: false,
      };
    }
    return {
      provider: "offline-rules",
      reason: "Local mode but model not loaded — offline rules only.",
      needsNetwork: false,
    };
  }

  if (!online) {
    if (localReady) {
      return {
        provider: "local-qwen",
        reason: "Offline hybrid → local model.",
        needsNetwork: false,
      };
    }
    return {
      provider: "offline-rules",
      reason: "Offline hybrid → rules (no local model).",
      needsNetwork: false,
    };
  }

  if (COMPLEX_RE.test(text) || (INFO_RE.test(text) && text.length > 160)) {
    return {
      provider: "xai",
      reason: "Hybrid: complex / research → cloud.",
      needsNetwork: true,
    };
  }

  if (SIMPLE_RE.test(text) && localReady) {
    return {
      provider: "local-qwen",
      reason: "Hybrid: simple command → local.",
      needsNetwork: false,
    };
  }

  if (SIMPLE_RE.test(text) && !localReady) {
    return {
      provider: "xai",
      reason: "Hybrid: simple command, local unavailable → cloud.",
      needsNetwork: true,
    };
  }

  return {
    provider: "xai",
    reason: "Hybrid default → cloud.",
    needsNetwork: true,
  };
}
