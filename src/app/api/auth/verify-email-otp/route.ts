import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyEmailOtpSchema } from "@/lib/schemas";
import { pbkdf2Hash } from "@/lib/auth/tokens";
import { checkEmailVerificationRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { rotateSessionToken } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/verify-email-otp
//
//  Verifies a user's email via the 6-digit code (alternative to the
//  token-link path in /verify-email).
//
//  FLOW:
//  ────
//  1. Rate limit (per-IP): 10 attempts / 15 min.
//  2. Validate input (email + 6-digit code).
//  3. Find user by email → find latest unconsumed verification record.
//  4. Brute-force check: max 5 wrong attempts per record (same as OTP).
//  5. Hash code (PBKDF2) + compare.
//  6. On match: consume record, mark email verified, rotate session.
//  7. Audit log.
// ──────────────────────────────────────────────────────────────────

const MAX_CODE_ATTEMPTS = 5;

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);

  // ── Rate limit ────────────────────────────────────────────────
  const rl = await checkEmailVerificationRateLimit(ip);
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

  const parsed = verifyEmailOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "الرمز يجب أن يكون 6 أرقام" },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // ── Find user by email ────────────────────────────────────────
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (!user) {
    // Anti-enumeration: same error as wrong code.
    return NextResponse.json(
      { error: "رمز غير صحيح أو منتهي" },
      { status: 401 },
    );
  }

  // Already verified — idempotent success.
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  // ── Find latest unconsumed, unexpired verification record ─────
  const record = await db.emailVerification.findFirst({
    where: {
      userId: user.id,
      consumed: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    return NextResponse.json(
      { error: "لا يوجد رمز صالح. اطلب رمزاً جديداً." },
      { status: 401 },
    );
  }

  // ── Hash + compare code ────────────────────────────────────────
  const expectedHash = await pbkdf2Hash(input.code, user.id);
  if (expectedHash !== record.codeHash) {
    // Wrong code → increment attempts atomically
    const updated = await db.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= MAX_CODE_ATTEMPTS) {
      await db.emailVerification.update({
        where: { id: record.id },
        data: { consumed: true }, // force-consume after 5 wrong
      });
      return NextResponse.json(
        { error: "تجاوزت 5 محاولات خاطئة. اطلب رمزاً جديداً." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "رمز غير صحيح" }, { status: 401 });
  }

  // ── Correct code → consume + mark verified ─────────────────────
  const consumed = await db.emailVerification.updateMany({
    where: { id: record.id, consumed: false },
    data: { consumed: true },
  });
  if (consumed.count === 0) {
    return NextResponse.json(
      { error: "انتهت صلاحية الرمز. اطلب رمزاً جديداً." },
      { status: 401 },
    );
  }

  const now = new Date();
  await db.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: now,
      verified: true,
      isGuest: false,
    },
  });

  await rotateSessionToken(user.id, false);

  await auditLog({
    userId: user.id,
    event: "EMAIL_VERIFIED",
    success: true,
    ip,
    userAgent: ua,
    metadata: `email=${maskEmail(user.email)}`,
  });

  return NextResponse.json({
    ok: true,
    message: "تم تأكيد بريدك. حسابك الآن مفعّل.",
    user: { id: user.id, email: user.email, verified: true },
  });
}
