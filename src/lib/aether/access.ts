/**
 * Client credentials for ETA.
 * Preferred: per-device token (eta1.…). Legacy: shared APK/localStorage code.
 * Credentials unlock AI calls only — never remote phone control.
 */

const LEGACY_KEY = "aether-access-code";
const DEVICE_ID_KEY = "eta-device-id";
const DEVICE_TOKEN_KEY = "eta-device-token";
const MIN_LEN = 16;
const MAX_LEN = 512;

export function getAccessCode(): string {
  try {
    const token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (token && token.startsWith("eta1.") && token.length >= MIN_LEN) return token;
    return localStorage.getItem(LEGACY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string): void {
  try {
    const trimmed = code.trim().slice(0, MAX_LEN);
    if (trimmed) localStorage.setItem(LEGACY_KEY, trimmed);
    else localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage blocked */
  }
}

export function getDeviceToken(): string {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDeviceToken(token: string): void {
  try {
    const t = token.trim().slice(0, MAX_LEN);
    if (t.startsWith("eta1.")) localStorage.setItem(DEVICE_TOKEN_KEY, t);
  } catch {
    /* storage blocked */
  }
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `fallback${Date.now()}`;
  }
}

export function accessCodeLooksValid(code: string): boolean {
  const t = code.trim();
  if (t.startsWith("eta1.") && t.length >= 40) return true;
  return t.length >= MIN_LEN && t.length <= MAX_LEN;
}
