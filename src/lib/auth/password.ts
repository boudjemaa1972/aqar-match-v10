// ──────────────────────────────────────────────────────────────────
//  Password hashing — argon2id (memory-hard KDF).
//
//  WHY argon2id (not bcrypt, not scrypt, not PBKDF2)?
//  ────────────────────────────────────────────────────────────────
//  • argon2id is the winner of the Password Hashing Competition (2015)
//    and the recommended choice by OWASP (2023+).
//  • It's MEMORY-hard: forces an attacker to spend significant RAM per
//    guess, making GPU/ASIC parallel brute-force expensive.
//  • bcrypt is GPU-cheap (only CPU-hard), scrypt is good but older.
//  • PBKDF2 is SHA-based and trivially parallelizable on GPUs — only
//    used in this codebase for short-lived OTP codes (6 digits, 5min),
//    never for user passwords.
//
//  PARAMETERS (OWASP 2023 recommendations):
//  ─────────────────────────────────────────────
//  • memoryCost:  19,456 KiB (~19 MB) per hash
//  • timeCost:    2 iterations
//  • parallelism: 1 thread
//  These are calibrated for ~250ms per hash on commodity hardware —
//  fast enough for login (single hash), slow enough to make bulk
//  cracking infeasible (~4 hashes/sec on a typical laptop).
//
//  SECURITY NOTES:
//  ──────────────
//  • The salt is generated PER-HASH by argon2 (embedded in the
//    encoded string returned by hashPassword). We never store a
//    separate salt column.
//  • The encoded string includes the algorithm + params, so future
//    parameter upgrades are transparent (verify() auto-detects).
//  • We DON'T implement rehashing on login here — that's a future
//    concern. When we upgrade params, we'll add a `needsRehash()`
//    check on login and silently re-hash with the new params.
// ──────────────────────────────────────────────────────────────────

import argon2 from "argon2";

// OWASP 2023 — calibrated for ~250ms per hash on commodity hardware.
const ARGON2_PARAMS = {
  type: argon2.argon2id as 0 | 1 | 2,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Hash a password using argon2id.
 * @returns The encoded hash string (includes salt + params).
 * @throws If the password is empty or hashing fails.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return argon2.hash(plain, ARGON2_PARAMS);
}

/**
 * Verify a password against an argon2id hash.
 * Uses argon2's constant-time comparison internally.
 *
 * @returns true if the password matches, false otherwise.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash, wrong algorithm, etc. — treat as verification failure.
    // We DON'T throw here because callers (login route) need a uniform
    // "wrong password" response to prevent account enumeration via
    // timing/error analysis.
    return false;
  }
}

// ── Password strength validation ──────────────────────────────────
// Used at signup + password reset. The Zod schema in schemas.ts enforces
// the same rules, but this function provides a richer result object for
// the UI to show specific hints ("missing uppercase", "missing digit", etc.).

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0 = very weak, 4 = very strong
  ok: boolean; // true if score >= 3 (acceptable)
  issues: string[]; // specific reasons if not ok
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const issues: string[] = [];

  if (password.length < 8) {
    issues.push("PASSWORD_TOO_SHORT");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("PASSWORD_NO_UPPERCASE");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("PASSWORD_NO_LOWERCASE");
  }
  if (!/\d/.test(password)) {
    issues.push("PASSWORD_NO_DIGIT");
  }
  if (!/[!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]/.test(password)) {
    issues.push("PASSWORD_NO_SYMBOL");
  }

  // Score: 4 - (number of issues, capped at 3)
  const issueCount = issues.length;
  const score = Math.max(0, Math.min(4, 4 - issueCount)) as 0 | 1 | 2 | 3 | 4;

  return {
    score,
    ok: score >= 3,
    issues,
  };
}
