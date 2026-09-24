/**
 * Lightweight planner tests — run with:
 *   node --experimental-strip-types --test src/lib/aether/orchestrator.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planTasks, shouldUseOrchestrator, synthesizeReply } from "./orchestrator";
import type { Task } from "./types";

describe("planTasks multi-intent", () => {
  it("splits date, time, location, weather, nearby", () => {
    const tasks = planTasks(
      "Tell me today's date. Tell me the current time. Tell me the current weather. Tell me my current location. And show me the nearest shops around me.",
    );
    const types = tasks.map((t) => t.type);
    assert.ok(types.includes("date"));
    assert.ok(types.includes("time"));
    assert.ok(types.includes("location"));
    assert.ok(types.includes("weather"));
    assert.ok(types.includes("nearby"));
    assert.ok(shouldUseOrchestrator(tasks));
    const weather = tasks.find((t) => t.type === "weather")!;
    const loc = tasks.find((t) => t.type === "location")!;
    assert.deepEqual(weather.dependsOn, [loc.id]);
  });

  it("plans wifi + time + open app", () => {
    const tasks = planTasks("Turn on Wi-Fi, tell me the time, and open YouTube.");
    const types = tasks.map((t) => t.type);
    assert.ok(types.includes("time"));
    assert.ok(types.includes("phone_action"));
    assert.ok(tasks.some((t) => t.phoneAction?.action === "wifi"));
    assert.ok(tasks.some((t) => t.phoneAction?.action === "open_app"));
  });

  it("weather depends on location", () => {
    const tasks = planTasks("Tell me my location and the weather here.");
    const loc = tasks.find((t) => t.type === "location")!;
    const weather = tasks.find((t) => t.type === "weather")!;
    assert.ok(loc);
    assert.ok(weather);
    assert.deepEqual(weather.dependsOn, [loc.id]);
  });

  it("independent date/time/location have no deps", () => {
    const tasks = planTasks("Tell me the date, time and location.");
    for (const t of tasks) {
      assert.ok(!t.dependsOn || t.dependsOn.length === 0);
    }
  });
});

describe("synthesizeReply partial failure", () => {
  it("keeps successes and mentions failures", () => {
    const tasks: Task[] = [
      {
        id: "1",
        type: "date",
        status: "completed",
        result: { ok: true, message: "Today is Monday." },
      },
      {
        id: "2",
        type: "weather",
        status: "failed",
        error: "no network",
        result: { ok: false, message: "no network" },
      },
    ];
    const reply = synthesizeReply(tasks);
    assert.match(reply, /Today is Monday/);
    assert.match(reply, /weather/i);
  });
});
