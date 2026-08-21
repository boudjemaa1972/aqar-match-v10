// ──────────────────────────────────────────────────────────────────
//  Field-level encryption helpers (AES-256-GCM via Web Crypto).
//
//  SECURITY MODEL
//  ──────────────
//  • Key derivation: PBKDF2-SHA256, 210,000 iterations, 32-byte output.
//    (OWASP 2023 recommendation for PBKDF2-SHA256.)
//  • Salt: per-deployment random salt (env: ENCRYPTION_KEY_SALT), ≥16 bytes.
//  • Passphrase: mandatory, fails closed if absent (env: ENCRYPTION_PASSPHRASE).
//  • Key versioning: every ciphertext is prefixed with `vN:` so future
//    rotations can decrypt old data with the old key and re-encrypt.
//  • In production: replace `getKeyFromEnv()` with a KMS / Vault lookup.
//
//  CIPHERTEXT FORMAT
//  ─────────────────
//  `v1:<base64(iv || ciphertext || authTag)>`
//  (GCM authTag is appended automatically by WebCrypto.)
// ──────────────────────────────────────────────────────────────────

const CURRENT_KEY_VERSION = 1;
const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 — PBKDF2-SHA256
const KEY_LENGTH_BITS = 256;

// Cache derived keys by version: Map<version, CryptoKey>
const keyCache = new Map<number, CryptoKey>();

interface KeyMaterial {
  version: number;
  passphrase: string;
  salt: string;
}

// ── Validate environment ────────────────────────────────────────
function loadKeyMaterial(version: number): KeyMaterial {
  if (version !== CURRENT_KEY_VERSION) {
    // For now we only support v1. When rotation is introduced, extend here.
    throw new Error(`Unsupported key version: ${version}`);
  }

  const passphrase = process.env.ENCRYPTION_PASSPHRASE;
  const salt = process.env.ENCRYPTION_KEY_SALT;

  if (!passphrase || passphrase.length < 16) {
    throw new Error(
      "ENCRYPTION_PASSPHRASE must be set and at least 16 characters long. " +
        "Refusing to start — encryption is mandatory for AqarMatch.",
    );
  }
  if (!salt || salt.length < 16) {
    throw new Error(
      "ENCRYPTION_KEY_SALT must be set and at least 16 characters long. " +
        "Use `openssl rand -base64 32` to generate one.",
    );
  }

  return { version, passphrase, salt };
}

// ── Derive a stable AES-GCM key via PBKDF2 ──────────────────────
async function getKey(version: number = CURRENT_KEY_VERSION): Promise<CryptoKey> {
  const cached = keyCache.get(version);
  if (cached) return cached;

  const mat = loadKeyMaterial(version);
  const enc = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(mat.passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const derived = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(mat.salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );

  keyCache.set(version, derived);
  return derived;
}

// ── Base64 helpers (binary-safe) ────────────────────────────────
function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Public API ──────────────────────────────────────────────────
export async function encryptField(plain: string): Promise<string> {
  if (!plain) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain),
  );
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return `v${CURRENT_KEY_VERSION}:${toB64(combined)}`;
}

export async function decryptField(token: string): Promise<string> {
  if (!token) return "";

  // Parse `vN:base64payload`
  const colonIdx = token.indexOf(":");
  let version = CURRENT_KEY_VERSION;
  let payload = token;
  if (colonIdx > 0 && token.startsWith("v")) {
    const vPart = token.slice(1, colonIdx);
    const vNum = Number(vPart);
    if (!isNaN(vNum)) {
      version = vNum;
      payload = token.slice(colonIdx + 1);
    }
  }

  const key = await getKey(version);
  const combined = fromB64(payload);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// Helper for arrays/objects
export async function encryptJSON(value: unknown): Promise<string> {
  return encryptField(JSON.stringify(value));
}

export async function decryptJSON<T = unknown>(token: string): Promise<T | null> {
  const s = await decryptField(token);
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ── Startup self-check (fail fast on misconfig) ─────────────────
// Force key derivation at module load — surfaces env errors early
// instead of failing on the first request.
let _initCheck: Promise<void> | null = null;
export function ensureCryptoReady(): Promise<void> {
  if (!_initCheck) {
    _initCheck = (async () => {
      await getKey(CURRENT_KEY_VERSION);
    })();
  }
  return _initCheck;
}
