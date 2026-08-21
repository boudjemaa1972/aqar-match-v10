import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailSchema } from "@/lib/schemas";
import { generateToken, sha256, pbkdf2Hash, generateNumericOtp } from "@/lib/auth/tokens";
import { checkEmailVerificationRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { sendEmailVerificationEmail } from "@/lib/auth/email";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/resend-verification
//
//  Resends the email verification email. Used when the user signed up
//  but didn't click the link within 24h, or the email never arrived.
//
//  Anti-enumeration: returns success even if the email doesn't exist
//  or is already verified (no observable difference to caller).
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);

  // ── Rate limit ────────────────────────────────────────────────
  const rl = await checkEmailVerificationRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز عدد الطلبات. حاول بعد قليل." },
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

  const parsed = emailSchema.safeParse((body as { email?: string })?.email);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بريد إلكتروني غير صالح" },
      { status: 422 },
    );
  }
  const email = parsed.data;

  // ── Find user — silent if not found or already verified ───────
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!user || user.emailVerifiedAt) {
    // Same response as success — no info leak.
    return NextResponse.json({
      ok: true,
      message: "إذا كان البريد مسجلاً وغير مفعّل، ستصلك رسالة تأكيد.",
    });
  }

  // ── Generate + store new verification token + code ─────────────
  const token = generateToken();
  const tokenHash = await sha256(token);
  const code = generateNumericOtp(6);
  const codeHash = await pbkdf2Hash(code, user.id);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.emailVerification.create({
    data: {
      userId: user.id,
      tokenHash,
      codeHash,
      expiresAt,
    },
  });

  // ── Send email ─────────────────────────────────────────────────
  const emailResult = await sendEmailVerificationEmail({
    to: user.email,
    token,
    code,
  });

  await auditLog({
    userId: user.id,
    event: "EMAIL_VERIFIED", // re-using enum — semantically "verification flow"
    success: false, // false because not yet verified (only resent)
    ip,
    userAgent: ua,
    metadata: `email=${maskEmail(user.email)} (resend)`,
  });

  return NextResponse.json({
    ok: true,
    message: "تم إرسال رسالة تأكيد جديدة.",
    ...(emailResult.devLink ? { devLink: emailResult.devLink } : {}),
    ...(emailResult.devCode ? { devCode: emailResult.devCode } : {}),
  });
}
