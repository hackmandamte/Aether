import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { env } from "@/lib/env.server";
import { createRateLimiter, safeEqual } from "./guard-core.server";

/**
 * Gate for every server function that spends the xAI key.
 *
 * The site is public (the APK downloads from it), and these functions proxy
 * paid chat / speech APIs, so anyone who finds the URL could otherwise burn
 * the key. Requests must carry the access code configured in the
 * AETHER_ACCESS_CODE environment variable. No code configured = refuse
 * everything (fail closed).
 */

const MIN_CODE_LENGTH = 16;

// 8 wrong guesses per 10 minutes per client, then locked out for the window.
const failedAttempts = createRateLimiter(8, 10 * 60_000);
// Ceiling on paid calls per client per minute (a normal voice turn is 3).
const paidCalls = createRateLimiter(45, 60_000);

export type Gate = { ok: true } | { ok: false; error: string };

function clientKey(): string {
  const headers = getRequest()?.headers;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers?.get("x-real-ip")?.trim() || forwarded || "unknown";
}

export function authorize(accessCode: string | undefined): Gate {
  try {
    assertSameSiteRequest();
  } catch {
    return { ok: false, error: "Request blocked." };
  }

  const expected = env("AETHER_ACCESS_CODE");
  if (!expected || expected.length < MIN_CODE_LENGTH) {
    console.error(
      `[aether] AETHER_ACCESS_CODE is missing or shorter than ${MIN_CODE_LENGTH} characters; refusing requests.`,
    );
    return { ok: false, error: "Aether isn't set up on the server yet." };
  }

  const key = clientKey();
  if (failedAttempts.isLimited(key)) {
    return { ok: false, error: "Too many wrong codes. Try again in a few minutes." };
  }
  if (!accessCode || !safeEqual(accessCode, expected)) {
    failedAttempts.take(key);
    return { ok: false, error: "Wrong or missing access code. Add it in Settings." };
  }
  if (!paidCalls.take(key)) {
    return { ok: false, error: "Slow down a little." };
  }
  return { ok: true };
}
