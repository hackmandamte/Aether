import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TIMER_SECONDS,
  formatClockTime,
  parseClockTime,
  parseLevel,
  parseTimerSeconds,
} from "./parse.ts";

test("timer: units, compound and bare numbers", () => {
  assert.equal(parseTimerSeconds("5 minutes"), 300);
  assert.equal(parseTimerSeconds("1h30m"), 5400);
  assert.equal(parseTimerSeconds("2 minutes 10 seconds"), 130);
  assert.equal(parseTimerSeconds("45 secs"), 45);
  assert.equal(parseTimerSeconds("90"), 90);
  assert.equal(parseTimerSeconds(90), 90);
  assert.equal(parseTimerSeconds("1.5 hours"), 5400);
});

test("timer: unusable input is null, huge input is capped", () => {
  assert.equal(parseTimerSeconds(""), null);
  assert.equal(parseTimerSeconds(undefined), null);
  assert.equal(parseTimerSeconds("soon"), null);
  assert.equal(parseTimerSeconds("5 months"), null);
  assert.equal(parseTimerSeconds(0), null);
  assert.equal(parseTimerSeconds(-4), null);
  assert.equal(parseTimerSeconds(Number.NaN), null);
  assert.equal(parseTimerSeconds("99999 hours"), MAX_TIMER_SECONDS);
});

test("clock: 24h, am/pm and separators", () => {
  assert.deepEqual(parseClockTime("19:00"), { hour: 19, minute: 0 });
  assert.deepEqual(parseClockTime("7pm"), { hour: 19, minute: 0 });
  assert.deepEqual(parseClockTime("7:30 am"), { hour: 7, minute: 30 });
  assert.deepEqual(parseClockTime("7 p.m."), { hour: 19, minute: 0 });
  assert.deepEqual(parseClockTime("12am"), { hour: 0, minute: 0 });
  assert.deepEqual(parseClockTime("12 pm"), { hour: 12, minute: 0 });
  assert.deepEqual(parseClockTime("07.30"), { hour: 7, minute: 30 });
  assert.deepEqual(parseClockTime(undefined, "6:15", "wake up 5 kids"), { hour: 6, minute: 15 });
});

test("clock: ambiguous or invalid input is null", () => {
  assert.equal(parseClockTime("7"), null);
  assert.equal(parseClockTime("in 10 minutes"), null);
  assert.equal(parseClockTime("25:00"), null);
  assert.equal(parseClockTime("13pm"), null);
  assert.equal(parseClockTime("7:75"), null);
  assert.equal(parseClockTime("2026-09-20"), null);
  assert.equal(parseClockTime(undefined, null, ""), null);
});

test("clock: formatting", () => {
  assert.equal(formatClockTime({ hour: 7, minute: 5 }), "07:05");
});

test("level: clamps and never returns NaN", () => {
  assert.equal(parseLevel("70%", 50, 5, 100), 70);
  assert.equal(parseLevel(200, 50, 5, 100), 100);
  assert.equal(parseLevel(-3, 11, 0, 15), 0);
  assert.equal(parseLevel("loud", 11, 0, 15), 11);
  assert.equal(parseLevel(undefined, 11, 0, 15), 11);
});
