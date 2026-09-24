export type BrainMode = "cloud" | "local" | "hybrid";

export type BrainProviderId = "xai" | "groq" | "local-qwen" | "offline-rules";

export type LocalModelId = "qwen2.5-0.5b-instruct" | "qwen2.5-1.5b-instruct";

export type LocalModelStatus =
  | "not_downloaded"
  | "downloading"
  | "ready"
  | "loading"
  | "loaded"
  | "error"
  | "unsupported";

export type LocalModelSpec = {
  id: LocalModelId;
  displayName: string;
  family: "qwen2.5";
  paramsLabel: string;
  diskMb: number;
  ramMb: number;
  quant: string;
  format: "gguf" | "litert" | "unknown";
  sourceUrl: string;
  notes: string;
  recommendedForBudgetPhone: boolean;
};

export type BrainRequest = {
  text: string;
  language?: string;
  offline?: boolean;
};

export type BrainDecision = {
  provider: BrainProviderId;
  reason: string;
  needsNetwork: boolean;
};

export type BrainChatResult =
  | {
      ok: true;
      provider: BrainProviderId;
      text: string;
      intents?: string[];
    }
  | {
      ok: false;
      provider: BrainProviderId;
      error: string;
      retryable?: boolean;
    };
