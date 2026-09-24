export type {
  BrainMode,
  BrainProviderId,
  BrainRequest,
  BrainDecision,
  BrainChatResult,
  LocalModelId,
  LocalModelSpec,
  LocalModelStatus,
} from "./types";
export { LOCAL_MODEL_CATALOG, getLocalModelSpec, defaultLocalModelId } from "./catalog";
export {
  getModelManagerState,
  subscribeModelManager,
  listAvailableModels,
  selectModel,
  startModelDownload,
  cancelDownload,
  loadModel,
  unloadModel,
  isLocalBrainReady,
} from "./model-manager";
export { routeBrain } from "./router";
export type { RouteOptions } from "./router";
export { offlineRulesChat } from "./offline-rules";
export { localQwenChat } from "./local-runtime";

import { routeBrain } from "./router";
import { localQwenChat } from "./local-runtime";
import { offlineRulesChat } from "./offline-rules";
import type { BrainChatResult, BrainMode, BrainRequest } from "./types";
import { etaLog } from "../log";

export async function runLocalOrRules(
  req: BrainRequest,
  mode: BrainMode,
  online: boolean,
): Promise<BrainChatResult | null> {
  const decision = routeBrain(req, { mode, online });
  etaLog("Brain route", {
    provider: decision.provider,
    reason: decision.reason,
  });

  if (decision.provider === "offline-rules") {
    return offlineRulesChat(req.text);
  }
  if (decision.provider === "local-qwen") {
    return localQwenChat(req);
  }
  return null;
}
