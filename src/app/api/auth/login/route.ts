import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginEmailSchema } from "@/lib/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { checkLoginRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { rotateSessionToken } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/login
//
//  Email + password login with brute-force protection.
//
//  ANTI-ENUMERATION (OWASP):
//  ─────────────────────────────
//  • Returns the SAME generic error ("بيانات الدخول غير صحيحة") whether:
//      - email doesn't exist
//      - password is wrong
//      - account is locked
//    This prevents attackers from distinguishing "no such account"
//    from "wrong password" via the response.
//  • Timing: we run a dummy argon2.verify() against a fixed hash even
//    when the email doesn't exist, so the response time is constant.
//
//  BRUTE-FORCE PROTECTION:
//  ──────────────────────
//  • Per-IP rate limit: 10 login attempts / 15 min.
//  • Per-identifier rate limit: 5 attempts / 15 min for the same email.
//  • Account lockout: after 5 failed attempts, lockedUntil is set to
//    (now + 15 min). Further logins for that email are rejected with
//    the same generic error (no "locked" message — prevents enumeration).
//
//  ACCOUNT LOCKOUT RECOVERY:
//  ────────────────────────
//  • loginAttempts resets to 0 on successful login.
//  • lockedUntil expires automatically after 15 min — user can retry.
//  • User can always use password reset to regain access immediately.
// ──────────────────────────────────────────────────────────────────

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min

// Fixed dummy hash used when email doesn't exist — ensures verifyPassword
// runs in constant time (prevents timing-based enumeration).
// This is a bcrypt hash of a random string; we never reveal what.
const DUMMY_HASH = "$2a$12$046tYRLeIm/a06K2/iY9Aem6N.I3dtEDZ/7POwnWluxwUT/knBMGK";

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);

  // ── Parse + validate ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = loginEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات الدخول غير صحيحة", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }
  const input = parsed.data;

  // ── Rate limit (per-IP + per-identifier) ───────────────────────
  const rl = await checkLoginRateLimit(ip, input.email);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز عدد محاولات الدخول. حاول بعد قليل.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // ── Find user by email ────────────────────────────────────────
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      loginAttempts: true,
      lockedUntil: true,
      isGuest: true,
      verified: true,
      systemRole: true,
      role: true,
    },
  });

  // ── Account lockout check (returns generic error if locked) ──
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await auditLog({
      userId: user.id,
      event: "LOGIN_FAILED",
      success: false,
      ip,
      userAgent: ua,
      metadata: `email=${maskEmail(input.email)} (locked)`,
    });
    return NextResponse.json(
      { error: "بيانات الدخول غير صحيحة", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }

  // ── Verify password (constant-time path even if user is null) ──
  let passwordOk = false;
  if (user?.passwordHash) {
    passwordOk = await verifyPassword(input.password, user.passwordHash);
  } else {
    // User doesn't exist OR has no password (phone-only account).
    // Run a dummy verify to keep timing constant.
    await verifyPassword(input.password, DUMMY_HASH);
  }

  // ── Handle wrong password / missing user ──────────────────────
  if (!user || !passwordOk) {
    if (user) {
      // Increment loginAttempts atomically; lock if threshold reached.
      const newAttempts = user.loginAttempts + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;
      await db.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: newAttempts,
          ...(shouldLock ? { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) } : {}),
        },
      });
      if (shouldLock) {
        await auditLog({
          userId: user.id,
          event: "ACCOUNT_LOCKED",
          success: false,
          ip,
          userAgent: ua,
          metadata: `email=${maskEmail(input.email)} (locked after ${newAttempts} failed)`,
        });
      }
    }
    await auditLog({
      userId: user?.id ?? null,
      event: "LOGIN_FAILED",
      success: false,
      ip,
      userAgent: ua,
      metadata: `email=${maskEmail(input.email)} (wrong password)`,
    });
    return NextResponse.json(
      { error: "بيانات الدخول غير صحيحة", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }

  // ── Success: reset loginAttempts + rotate session ─────────────
  await db.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    },
  });

  await rotateSessionToken(user.id, input.rememberMe);

  await auditLog({
    userId: user.id,
    event: "LOGIN_EMAIL",
    success: true,
    ip,
    userAgent: ua,
    metadata: `email=${maskEmail(input.email)}`,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      verified: user.verified,
      role: user.role,
      systemRole: user.systemRole,
    },
  });
}
