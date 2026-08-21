// ──────────────────────────────────────────────────────────────────
//  Secure random token generation.
//
//  Used for:
//  • Password reset tokens (32 bytes → base64url)
//  • Email verification tokens (32 bytes → base64url)
//  • Email verification 6-digit OTP codes
//  • Session token rotation (uses crypto.randomUUID() elsewhere)
//
//  All tokens are generated using crypto.getRandomValues (Web Crypto),
//  which is the cryptographically secure PRNG available in Node.js
//  (via the global `crypto` object) and in browsers.
// ──────────────────────────────────────────────────────────────────

const TOKEN_BYTES = 32; // 256 bits of entropy

/**
 * Generate a URL-safe random token (base64url-encoded, no padding).
 * Used in links sent via email (password reset, email verification).
 *
 * The raw entropy is 32 bytes (256 bits) — exhaustive search is
 * infeasible (2^256 possibilities). The base64url encoding expands
 * this to ~43 ASCII chars.
 */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return toBase64Url(bytes);
}

/**
 * Generate a 6-digit numeric OTP code.
 * Used for:
 *  • Phone OTP login (5 min TTL)
 *  • Email verification OTP (24h TTL)
 *
 * The modulo operation introduces a tiny bias (~1 in 16M) but for
 * 6-digit codes this is statistically irrelevant — an attacker would
 * need millions of attempts to exploit it, and rate limiting kicks in
 * after 5.
 */
export function generateNumericOtp(length: number = 6): string {
  // Generate enough bytes to cover the digit count without reusing
  // bytes (avoids subtle bias from slicing a single uint32).
  const byteCount = Math.ceil(length * 4 / 3) + 4;
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  let digits = "";
  for (let i = 0; i < byteCount && digits.length < length; i++) {
    // Use each byte to produce ~2.4 digits on average; we take mod 10
    // and skip bytes that exceed 250 to reduce the bias from 256 % 10.
    if (bytes[i] < 250) {
      digits += String(bytes[i] % 10);
    }
  }
  // Pad if we didn't get enough digits (extremely rare)
  while (digits.length < length) {
    digits += String(crypto.getRandomValues(new Uint32Array(1))[0] % 10);
  }
  return digits.slice(0, length);
}

// ── Base64url helpers (URL-safe base64, no padding) ───────────────
// Token strings go into URLs (email links), so + and / must be avoided.

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * SHA-256 hash a string. Used to hash tokens before DB storage
 * (so a DB leak doesn't reveal usable tokens).
 *
 * NOTE: tokens are 256 bits of random entropy, so hashing them is
 * defense-in-depth, not strictly necessary (an attacker who has the
 * DB can't brute-force the token anyway). But it's cheap and
 * protects against scenarios like log leakage.
 */
export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * PBKDF2-SHA256 hash. Used for OTP codes (6 digits, short-lived).
 *
 * Iterations are 10,000 — lower than the 210,000 used for data
 * encryption because:
 *   • The code is only 6 digits (10^6 = 1M possibilities)
//   • Rate limiting caps attempts at 5 per 15 min
//   • TTL is 5 min for phone OTP, 24h for email OTP
//
// So brute-force is bounded by rate limiting, not by hash strength.
// Higher iterations would slow legit verification without meaningful
// security gain.
 */
export async function pbkdf2Hash(plain: string, salt: string): Promise<string> {
  const PBKDF2_ITERS = 10_000;
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    baseKey,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
