import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyEmailSchema } from "@/lib/schemas";
import { sha256 } from "@/lib/auth/tokens";
import { checkEmailVerificationRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { rotateSessionToken } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/verify-email
//
//  Verifies a user's email via the token from the verification link.
//  Alternative: /api/auth/verify-email-otp for the 6-digit code path.
//
//  FLOW:
//  ────
//  1. Rate limit (per-IP): 10 attempts / 15 min.
//  2. Validate input (token format).
//  3. Hash the token + look up in EmailVerification.
//  4. Check expiry + consumed flag.
//  5. Set user.emailVerifiedAt + user.verified (for backward compat).
//  6. Mark verification record as consumed (single-use).
//  7. Audit log: EMAIL_VERIFIED success.
//  8. Rotate session + auto-login.
// ──────────────────────────────────────────────────────────────────

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

  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "الرابط غير صالح" },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // ── Find verification record by token hash ────────────────────
  const tokenHash = await sha256(input.token);
  const record = await db.emailVerification.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });

  const GENERIC_ERROR = "الرابط غير صالح أو منتهي. اطلب رابطاً جديداً.";
  if (!record) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (record.consumed) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // ── Mark email as verified ─────────────────────────────────────
  const now = new Date();
  await db.user.update({
    where: { id: record.userId },
    data: {
      emailVerifiedAt: now,
      verified: true, // backward compat with the existing `verified` boolean
      isGuest: false,
    },
  });

  // ── Mark verification record as consumed ───────────────────────
  await db.emailVerification.update({
    where: { id: record.id },
    data: { consumed: true },
  });

  // ── Rotate session + auto-login ───────────────────────────────
  await rotateSessionToken(record.userId, false);

  await auditLog({
    userId: record.userId,
    event: "EMAIL_VERIFIED",
    success: true,
    ip,
    userAgent: ua,
    metadata: `email=${maskEmail(record.user.email)}`,
  });

  return NextResponse.json({
    ok: true,
    message: "تم تأكيد بريدك الإلكتروني. حسابك الآن مفعّل بالكامل.",
    user: { id: record.userId, email: record.user.email, verified: true },
  });
}
