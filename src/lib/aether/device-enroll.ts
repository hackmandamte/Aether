import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getDeviceToken,
  getOrCreateDeviceId,
  setDeviceToken,
  getAccessCode,
} from "./access";

export const enrollAetherDevice = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      deviceId: z
        .string()
        .min(16)
        .max(64)
        .regex(/^[a-zA-Z0-9_-]+$/),
    }),
  )
  .handler(async ({ data }) => {
    const { allowDeviceEnroll } = await import("./guard.server");
    const { issueDeviceToken } = await import("./device-token.server");

    const gate = allowDeviceEnroll();
    if (!gate.ok) {
      return { ok: false as const, error: gate.error };
    }

    const token = issueDeviceToken(data.deviceId);
    if (!token) {
      return {
        ok: false as const,
        error: "Could not issue device token. Server signing is not configured.",
      };
    }

    return { ok: true as const, token };
  });

/** Prefer device token; enroll when needed; legacy code as last resort. */
export async function ensureDeviceCredential(): Promise<string> {
  const existing = getDeviceToken();
  if (existing.startsWith("eta1.") && existing.length >= 40) {
    return existing;
  }

  try {
    const deviceId = getOrCreateDeviceId();
    const res = await enrollAetherDevice({ data: { deviceId } });
    if (res.ok && res.token) {
      setDeviceToken(res.token);
      return res.token;
    }
  } catch {
    /* offline or server not ready */
  }

  return getAccessCode();
}
