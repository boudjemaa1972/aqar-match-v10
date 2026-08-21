// ──────────────────────────────────────────────────────────────────
//  OTP-based authentication for AqarMatch.
//
//  DESIGN
//  ──────
//  • Phone number is the primary identifier (Algerian market reality).
//  • OTP codes are 6 digits, valid for 5 minutes, single-use.
//  • Codes are NEVER stored in plaintext — PBKDF2-SHA256 (10k iters).
//  • Phone numbers are normalized to E.164 (+213XXXXXXXXX) and hashed
//    with SHA-256 for lookup. The plaintext phone never touches the DB
//    outside the encrypted User.phoneEnc field.
//  • Rate limiting: max 5 OTP requests per phone per 15 min,
//    max 10 verification attempts per phone per 15 min.
//  • In dev mode (OTP_MODE=dev), the code is logged + returned in
//    the response for easy testing. In production, it must be sent
//    via SMS (Twilio/Algerian carrier — stubbed for now).
//
//  SECURITY NOTES
//  ──────────────
//  • PBKDF2 iterations for OTP hash are intentionally lower (10k) than
//    for data encryption (210k) — OTP codes are 6 digits and short-lived,
//    so brute-force is bounded by rate limiting + 5-min expiry.
//  • `consumeOtp` is race-safe: it uses `updateMany` with a `where`
//    clause that requires `consumed=false`, so a concurrent retry
//    can't double-spend the same code.
// ──────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { encryptJSON } from "@/lib/crypto";
import { rotateSessionToken, SESSION_COOKIE } from "@/lib/session";
import { auditLog, maskPhone } from "@/lib/auth/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";

const OTP_TTL_MIN = 5;
const OTP_REQUEST_LIMIT_PER_15MIN = 5;
const OTP_VERIFY_LIMIT_PER_15MIN = 10;
const OTP_LENGTH = 6;
const PBKDF2_ITERS = 10_000;

// ── Phone normalization ─────────────────────────────────────────
// Accepts formats: 05XXXXXXXX, 06XXXXXXXX, 07XXXXXXXX (10 digits, Algerian mobile)
//                 +2135XXXXXXXX, 2135XXXXXXXX (12-13 chars)
// Returns: +213XXXXXXXXXX (E.164, 13 chars)
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  // Algerian mobile numbers: 0[5-7]XXXXXXXX (10 digits starting with 0)
  if (/^0[5-7]\d{8}$/.test(cleaned)) {
    return "+213" + cleaned.slice(1);
  }
  // +213[5-7]XXXXXXXX (13 chars with +)
  if (/^\+213[5-7]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  // 213[5-7]XXXXXXXX (12 chars without +)
  if (/^213[5-7]\d{8}$/.test(cleaned)) {
    return "+" + cleaned;
  }
  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

// ── Hashing helpers (Web Crypto — same API as crypto.ts) ────────
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hash(plain: string, salt: string): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    256,
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Rate limiting (unified with email auth — uses shared DB-backed limiter) ──
// Uses the same checkRateLimit from src/lib/rate-limit.ts as the email path.
// This ensures rate limits persist across server restarts (same as email).
const OTP_REQUEST_LIMIT = { maxRequests: OTP_REQUEST_LIMIT_PER_15MIN, windowMs: 15 * 60 * 1000 };
const OTP_VERIFY_LIMIT = { maxRequests: OTP_VERIFY_LIMIT_PER_15MIN, windowMs: 15 * 60 * 1000 };

async function checkOtpRateLimit(phoneHash: string, kind: "request" | "verify"): Promise<boolean> {
  const config = kind === "request" ? OTP_REQUEST_LIMIT : OTP_VERIFY_LIMIT;
  const result = await checkRateLimit(`auth:otp:${kind}:${phoneHash}`, config);
  return result.allowed;
}

// ── Generate 6-digit code ──────────────────────────────────────
function generateCode(): string {
  // Cryptographically secure 6-digit code
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return String(buf[0] % 1_000_000).padStart(OTP_LENGTH, "0");
}

// ── Issue OTP ──────────────────────────────────────────────────
export interface IssueOtpResult {
  ok: boolean;
  status: 200 | 429 | 500;
  error?: string;
  devCode?: string; // only present in dev mode
  expiresInMin?: number;
}

export async function issueOtp(phoneInput: string): Promise<IssueOtpResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) {
    return { ok: false, status: 500, error: "رقم هاتف غير صالح. استخدم صيغة 05XXXXXXXX أو +213XXXXXXXXX" };
  }
  const phoneHash = await sha256(phone);

  const allowed = await checkOtpRateLimit(phoneHash, "request");
  if (!allowed) {
    return {
      ok: false,
      status: 429,
      error: "تم تجاوز الحد الأقصى لإرسال الرموز (5 كل 15 دقيقة). حاول لاحقاً.",
    };
  }

  const code = generateCode();
  const codeHash = await pbkdf2Hash(code, phoneHash);
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  await db.otpCode.create({
    data: {
      phoneHash,
      codeHash,
      expiresAt,
    },
  });

  // ── Send via SMS provider in production ──
  const mode = process.env.OTP_MODE || "dev";
  if (mode === "production") {
    // TODO: integrate real SMS provider (Twilio / Algerian carrier).
    // For now, this is a stub — production deployments MUST implement this
    // before enabling OTP_MODE=production.
    console.warn(`[OTP] production mode set but no SMS provider configured — code NOT sent to ${phone}`);
  } else {
    // Dev mode: log + return code in response for easy testing.
    console.log(`[OTP DEV] phone=${phone} code=${code} expiresAt=${expiresAt.toISOString()}`);
  }

  return {
    ok: true,
    status: 200,
    expiresInMin: OTP_TTL_MIN,
    ...(mode === "dev" ? { devCode: code } : {}),
  };
}

