const KEY = "aether-access-code";

/** The code that unlocks this deployment's server. Lives only on this device. */
export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string): void {
  try {
    const trimmed = code.trim();
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — the user will just be asked again */
  }
}
