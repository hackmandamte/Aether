import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string compare (hashes first so length can't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type RateLimiter = {
  /** Count one hit. Returns false when the key is already over its limit. */
  take: (key: string, now?: number) => boolean;
  /** True when the key is over its limit (does not count a hit). */
  isLimited: (key: string, now?: number) => boolean;
};

/**
 * Fixed-window limiter held in process memory. On serverless hosts each warm
 * instance has its own window, so treat it as a speed bump, not a hard cap —
 * the access code is the real gate.
 */
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5000): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function prune(now: number) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    // Still full of live keys (a spray of fake clients): drop oldest first.
    for (const k of buckets.keys()) {
      if (buckets.size < maxKeys) break;
      buckets.delete(k);
    }
  }

  return {
    take(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        if (buckets.size >= maxKeys) prune(now);
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      if (b.count >= limit) return false;
      b.count += 1;
      return true;
    },
    isLimited(key, now = Date.now()) {
      const b = buckets.get(key);
      return Boolean(b && b.resetAt > now && b.count >= limit);
    },
  };
}
