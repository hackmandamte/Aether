import assert from "node:assert/strict";
import { test } from "node:test";
import { createVad, DEFAULT_VAD } from "./silence.ts";

/** Feed a level for `ms` milliseconds at 80ms steps; returns the first non-continue verdict. */
function run(vad: ReturnType<typeof createVad>, from: number, ms: number, level: number) {
  for (let t = from; t < from + ms; t += 80) {
    const v = vad.feed(level, t);
    if (v !== "continue") return { verdict: v, at: t };
  }
  return { verdict: "continue" as const, at: from + ms };
}

test("sends after the user speaks and goes quiet", () => {
  const vad = createVad();
  assert.equal(run(vad, 0, 600, 0.004).verdict, "continue"); // room noise
  assert.equal(run(vad, 600, 1500, 0.2).verdict, "continue"); // talking
  const end = run(vad, 2100, 3000, 0.004); // silence
  assert.equal(end.verdict, "send");
  assert.ok(end.at - 2100 >= DEFAULT_VAD.silenceMs - 80);
});

test("gives up when nobody speaks", () => {
  const vad = createVad();
  const r = run(vad, 0, 12_000, 0.003);
  assert.equal(r.verdict, "nothing");
  assert.ok(r.at >= DEFAULT_VAD.noSpeechMs - 80 && r.at <= DEFAULT_VAD.noSpeechMs + 160);
});

test("does not cut off a pause shorter than the silence window", () => {
  const vad = createVad();
  run(vad, 0, 600, 0.004);
  run(vad, 600, 1000, 0.2);
  assert.equal(run(vad, 1600, 1000, 0.004).verdict, "continue"); // 1s pause, window is 1.5s
  assert.equal(run(vad, 2600, 800, 0.2).verdict, "continue"); // keeps talking
});

test("caps a recording that never goes quiet", () => {
  const vad = createVad();
  run(vad, 0, 600, 0.004);
  const r = run(vad, 600, 25_000, 0.3);
  assert.equal(r.verdict, "send");
  assert.ok(r.at <= DEFAULT_VAD.maxMs + 80);
});

test("noisy room: still ends after speech stops", () => {
  const vad = createVad();
  run(vad, 0, 600, 0.03); // loud background
  assert.equal(run(vad, 600, 1200, 0.25).verdict, "continue"); // speech well above noise
  assert.equal(run(vad, 1800, 3000, 0.03).verdict, "send"); // back to background level
});

test("starting to talk immediately still counts as speech", () => {
  const vad = createVad();
  run(vad, 0, 1200, 0.2);
  assert.equal(run(vad, 1200, 3000, 0.004).verdict, "send");
});
