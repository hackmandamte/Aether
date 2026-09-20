import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProvider } from "./provider.server.ts";

test("defaults to xAI, as before", () => {
  const p = resolveProvider({ XAI_API_KEY: " k1 " });
  assert.equal(p.name, "xai");
  assert.equal(p.key, "k1");
  assert.equal(p.chatModel, "grok-4.5");
  assert.equal(p.ttsUrl, "https://api.x.ai/v1/tts");
});

test("groq preset: free models, no server TTS", () => {
  const p = resolveProvider({ AETHER_PROVIDER: "Groq", GROQ_API_KEY: "g1", XAI_API_KEY: "x1" });
  assert.equal(p.name, "groq");
  assert.equal(p.key, "g1");
  assert.equal(p.chatUrl, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(p.sttUrl, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(p.ttsUrl, null);
});

test("model overrides and shared key", () => {
  const p = resolveProvider({
    AETHER_PROVIDER: "groq",
    AETHER_API_KEY: "shared",
    LLM_MODEL: "some-other-model",
    STT_MODEL: "some-stt",
  });
  assert.equal(p.key, "shared");
  assert.equal(p.chatModel, "some-other-model");
  assert.equal(p.sttModel, "some-stt");
});

test("blank values are ignored; unknown provider falls back to xAI", () => {
  const p = resolveProvider({ AETHER_PROVIDER: "  ", XAI_API_KEY: "", LLM_MODEL: "  " });
  assert.equal(p.name, "xai");
  assert.equal(p.key, undefined);
  assert.equal(p.chatModel, "grok-4.5");
  assert.equal(resolveProvider({ AETHER_PROVIDER: "nope" }).name, "xai");
});
