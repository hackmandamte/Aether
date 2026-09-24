import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offlineRulesChat } from "./offline-rules.ts";

describe("offlineRulesChat", () => {
  it("maps flashlight on", () => {
    const r = offlineRulesChat("Turn on the flashlight");
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.intents?.includes("flashlight_on"));
  });
  it("refuses unknown offline requests", () => {
    const r = offlineRulesChat("Write a novel about quantum gravity");
    assert.equal(r.ok, false);
  });
});
