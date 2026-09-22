import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter, safeEqual } from "./guard-core.server.ts";

test("safeEqual matches only identical strings", () => {
  assert.equal(safeEqual("correct horse", "correct horse"), true);
  assert.equal(safeEqual("correct horse", "correct horsf"), false);
  assert.equal(safeEqual("short", "a much longer string"), false);
  assert.equal(safeEqual("", "x"), false);
});

test("rate limiter allows up to the limit then blocks", () => {
  const rl = createRateLimiter(3, 1000);
  assert.equal(rl.take("a", 0), true);
  assert.equal(rl.take("a", 1), true);
  assert.equal(rl.take("a", 2), true);
  assert.equal(rl.isLimited("a", 3), true);
  assert.equal(rl.take("a", 3), false);
  assert.equal(rl.take("b", 3), true, "other keys are independent");
});

test("rate limiter window resets", () => {
  const rl = createRateLimiter(1, 1000);
  assert.equal(rl.take("a", 0), true);
  assert.equal(rl.take("a", 999), false);
  assert.equal(rl.isLimited("a", 1000), false);
  assert.equal(rl.take("a", 1000), true);
});

test("rate limiter memory stays bounded", () => {
  const rl = createRateLimiter(5, 60_000, 50);
  for (let i = 0; i < 500; i++) rl.take(`ip-${i}`, i);
  assert.equal(rl.isLimited("ip-499", 500), false);
  assert.equal(rl.take("ip-499", 500), true);
});

test("safeEqual is length-independent in outcome for mismatches", () => {
  assert.equal(safeEqual("a".repeat(16), "b".repeat(32)), false);
  assert.equal(safeEqual("x".repeat(20), "x".repeat(20)), true);
});
