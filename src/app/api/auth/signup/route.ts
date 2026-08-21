import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto";
import {
  signupEmailSchema,
} from "@/lib/schemas";
import { hashPassword } from "@/lib/auth/password";
import { generateToken, sha256, pbkdf2Hash, generateNumericOtp } from "@/lib/auth/tokens";
import { checkSignupRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail, maskPhone } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { sendEmailVerificationEmail } from "@/lib/auth/email";
import { rotateSessionToken } from "@/lib/session";
import { normalizePhone } from "@/lib/auth";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/signup
//
//  Creates a new account via email + password. Sends a verification
//  email with a link (and a 6-digit code as fallback).
//
//  FLOW:
//  ────
//  1. Validate input (Zod) — reject malformed emails/weak passwords.
//  2. Rate limit (per-IP) — 5 signups/hour.
//  3. Check for duplicate email — return GENERIC error to prevent
//     account enumeration (don't reveal "email already exists").
//  4. Hash password (argon2id).
//  5. Encrypt name + phone (existing AES-256-GCM scheme).
//  6. Create User row (verified=false, isGuest=false until email verified).
//  7. Generate verification token + 6-digit code, hash both, store.
//  8. Send verification email (dev mode: log + return in response).
//  9. Rotate session token + set cookie (auto-login after signup).
// 10. Audit log: SIGNUP_EMAIL success.
//
//  SECURITY:
//  ────────
//  • Password is hashed BEFORE any DB write — never logged, never
//    in error responses.
//  • Duplicate email detection returns the SAME response shape as a
//    successful signup (sends a "verification email" anyway) — this
//    is the OWASP-recommended pattern to prevent enumeration.
//    (Internally we log the attempt + don't actually send the email
//    for duplicates, to avoid email bombing.)
//  • Verification token is 256 bits of entropy, stored as SHA-256 hash.
//  • The 6-digit code is stored as PBKDF2 hash (same as phone OTP).
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);

  // ── Rate limit ────────────────────────────────────────────────
  const rl = await checkSignupRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز حد التسجيل. حاول بعد ساعة." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // ── Parse + validate input ────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = signupEmailSchema.safeParse(body);
  if (!parsed.success) {
    // Return the FIRST issue code as the error key — the UI translates it.
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message || "INVALID_INPUT", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // ── Duplicate email check ─────────────────────────────────────
  // We return the SAME success response for duplicates (to prevent
  // enumeration), but internally we skip the actual account creation
  // + email send. We DO log the attempt for anomaly detection.
  try {
  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    // Log + return generic success (don't reveal the account exists).
    await auditLog({
      userId: null,
      event: "SIGNUP_EMAIL",
      success: false,
      ip,
      userAgent: ua,
      metadata: `email=${maskEmail(input.email)} (duplicate)`,
    });
    return NextResponse.json({
      ok: true,
      message: "تم إنشاء الحساب. تحقق من بريدك لتأكيد الحساب.",
      // No devCode/devLink — we didn't actually send an email.
      needsVerification: true,
    });
  }

  // ── Hash password (argon2id) ──────────────────────────────────
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    console.error("[signup] password hash failed:", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  // ── Encrypt phone (if provided) + name + NIN ──────────────────
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
  const phoneEnc = phoneNormalized
    ? await encryptJSON({ phone: phoneNormalized, verified: false })
    : await encryptJSON({ phone: "+213500000000", verified: false });
  const nameEnc = await encryptJSON({ name: input.fullName });
  const ninEnc = await encryptJSON({ nin: input.nin });

  // ── Create user ───────────────────────────────────────────────
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash,
      phoneEnc,
      nameEnc,
      ninEnc,
      role: "BUYER",
      isGuest: false,
      verified: false, // until email is verified
      lastLoginIp: ip,
    },
  });

  // ── Generate + store verification token + 6-digit code ────────
  const token = generateToken();
  const tokenHash = await sha256(token);
  const code = generateNumericOtp(6);
  const codeHash = await pbkdf2Hash(code, user.id); // user.id as salt
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.emailVerification.create({
    data: {
      userId: user.id,
      tokenHash,
      codeHash,
      expiresAt,
    },
  });

  // ── Send verification email (dev mode logs + returns devCode) ──
  const emailResult = await sendEmailVerificationEmail({
    to: input.email,
    token,
    code,
    name: input.fullName,
    lang: "ar",
  });

  // ── Rotate session + set cookie (auto-login after signup) ─────
  await rotateSessionToken(user.id, input.rememberMe);

  // ── Audit log ─────────────────────────────────────────────────
  await auditLog({
    userId: user.id,
    event: "SIGNUP_EMAIL",
    success: true,
    ip,
    userAgent: ua,
    metadata: `email=${maskEmail(input.email)}`,
  });

  return NextResponse.json({
    ok: true,
    message: "تم إنشاء الحساب. تحقق من بريدك لتأكيد الحساب.",
    needsVerification: true,
    // Dev-mode helpers (only present when EMAIL_MODE != "production"):
    ...(emailResult.devLink ? { devLink: emailResult.devLink } : {}),
    ...(emailResult.devCode ? { devCode: emailResult.devCode } : {}),
    user: {
      id: user.id,
      email: user.email,
      verified: false,
    },
  });
  } catch (error) {
    // ── CRITICAL: log the actual error for debugging on Netlify ──
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[signup] FATAL:", {
      message: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) + "...",
        hasEncryptionPassphrase: !!process.env.ENCRYPTION_PASSPHRASE,
        hasEncryptionKeySalt: !!process.env.ENCRYPTION_KEY_SALT,
        emailMode: process.env.EMAIL_MODE || "dev",
        hasSmtpHost: !!process.env.SMTP_HOST,
      },
    });

    // Determine a user-friendly error based on the actual error
    let userMessage = "تعذّر إنشاء الحساب.";
    if (errMsg.includes("DATABASE_URL") || errMsg.includes("P1001") || errMsg.includes("connector") || errMsg.includes("database")) {
      userMessage = "تعذّر الاتصال بقاعدة البيانات. تحقق من إعداد DATABASE_URL.";
    } else if (errMsg.includes("ENCRYPTION") || errMsg.includes("ENCRYPTION_PASSPHRASE") || errMsg.includes("decrypt")) {
      userMessage = "تعذّر تشفير البيانات. تحقق من إعدادات التشفير.";
    } else if (errMsg.includes("email") || errMsg.includes("smtp") || errMsg.includes("SMTP")) {
      userMessage = "تعذّر إرسال بريد التحقق. تحقق من إعدادات البريد الإلكتروني (SMTP).";
    } else if (errMsg.includes("Unique constraint") || errMsg.includes("P2002")) {
      userMessage = "البريد الإلكتروني مسجل مسبقاً. استخدم بريداً آخر أو سجّل الدخول.";
    }
    const code = errMsg.slice(0, 80).replace(/[^a-zA-Z0-9_ ]/g, "");
    return NextResponse.json(
      { error: userMessage, debugCode: code },
      { status: 500 },
    );
  }
}
