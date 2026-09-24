/**
 * Development tracing for ETA. Never log secrets or full GPS.
 */

const PREFIX = "[ETA]";

export function etaLog(message: string, detail?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    if (detail && Object.keys(detail).length) {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(detail)) {
        if (["lat", "lng", "latitude", "longitude", "accessCode", "apiKey", "key", "token"].includes(k)) {
          continue;
        }
        safe[k] = v;
      }
      console.info(PREFIX, message, safe);
    } else {
      console.info(PREFIX, message);
    }
  } catch {
    /* ignore */
  }
}
