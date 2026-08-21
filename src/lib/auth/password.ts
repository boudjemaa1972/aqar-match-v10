// ──────────────────────────────────────────────────────────────────
//  Password hashing — bcryptjs (pure JavaScript, serverless-safe).
//
//  WHY bcryptjs (not argon2)?
//  ──────────────────────────
//  • argon2 requires native C bindings that crash in Netlify Functions.
//  • bcryptjs is a pure-JS implementation — works everywhere.
//  • bcrypt is still OWASP-recommended for password hashing.
//  • Cost factor 12 = ~250ms per hash on commodity hardware.
//
//  SECURITY NOTES:
//  ──────────────
//  • Salt is generated PER-HASH by bcrypt (embedded in the hash string).
//  • We store the hash in the standard bcrypt format: $2b$12$...
//  • verifyPassword uses constant-time comparison internally.
// ──────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt.
 * @returns The bcrypt hash string (includes salt + cost).
 * @throws If the password is empty or hashing fails.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(plain, salt);
}

/**
 * Verify a password against a bcrypt hash.
 * Uses constant-time comparison internally.
 *
 * @returns true if the password matches, false otherwise.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // Malformed hash — treat as verification failure.
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
