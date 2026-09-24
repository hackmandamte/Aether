import { defaultLocalModelId, getLocalModelSpec, LOCAL_MODEL_CATALOG } from "./catalog";
import type { LocalModelId, LocalModelStatus } from "./types";
import { etaLog } from "../log";

export type ModelManagerState = {
  selectedId: LocalModelId;
  status: LocalModelStatus;
  progressPct: number;
  error?: string;
  localPath?: string;
  loaded: boolean;
};

type Listener = (s: ModelManagerState) => void;

let state: ModelManagerState = {
  selectedId: defaultLocalModelId(),
  status: "not_downloaded",
  progressPct: 0,
  loaded: false,
};

const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try {
      l({ ...state });
    } catch {
      /* ignore */
    }
  }
}

export function getModelManagerState(): ModelManagerState {
  return { ...state };
}

export function subscribeModelManager(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listAvailableModels() {
  return LOCAL_MODEL_CATALOG.map((m) => ({ ...m }));
}

export function selectModel(id: LocalModelId): void {
  if (!getLocalModelSpec(id)) return;
  state = {
    ...state,
    selectedId: id,
    status: state.selectedId === id ? state.status : "not_downloaded",
    progressPct: 0,
    loaded: false,
    error: undefined,
  };
  emit();
}

export async function startModelDownload(
  id: LocalModelId = state.selectedId,
): Promise<{ ok: boolean; error?: string }> {
  const spec = getLocalModelSpec(id);
  if (!spec) return { ok: false, error: "Unknown model." };

  state = {
    ...state,
    selectedId: id,
    status: "downloading",
    progressPct: 0,
    error: undefined,
  };
  emit();
  etaLog("Local model download requested", { id, diskMb: spec.diskMb });

  if (typeof window !== "undefined" && window.AetherNative?.postMessage) {
    try {
      const result = await postNativeLlm({
        action: "llm_download",
        modelId: id,
        sourceUrl: spec.sourceUrl,
      });
      if (result?.ok) {
        state = {
          ...state,
          status: "ready",
          progressPct: 100,
          localPath: typeof result.path === "string" ? result.path : undefined,
          loaded: false,
        };
        emit();
        return { ok: true };
      }
      state = {
        ...state,
        status: "error",
        error: result?.message ?? "Native download failed.",
      };
      emit();
      return { ok: false, error: state.error };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed.";
      state = { ...state, status: "error", error: msg };
      emit();
      return { ok: false, error: msg };
    }
  }

  state = {
    ...state,
    status: "unsupported",
    error:
      "Local Qwen needs the Android native runtime (llama.cpp / LiteRT). " +
      "Weights are not bundled in the APK. Use an ETA build with on-device inference, then download from Settings.",
  };
  emit();
  return { ok: false, error: state.error };
}

export function cancelDownload(): void {
  if (state.status === "downloading") {
    void postNativeLlm({ action: "llm_download_cancel", modelId: state.selectedId });
    state = { ...state, status: "not_downloaded", progressPct: 0 };
    emit();
  }
}

export async function loadModel(): Promise<{ ok: boolean; error?: string }> {
  if (state.status !== "ready" && state.status !== "loaded") {
    return { ok: false, error: "Model is not downloaded." };
  }
  state = { ...state, status: "loading", error: undefined };
  emit();

  const result = await postNativeLlm({
    action: "llm_load",
    modelId: state.selectedId,
    path: state.localPath,
  });

  if (result?.ok) {
    state = { ...state, status: "loaded", loaded: true };
    emit();
    return { ok: true };
  }

  const error = result?.message ?? "Could not load local model (native runtime required).";
  state = { ...state, status: "error", loaded: false, error };
  emit();
  return { ok: false, error };
}

export async function unloadModel(): Promise<void> {
  await postNativeLlm({ action: "llm_unload", modelId: state.selectedId });
  state = {
    ...state,
    loaded: false,
    status: state.status === "loaded" ? "ready" : state.status,
  };
  emit();
  etaLog("Local model unloaded", { id: state.selectedId });
}

export function isLocalBrainReady(): boolean {
  return state.loaded && state.status === "loaded";
}

type NativeLlmReply = {
  ok?: boolean;
  message?: string;
  path?: string;
  text?: string;
};

async function postNativeLlm(body: Record<string, unknown>): Promise<NativeLlmReply | null> {
  const channel = typeof window !== "undefined" ? window.AetherNative : undefined;
  if (!channel?.postMessage) return null;

  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => resolve(null), 60_000);
    const handler = (event: { data: unknown }) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: string;
          result?: NativeLlmReply;
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
      channel.postMessage(JSON.stringify({ id, ...body }));
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}
