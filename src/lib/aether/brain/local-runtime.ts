import { offlineRulesChat } from "./offline-rules";
import { isLocalBrainReady, getModelManagerState } from "./model-manager";
import type { BrainChatResult, BrainRequest } from "./types";
import { etaLog } from "../log";

export async function localQwenChat(req: BrainRequest): Promise<BrainChatResult> {
  if (!isLocalBrainReady()) {
    etaLog("Local Qwen not loaded — offline rules");
    return offlineRulesChat(req.text);
  }

  const channel = typeof window !== "undefined" ? window.AetherNative : undefined;
  if (!channel?.postMessage) {
    return {
      ok: false,
      provider: "local-qwen",
      error: "Native local-inference bridge not available.",
      retryable: false,
    };
  }

  const state = getModelManagerState();
  etaLog("Local Qwen generate", { modelId: state.selectedId });

  const result = await new Promise<{
    ok?: boolean;
    text?: string;
    message?: string;
  } | null>((resolve) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => resolve(null), 45_000);
    const handler = (event: { data: unknown }) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: string;
          result?: { ok?: boolean; text?: string; message?: string };
        };
        if (msg.id === id) {
          window.clearTimeout(timer);
          channel.removeEventListener?.("message", handler as never);
          resolve(msg.result ?? null);
        }
      } catch {
        /* ignore */
      }
    };
    channel.addEventListener("message", handler as never);
    try {
      channel.postMessage(
        JSON.stringify({
          id,
          action: "llm_chat",
          modelId: state.selectedId,
          text: req.text.slice(0, 2000),
          language: req.language,
          system:
            "You are ETA on this phone. Prefer short answers. " +
            "For phone actions reply with JSON intents when possible.",
        }),
      );
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });

  if (!result) {
    return {
      ok: false,
      provider: "local-qwen",
      error:
        "Local model did not respond. The APK may not include on-device inference yet.",
      retryable: true,
    };
  }

  if (!result.ok || !result.text) {
    return {
      ok: false,
      provider: "local-qwen",
      error: result.message ?? "Local generation failed.",
      retryable: true,
    };
  }

  return {
    ok: true,
    provider: "local-qwen",
    text: result.text.slice(0, 1200),
  };
}
