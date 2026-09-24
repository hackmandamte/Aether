import type { LocalModelId, LocalModelSpec } from "./types";

/** Metadata only — weights are never committed. */
export const LOCAL_MODEL_CATALOG: readonly LocalModelSpec[] = [
  {
    id: "qwen2.5-0.5b-instruct",
    displayName: "Qwen2.5 0.5B Instruct",
    family: "qwen2.5",
    paramsLabel: "0.5B",
    diskMb: 520,
    ramMb: 750,
    quant: "Q4_K_M / dynamic_int8 (runtime-dependent)",
    format: "gguf",
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct",
    notes:
      "Primary budget-phone candidate. Prefer GGUF via llama.cpp or LiteRT. Not bundled in the APK.",
    recommendedForBudgetPhone: true,
  },
  {
    id: "qwen2.5-1.5b-instruct",
    displayName: "Qwen2.5 1.5B Instruct",
    family: "qwen2.5",
    paramsLabel: "1.5B",
    diskMb: 1100,
    ramMb: 1600,
    quant: "Q4_K_M",
    format: "gguf",
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct",
    notes: "Optional for 6–8GB devices; may throttle on 4GB phones.",
    recommendedForBudgetPhone: false,
  },
] as const;

export function getLocalModelSpec(id: LocalModelId): LocalModelSpec | undefined {
  return LOCAL_MODEL_CATALOG.find((m) => m.id === id);
}

export function defaultLocalModelId(): LocalModelId {
  return "qwen2.5-0.5b-instruct";
}
