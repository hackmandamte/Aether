/**
 * Pure helpers for turning loose model output ("5 minutes", "7pm") into strict
 * values the phone bridge can trust. No imports — unit-tested under node.
 */

export const MAX_TIMER_SECONDS = 24 * 60 * 60;

export type ClockTime = { hour: number; minute: number };

function clampTimer(seconds: number): number {
  return Math.min(MAX_TIMER_SECONDS, Math.max(1, Math.round(seconds)));
}

/**
 * "5 minutes", "1h30m", "2 minutes 10 seconds", "90" (bare number = seconds).
 * Returns null when nothing usable was said, so callers can ask instead of
 * silently starting a 60-second timer.
 */
export function parseTimerSeconds(value?: string | number | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? clampTimer(value) : null;
  }
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return n > 0 ? clampTimer(n) : null;
  }
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g;
  let total = 0;
  let hit = false;
  for (const m of raw.matchAll(re)) {
    const unit = m[2][0];
    const mult = unit === "h" ? 3600 : unit === "m" ? 60 : 1;
    total += Number(m[1]) * mult;
    hit = true;
  }
  return hit && total > 0 ? clampTimer(total) : null;
}

/**
 * "19:00", "7:30 pm", "7pm", "07.30", "12am". A bare "7" is ambiguous, so it
 * (and anything out of range) returns null rather than guessing.
 */
export function parseClockTime(
  ...sources: Array<string | number | null | undefined>
): ClockTime | null {
  const src = sources
    .filter((s) => s !== null && s !== undefined && s !== "")
    .join(" ")
    .toLowerCase();
  const re = /(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?m(?![a-z])\.?)?/g;
  for (const m of src.matchAll(re)) {
    const hasMinutes = m[2] !== undefined;
    const meridiem = m[3];
    if (!hasMinutes && !meridiem) continue;
    let hour = Number(m[1]);
    const minute = hasMinutes ? Number(m[2]) : 0;
    if (minute > 59) continue;
    if (meridiem) {
      if (hour < 1 || hour > 12) continue;
      hour = meridiem === "a" ? hour % 12 : (hour % 12) + 12;
    } else if (hour > 23) {
      continue;
    }
    return { hour, minute };
  }
  return null;
}

export function formatClockTime(t: ClockTime): string {
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

/** "70", "70%", 70 -> 70, clamped. Garbage -> fallback (never NaN). */
export function parseLevel(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
