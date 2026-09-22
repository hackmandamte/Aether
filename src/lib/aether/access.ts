const KEY = "aether-access-code";
const MIN_LEN = 16;
const MAX_LEN = 256;

/** The code that unlocks this deployment's server. Lives only on this device. */
export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Store the access code on this device only.
 * Caps length to avoid abuse; min length is enforced on the server.
 */
export function setAccessCode(code: string): void {
  try {
    const trimmed = code.trim().slice(0, MAX_LEN);
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — the user will just be asked again */
  }
}

export function accessCodeLooksValid(code: string): boolean {
  const t = code.trim();
  return t.length >= MIN_LEN && t.length <= MAX_LEN;
}
