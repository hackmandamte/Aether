const KEY = "aether-access-code";
const MIN_LEN = 16;
const MAX_LEN = 256;

/**
 * Server unlock secret. On the ETA APK this is supplied by the native bridge
 * (baked at build time) and never shown in the UI. Browser-only sessions may
 * still hold a code in localStorage for developers — end users should use the APK.
 */
export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Store silently on this device. Not exposed as a user-facing setting. */
export function setAccessCode(code: string): void {
  try {
    const trimmed = code.trim().slice(0, MAX_LEN);
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

export function accessCodeLooksValid(code: string): boolean {
  const t = code.trim();
  return t.length >= MIN_LEN && t.length <= MAX_LEN;
}
