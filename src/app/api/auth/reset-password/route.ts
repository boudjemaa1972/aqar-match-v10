import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/schemas";
import { hashPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/auth/tokens";
import { checkPasswordResetUseRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { rotateSessionToken } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/reset-password
//
//  Consumes a password reset token + sets a new password.
//
//  FLOW:
//  ────
//  1. Rate limit (per-IP): 5 uses / 15 min.
//  2. Validate input (token + new password strength).
//  3. Hash the token (SHA-256) and look it up in PasswordReset.
//  4. Check expiry + already-used.
//  5. Hash the new password (argon2id) + update User.
//  6. Mark the token as used (single-use).
//  7. Invalidate ALL existing sessions for that user (rotate sessionToken).
//  8. Set a fresh session cookie (auto-login after reset).
//  9. Audit log: PASSWORD_RESET_USED success.
//
//  SECURITY:
//  ────────
//  • The token is hashed before lookup — a DB leak doesn't reveal
//    valid tokens.
//  • Used tokens are marked (not deleted) so we can audit which token
//    was used + when. They're cleaned up by a cron later.
//  • After reset, we rotate the sessionToken — this logs out any
//    other sessions that may have been active (defensive against
//    an attacker who reset the password because they noticed a breach).
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);

  // ── Rate limit ────────────────────────────────────────────────
  const rl = await checkPasswordResetUseRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز عدد المحاولات. حاول بعد قليل." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // ── Parse + validate ───────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "INVALID_INPUT" },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // ── Find token by hash ────────────────────────────────────────
  const tokenHash = await sha256(input.token);
  const resetRecord = await db.passwordReset.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });

  // Generic error for expired / used / not-found tokens
  const GENERIC_ERROR = "الرابط غير صالح أو منتهي. اطلب رابطاً جديداً.";
  if (!resetRecord) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (resetRecord.usedAt) {
    // Single-use enforcement
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (resetRecord.expiresAt < new Date()) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // ── Hash new password + update user ───────────────────────────
  const newHash = await hashPassword(input.password);
  await db.user.update({
    where: { id: resetRecord.userId },
    data: {
      passwordHash: newHash,
      loginAttempts: 0, // reset lockout state
      lockedUntil: null,
    },
  });

  // ── Mark token as used (single-use) ────────────────────────────
  await db.passwordReset.update({
    where: { id: resetRecord.id },
    data: { usedAt: new Date() },
  });

  // ── Rotate session (logs out all other devices) ──────────────
  await rotateSessionToken(resetRecord.userId, false);

  await auditLog({
    userId: resetRecord.userId,
    event: "PASSWORD_RESET_USED",
    success: true,
    ip,
    userAgent: ua,
    metadata: `email=${maskEmail(resetRecord.user.email)}`,
  });

  return NextResponse.json({
    ok: true,
    message: "تم تغيير كلمة المرور. سجّل دخولك بالكلمة الجديدة.",
    user: { id: resetRecord.userId, email: resetRecord.user.email },
  });
}
