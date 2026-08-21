// ──────────────────────────────────────────────────────────────────
//  Auth-specific rate limiting — built on the DB-backed rate-limit
//  helper (src/lib/rate-limit.ts). Uses the same RateLimitEntry table
//  but with different key prefixes for auth endpoints.
//
//  WHY MULTI-LAYER RATE LIMITING?
//  ──────────────────────────────
//  • Per-IP rate limiting stops bulk scraping (someone trying 1000
//    different passwords from one IP).
//  • Per-identifier (email/phone) rate limiting stops distributed
//    credential stuffing (1000 IPs each trying 1 password for the
//    same email).
//
//  We enforce BOTH on every auth endpoint. The stricter one wins.
//
//  CONFIGURATION:
//  ─────────────
//  Limits are intentionally tight — auth endpoints are the highest-
//  value target. A legit user rarely needs 5 login attempts in 15 min;
//  if they do, they should use password reset instead.
// ──────────────────────────────────────────────────────────────────

import { checkRateLimit } from "@/lib/rate-limit";
import type { RateLimitConfig } from "@/lib/rate-limit";

// ── Auth rate-limit configs ───────────────────────────────────────
// Tight limits — auth endpoints are high-value targets.
const LOGIN_LIMIT: RateLimitConfig = {
  maxRequests: 10, // 10 attempts per 15 min per IP
  windowMs: 15 * 60 * 1000,
};

const SIGNUP_LIMIT: RateLimitConfig = {
  maxRequests: 5, // 5 signups per hour per IP (prevents mass account creation)
  windowMs: 60 * 60 * 1000,
};

const PASSWORD_RESET_REQUEST_LIMIT: RateLimitConfig = {
  maxRequests: 5, // 5 reset requests per hour per IP (prevents email bombing)
  windowMs: 60 * 60 * 1000,
};

const PASSWORD_RESET_USE_LIMIT: RateLimitConfig = {
  maxRequests: 5, // 5 reset token uses per 15 min per IP
  windowMs: 15 * 60 * 1000,
};

const OTP_REQUEST_LIMIT: RateLimitConfig = {
  maxRequests: 5, // 5 OTP requests per 15 min per IP (prevents SMS/email bombing)
  windowMs: 15 * 60 * 1000,
};

const EMAIL_VERIFICATION_LIMIT: RateLimitConfig = {
  maxRequests: 10, // 10 verification attempts per 15 min per IP
  windowMs: 15 * 60 * 1000,
};

// ── Per-identifier configs (slower window — protects specific accounts)
// These are SEPARATE from the per-IP limits. A login attempt must pass
// BOTH limits to succeed.
const PER_IDENTIFIER_LOGIN_LIMIT: RateLimitConfig = {
  maxRequests: 5, // 5 attempts per 15 min per email/phone
  windowMs: 15 * 60 * 1000,
};

// ── Public API ────────────────────────────────────────────────────

/**
 * Check login rate limit (per-IP + per-identifier combined).
 * Returns the FIRST failing result (for cleaner error messages).
 */
export async function checkLoginRateLimit(
  ip: string,
  identifier: string, // email or normalized phone
): Promise<{ allowed: boolean; retryAfterSec: number; reason?: "ip" | "identifier" }> {
  // Check per-IP first (broader protection)
  const ipResult = await checkRateLimit(
    `auth:login:ip:${ip}`,
    LOGIN_LIMIT,
  );
  if (!ipResult.allowed) {
    return {
      allowed: false,
      retryAfterSec: ipResult.retryAfterSec,
      reason: "ip",
    };
  }

  // Then per-identifier (account-specific protection)
  const idResult = await checkRateLimit(
    `auth:login:id:${identifier}`,
    PER_IDENTIFIER_LOGIN_LIMIT,
  );
  if (!idResult.allowed) {
    return {
      allowed: false,
      retryAfterSec: idResult.retryAfterSec,
      reason: "identifier",
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

export async function checkSignupRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSec: number;
}> {
  const result = await checkRateLimit(`auth:signup:ip:${ip}`, SIGNUP_LIMIT);
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec };
}

export async function checkPasswordResetRequestRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSec: number;
}> {
  const result = await checkRateLimit(
    `auth:pwreset:req:ip:${ip}`,
    PASSWORD_RESET_REQUEST_LIMIT,
  );
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec };
}

export async function checkPasswordResetUseRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSec: number;
}> {
  const result = await checkRateLimit(
    `auth:pwreset:use:ip:${ip}`,
    PASSWORD_RESET_USE_LIMIT,
  );
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec };
}

export async function checkOtpRequestRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSec: number;
}> {
  const result = await checkRateLimit(
    `auth:otp:req:ip:${ip}`,
    OTP_REQUEST_LIMIT,
  );
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec };
}

export async function checkEmailVerificationRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSec: number;
}> {
  const result = await checkRateLimit(
    `auth:emailverify:ip:${ip}`,
    EMAIL_VERIFICATION_LIMIT,
  );
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec };
}
