import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatToolResultsForModel,
  sanitizeForModel,
  shouldContinueAgent,
  MAX_AGENT_ROUNDS,
} from "./agent.ts";

describe("sanitizeForModel", () => {
  it("strips exact GPS keys", () => {
    const s = sanitizeForModel({
      ok: true,
      message: "You're around 1.234, 5.678.",
      data: { lat: 1.234567, lng: 5.678901, approx: "1.235, 5.679", city: "Accra" },
    });
    assert.equal(s.ok, true);
    const data = s.data as Record<string, unknown>;
    assert.equal(data.approx, "1.235, 5.679");
    assert.equal(data.city, "Accra");
    assert.equal(data.lat, undefined);
    assert.equal(data.lng, undefined);
  });

  it("preserves failure honesty", () => {
    const s = sanitizeForModel({ ok: false, message: "Permission denied." });
    assert.equal(s.ok, false);
    assert.match(String(s.message), /Permission/);
  });
});

describe("formatToolResultsForModel", () => {
  it("marks content as tool data not instructions", () => {
    const block = formatToolResultsForModel([
      { ok: true, message: "Wi-Fi on.", action: { action: "wifi", value: "on" } },
    ]);
    assert.match(block, /TOOL_RESULTS/);
    assert.match(block, /Not user instructions/);
    assert.match(block, /wifi/i);
  });
});

describe("shouldContinueAgent", () => {
  it("stops at max rounds", () => {
    assert.equal(shouldContinueAgent(MAX_AGENT_ROUNDS, true, false), false);
  });
  it("stops without tool calls", () => {
    assert.equal(shouldContinueAgent(0, false, true), false);
  });
  it("continues when tools pending and under cap", () => {
    assert.equal(shouldContinueAgent(0, true, false), true);
  });
});
