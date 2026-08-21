import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/schemas";
import { generateToken, sha256 } from "@/lib/auth/tokens";
import { checkPasswordResetRequestRateLimit } from "@/lib/auth/rate-limit";
import { auditLog, maskEmail } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";
import { sendPasswordResetEmail } from "@/lib/auth/email";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
//
//  Triggers a password reset email. Anti-enumeration: returns the
//  SAME success response whether the email exists or not, so an
//  attacker can't probe for valid emails.
//
//  FLOW:
//  ────
//  1. Rate limit (per-IP): 5 requests/hour.
//  2. Validate email format.
//  3. Find user by email.
//      - If found → generate token, store SHA-256 hash, send email.
//      - If not found → return SAME success response, do nothing.
//  4. Audit log (always — to detect probing patterns).
//  5. Return generic success.
//
//  TOKEN SECURITY:
//  ─────────────
//  • 256 bits of entropy (32 random bytes → base64url).
//  • Stored as SHA-256 hash in DB (so a DB leak doesn't reveal tokens).
//  • TTL: 15 minutes (short — forces prompt use).
//  • Single-use: marked usedAt on consumption, can't be replayed.
//
//  ANTI-BOMBING:
//  ────────────
//  Per-user rate limiting is enforced by the per-IP limit + the
//  existing check on the email-sending SMTP layer. If a user gets
//  bombed, the IP-based limit kicks in after 5 requests.
// ──────────────────────────────────────────────────────────────────

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);

  try {
    // ── Rate limit ────────────────────────────────────────────────
    const rl = await checkPasswordResetRequestRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "تم تجاوز عدد الطلبات. حاول بعد ساعة." },
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

    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بريد إلكتروني غير صالح" },
        { status: 422 },
      );
    }
    const input = parsed.data;

    // ── Find user (silent if not found — anti-enumeration) ─────────
    const user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true },
    });

    // Always return success — even if the email doesn't exist.
    // The only observable difference is the audit log (for security team).
    if (user) {
      // ── Generate + store reset token ────────────────────────────
      const token = generateToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await db.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          requestedIp: ip,
          requestedUa: ua,
        },
      });

      // ── Send email (dev mode logs + returns devLink) ─────────────
      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        token,
      });

      await auditLog({
        userId: user.id,
        event: "PASSWORD_RESET_REQUESTED",
        success: true,
        ip,
        userAgent: ua,
        metadata: `email=${maskEmail(user.email)}`,
      });

      return NextResponse.json({
        ok: true,
        message: "إذا كان البريد مسجلاً، ستصلك رسالة إعادة تعيين.",
        ...(emailResult.devLink ? { devLink: emailResult.devLink } : {}),
      });
    }

    // ── User not found — same response, no email sent ──────────────
    await auditLog({
      userId: null,
      event: "PASSWORD_RESET_REQUESTED",
      success: false,
      ip,
      userAgent: ua,
      metadata: `email=${maskEmail(input.email)} (not found)`,
    });

    return NextResponse.json({
      ok: true,
      message: "إذا كان البريد مسجلاً، ستصلك رسالة إعادة تعيين.",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[forgot-password] FATAL:", errMsg);
    let userMessage = "حدث خطأ. حاول مرة أخرى.";
    if (errMsg.includes("DATABASE_URL") || errMsg.includes("P1001") || errMsg.includes("database")) {
      userMessage = "تعذّر الاتصال بقاعدة البيانات. تحقق من إعداد DATABASE_URL.";
    } else if (errMsg.includes("ENCRYPTION") || errMsg.includes("decrypt")) {
      userMessage = "تعذّر تشفير البيانات. تحقق من إعدادات التشفير.";
    }
    return NextResponse.json(
      { error: userMessage, debugCode: errMsg.slice(0, 80) },
      { status: 500 },
    );
  }
}
