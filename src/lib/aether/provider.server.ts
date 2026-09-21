/**
 * Which AI service backs Aether, chosen by environment variables (no code edits needed).
 *
 *   AETHER_PROVIDER = xai (default) | groq
 *   xai : XAI_API_KEY  (paid; chat + speech-to-text + text-to-speech)
 *   groq: GROQ_API_KEY (free tier, no card; chat + speech-to-text, the phone speaks with its own voice)
 *
 * Optional overrides: LLM_MODEL, STT_MODEL (handy if a provider retires a model),
 * or AETHER_API_KEY instead of the provider-specific key.
 */

export type Provider = {
  name: "xai" | "groq";
  key: string | undefined;
  chatUrl: string;
  chatModel: string;
  sttUrl: string;
  sttModel: string;
  /** null = this provider has no text-to-speech; the phone's own voice is used. */
  ttsUrl: string | null;
};

type Env = Record<string, string | undefined>;

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function resolveProvider(env: Env): Provider {
  const name = (clean(env.AETHER_PROVIDER) ?? "xai").toLowerCase();
  const llmModel = clean(env.LLM_MODEL);
  const sttModel = clean(env.STT_MODEL);
  const shared = clean(env.AETHER_API_KEY);

  if (name === "groq") {
    const base = "https://api.groq.com/openai/v1";
    return {
      name: "groq",
      key: clean(env.GROQ_API_KEY) ?? shared,
      chatUrl: `${base}/chat/completions`,
      chatModel: llmModel ?? "openai/gpt-oss-120b",
      sttUrl: `${base}/audio/transcriptions`,
      sttModel: sttModel ?? "whisper-large-v3-turbo",
      ttsUrl: null,
    };
  }

  const base = "https://api.x.ai/v1";
  return {
    name: "xai",
    key: clean(env.XAI_API_KEY) ?? shared,
    chatUrl: `${base}/chat/completions`,
    chatModel: llmModel ?? "grok-4.5",
    sttUrl: `${base}/stt`,
    sttModel: sttModel ?? "grok-voice-transcribe-2.0",
    ttsUrl: `${base}/tts`,
  };
}

export function getProvider(): Provider {
  return resolveProvider(process.env);
}
