/**
 * Per-device credentials for ETA.
 * Signing key stays on the server only (never in the APK).
 * Tokens authorize AI spend only — not remote phone control.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env.server";

const TOKEN_PREFIX = "eta1";
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export function signingSecret(): string | null {
  const explicit = env("AETHER_SIGNING_SECRET");
  if (explicit && explicit.length >= 16) return explicit;
  const code = env("AETHER_ACCESS_CODE");
  if (code && code.length >= 16) return `eta-sign:${code}`;
  const many = env("AETHER_ACCESS_CODES");
  if (many) {
    const first = many
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .find((s) => s.length >= 16);
    if (first) return `eta-sign:${first}`;
  }
  return null;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8");
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export type DeviceTokenClaims = {
  d: string;
  t: number;
  v: 1;
};

export function issueDeviceToken(deviceId: string, now = Date.now()): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const id = deviceId.trim().slice(0, 64);
  if (id.length < 8) return null;

  const claims: DeviceTokenClaims = { d: id, t: now, v: 1 };
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(
    createHmac("sha256", secret).update(`${TOKEN_PREFIX}.${payload}`).digest(),
  );
  return `${TOKEN_PREFIX}.${payload}.${sig}`;
}

export type VerifyResult =
  | { ok: true; deviceId: string; principal: string }
  | { ok: false };

export function verifyDeviceToken(token: string, now = Date.now()): VerifyResult {
  const secret = signingSecret();
  if (!secret) return { ok: false };

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return { ok: false };

  const [, payload, sig] = parts;
  if (!payload || !sig || payload.length > 512 || sig.length > 128) return { ok: false };

  const expected = createHmac("sha256", secret)
    .update(`${TOKEN_PREFIX}.${payload}`)
    .digest();
  let got: Buffer;
  try {
    got = fromB64url(sig);
  } catch {
    return { ok: false };
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return { ok: false };
  }

  let claims: DeviceTokenClaims;
  try {
    claims = JSON.parse(fromB64url(payload).toString("utf8")) as DeviceTokenClaims;
  } catch {
    return { ok: false };
  }

  if (claims.v !== 1 || typeof claims.d !== "string" || typeof claims.t !== "number") {
    return { ok: false };
  }
  if (claims.d.length < 8 || claims.d.length > 64) return { ok: false };
  if (claims.t > now + 60_000 || now - claims.t > MAX_AGE_MS) return { ok: false };

  const principal = createHmac("sha256", secret)
    .update(`principal:${claims.d}`)
    .digest("hex")
    .slice(0, 16);

  return { ok: true, deviceId: claims.d, principal };
}

export function newDeviceId(): string {
  return randomBytes(16).toString("hex");
}