// ── Verify OTP ─────────────────────────────────────────────────
export interface VerifyOtpResult {
  ok: boolean;
  status: 200 | 400 | 401 | 429 | 500;
  error?: string;
  user?: {
    id: string;
    email: string;
    role: "BUYER" | "SELLER" | "LANDLORD" | "TENANT" | "AGENT";
    sessionToken: string;
    isNewUser: boolean;
  };
}

export async function verifyOtp(phoneInput: string, code: string): Promise<VerifyOtpResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) {
    return { ok: false, status: 400, error: "رقم هاتف غير صالح" };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: "الرمز يجب أن يكون 6 أرقام" };
  }
  const phoneHash = await sha256(phone);

  // Rate limit on verify attempts (per phone hash)
  const verifyAllowed = await checkOtpRateLimit(phoneHash, "verify");
  if (!verifyAllowed) {
    return { ok: false, status: 429, error: "تم تجاوز عدد محاولات التحقق. حاول بعد قليل." };
  }

  // Find the most recent unconsumed, unexpired code for this phone
  const record = await db.otpCode.findFirst({
    where: {
      phoneHash,
      consumed: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  // ANTI-ENUMERATION: return generic error whether record exists or not
  // (matches the email login path's approach)
  const GENERIC_OTP_ERROR = "بيانات التحقق غير صحيحة";
  if (!record) {
    return { ok: false, status: 401, error: GENERIC_OTP_ERROR };
  }

  // ── Hash check FIRST (before incrementing attempts) ──
  // This ensures correct codes are NEVER rejected due to attempt counting.
  // The attempt counter is only incremented for WRONG codes.
  const expectedHash = await pbkdf2Hash(code, phoneHash);
  if (expectedHash !== record.codeHash) {
    // Wrong code — increment attempts atomically
    const updated = await db.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= 5) {
      // Force-consume after 5 wrong attempts
      await db.otpCode.update({
        where: { id: record.id },
        data: { consumed: true },
      });
      return { ok: false, status: 429, error: "تجاوزت 5 محاولات خاطئة. اطلب رمزاً جديداً." };
    }
    // Audit failed attempt (matches email login path)
    await auditLog({
      userId: null,
      event: "LOGIN_FAILED",
      success: false,
      metadata: `phone=${maskPhone(phone)} (wrong OTP code)`,
    });
    return { ok: false, status: 401, error: GENERIC_OTP_ERROR };
  }

  // ── Correct code — consume it (race-safe) ──
  const consumed = await db.otpCode.updateMany({
    where: { id: record.id, consumed: false },
    data: { consumed: true },
  });
  if (consumed.count === 0) {
    // Already consumed by a concurrent request — abort
    return { ok: false, status: 401, error: GENERIC_OTP_ERROR };
  }

  // ── Find or create user with this phone ──
  // Phone is encrypted at rest; we look up via a deterministic phoneHash on User
  // (we add this column below). For now, since the existing schema doesn't have
  // phoneHash on User, we use email-as-key with phone-encoded-in-email pattern.
  // This is a transitional approach — a migration to add phoneHash on User is
  // recommended before production.
  const emailFromPhone = `phone+${phoneHash.slice(0, 16)}@aqarmatch.dz`;
  let isNewUser = false;
  let user = await db.user.findUnique({ where: { email: emailFromPhone } });

  if (!user) {
    isNewUser = true;
    const phoneEnc = await encryptJSON({ phone, verified: true });
    user = await db.user.create({
      data: {
        email: emailFromPhone,
        phoneEnc,
        nameEnc: await encryptJSON({ name: "" }),
        role: "BUYER",
        isGuest: false,
        verified: true,
        phoneVerifiedAt: new Date(),
      },
    });
    await auditLog({
      userId: user.id,
      event: "SIGNUP_PHONE",
      success: true,
      metadata: `phone=${maskPhone(phone)}`,
    });
  } else if (!user.verified || user.isGuest) {
    // Upgrade existing guest/verified=false user to verified
    user = await db.user.update({
      where: { id: user.id },
      data: {
        verified: true,
        isGuest: false,
        phoneVerifiedAt: new Date(),
        phoneEnc: await encryptJSON({ phone, verified: true }),
      },
    });
  }

  // Rotate session token on every successful OTP verification
  // (prevents session-fixation attacks). Uses the shared helper from
  // session.ts which also sets the httpOnly cookie with proper security
  // attributes (sameSite=strict, secure in production).
  await rotateSessionToken(user.id, false);

  await auditLog({
    userId: user.id,
    event: "LOGIN_PHONE",
    success: true,
    metadata: `phone=${maskPhone(phone)}`,
  });

  // Re-fetch the user to get the rotated token (rotateSessionToken
  // updated the DB but doesn't return the new token in the same shape).
  const updatedUser = await db.user.findUnique({
    where: { id: user.id },
    select: { sessionToken: true, email: true, role: true },
  });

  return {
    ok: true,
    status: 200,
    user: {
      id: user.id,
      email: updatedUser?.email || user.email,
      role: updatedUser?.role || user.role,
      sessionToken: updatedUser?.sessionToken || "",
      isNewUser,
    },
  };
}

// ── Sign out ───────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  const store = await cookies();
  // Rotate token in DB so any stolen cookie is invalidated
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await db.user.findUnique({ where: { sessionToken: token } });
    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { sessionToken: crypto.randomUUID() + "-" + Date.now() },
      });
      await auditLog({
        userId: user.id,
        event: "LOGOUT",
        success: true,
      });
    }
  }
  store.delete(SESSION_COOKIE);
}
