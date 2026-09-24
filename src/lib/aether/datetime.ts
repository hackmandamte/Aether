/**
 * Trusted local date/time for ETA — never the model's notion of "now".
 * Uses the device/runtime clock only.
 */

export type DateTimeInfo = {
  /** ISO-8601 timestamp */
  iso: string;
  /** Unix ms */
  timestamp: number;
  /** e.g. "Thursday, September 24, 2026" */
  dateLabel: string;
  /** e.g. "3:13 PM" */
  timeLabel: string;
  /** IANA timezone if available, else offset string */
  timezone: string;
  /** UTC offset minutes from getTimezoneOffset (JS inverted) */
  utcOffsetMinutes: number;
};

export function getLocalDateTime(now: Date = new Date()): DateTimeInfo {
  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || offsetLabel(now)
      : offsetLabel(now);

  return {
    iso: now.toISOString(),
    timestamp: now.getTime(),
    dateLabel: now.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    timeLabel: now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
    timezone,
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
}

function offsetLabel(d: Date): string {
  const mins = -d.getTimezoneOffset();
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

export function formatDateMessage(info: DateTimeInfo = getLocalDateTime()): string {
  return `Today is ${info.dateLabel}.`;
}

export function formatTimeMessage(info: DateTimeInfo = getLocalDateTime()): string {
  return `It's ${info.timeLabel} (${info.timezone}).`;
}
