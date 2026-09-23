/**
 * Device-side encryption for ETA.
 *
 * Honest scope:
 * - Chat, notes, and settings stored on the phone are encrypted at rest (AES-GCM).
 * - Traffic to your host uses HTTPS; the access code unlocks the server.
 * - The online AI provider must see plaintext to answer — that hop is not
 *   end-to-end sealed from the model. Encryption protects the device and
 *   casual local snooping, not the LLM itself.
 */

const DEVICE_KEY_STORAGE = "eta-device-key-v1";
const SALT = new TextEncoder().encode("eta-everyday-task-assistant-v1");

function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getOrCreateDeviceSeed(): string {
  try {
    let seed = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!seed) {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      seed = b64encode(raw);
      localStorage.setItem(DEVICE_KEY_STORAGE, seed);
    }
    return seed;
  } catch {
    return "eta-ephemeral-fallback-key-not-persistent";
  }
}

async function deriveKey(seed: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(seed),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: 120_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

let cachedKey: CryptoKey | null = null;

async function deviceKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await deriveKey(getOrCreateDeviceSeed());
  return cachedKey;
}

/** Encrypt a UTF-8 string → base64 payload (iv + ciphertext). */
export async function encryptText(plain: string): Promise<string> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return "eta1:" + b64encode(packed);
}

/** Decrypt a payload from encryptText. Returns null if invalid. */
export async function decryptText(payload: string): Promise<string | null> {
  try {
    if (!payload.startsWith("eta1:")) return null;
    const packed = b64decode(payload.slice(5));
    if (packed.length < 13) return null;
    const iv = packed.slice(0, 12);
    const data = packed.slice(12);
    const key = await deviceKey();
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Zustand-compatible async storage that encrypts values at rest. */
export function createEncryptedStorage(): {
  getItem: (name: string) => Promise<string | null>;
  setItem: (name: string, value: string) => Promise<void>;
  removeItem: (name: string) => Promise<void>;
} {
  return {
    async getItem(name) {
      if (typeof window === "undefined") return null;
      try {
        const raw = localStorage.getItem(name);
        if (!raw) return null;
        if (raw.startsWith("eta1:")) {
          return (await decryptText(raw)) ?? null;
        }
        // Migrate plain JSON once → encrypted
        const sealed = await encryptText(raw);
        localStorage.setItem(name, sealed);
        return raw;
      } catch {
        return null;
      }
    },
    async setItem(name, value) {
      if (typeof window === "undefined") return;
      try {
        const sealed = await encryptText(value);
        localStorage.setItem(name, sealed);
      } catch {
        try {
          localStorage.setItem(name, value);
        } catch {
          /* ignore */
        }
      }
    },
    async removeItem(name) {
      if (typeof window === "undefined") return;
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
