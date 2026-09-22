import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { env } from "@/lib/env.server";
import { createRateLimiter, safeEqual } from "./guard-core.server";

/**
 * Gate for every server function that spends the AI key.
 *
 * Fail closed: no valid codes configured → refuse everything.
 *
 * Codes (any one matches):
 *   AETHER_ACCESS_CODE=single-code
 *   AETHER_ACCESS_CODES=code1,code2,code3   (multi-user; each code is a principal)
 *
 * Rate limits:
 *   - Wrong guesses: per client IP (8 / 10 min)
 *   - Paid calls: per (principal + IP) so one user cannot burn the whole budget alone as easily
 *   - Global paid ceiling per IP: 90 / min (shared safety net)
 */

const MIN_CODE_LENGTH = 16;

const failedAttempts = createRateLimiter(8, 10 * 60_000);
const paidPerPrincipal = createRateLimiter(45, 60_000);
const paidPerIp = createRateLimiter(90, 60_000);

export type Gate = { ok: true; principal: string } | { ok: false; error: string };

function clientIp(): string {
  const headers = getRequest()?.headers;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers?.get("x-real-ip")?.trim();
  const ip = real || forwarded || "unknown";
  return ip.slice(0, 64);
}

/** Collect configured access codes (deduped, min length enforced). */
export function configuredAccessCodes(): string[] {
  const out: string[] = [];
  const single = env("AETHER_ACCESS_CODE");
  if (single && single.length >= MIN_CODE_LENGTH) out.push(single);

  const many = env("AETHER_ACCESS_CODES");
  if (many) {
    for (const part of many.split(/[,;\s]+/)) {
      const c = part.trim();
      if (c.length >= MIN_CODE_LENGTH && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

function principalId(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
}

export function authorize(accessCode: string | undefined): Gate {
  try {
    assertSameSiteRequest();
  } catch {
    return { ok: false, error: "Request blocked." };
  }

  const codes = configuredAccessCodes();
  if (codes.length === 0) {
    console.error(
      `[aether] No access codes configured (AETHER_ACCESS_CODE or AETHER_ACCESS_CODES, each ≥ ${MIN_CODE_LENGTH} chars); refusing requests.`,
    );
    return { ok: false, error: "E.T.A isn't set up on the server yet." };
  }

  const ip = clientIp();
  if (failedAttempts.isLimited(ip)) {
    return { ok: false, error: "Too many wrong codes. Try again in a few minutes." };
  }

  if (!accessCode || typeof accessCode !== "string") {
    failedAttempts.take(ip);
    return { ok: false, error: "Wrong or missing access code. Add it in Settings." };
  }

  const submitted = accessCode.slice(0, 256);

  let matched: string | null = null;
  for (const expected of codes) {
    if (safeEqual(submitted, expected)) {
      matched = expected;
      break;
    }
  }

  if (!matched) {
    failedAttempts.take(ip);
    console.warn(`[aether] auth fail ip=${ip}`);
    return { ok: false, error: "Wrong or missing access code. Add it in Settings." };
  }

  const principal = principalId(matched);
  const paidKey = `${principal}:${ip}`;

  if (!paidPerIp.take(ip)) {
    return { ok: false, error: "Slow down a little." };
  }
  if (!paidPerPrincipal.take(paidKey)) {
    return { ok: false, error: "Slow down a little." };
  }

  return { ok: true, principal };
}
