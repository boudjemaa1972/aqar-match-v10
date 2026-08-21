import { NextResponse } from "next/server";
import { z } from "zod";
import { issueOtp } from "@/lib/auth";

// POST /api/auth/otp/request
// Body: { phone: string }
// Returns: { ok: true, expiresInMin: 5, devCode?: string } (devCode only in dev mode)
// Rate limited: 5 requests per phone per 15 min.

const schema = z.object({
  phone: z.string().min(10).max(20),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "رقم هاتف غير صالح" }, { status: 422 });
  }

  try {
    const result = await issueOtp(parsed.data.phone);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      expiresInMin: result.expiresInMin,
      ...(result.devCode ? { devCode: result.devCode, dev: true } : {}),
    });
  } catch (error) {
    // ── CRITICAL: log the actual error for debugging ──
    // On Netlify/Vercel, this shows in the Functions log.
    // Common causes:
    //   1. DATABASE_URL not set or pointing to SQLite (not Supabase)
    //   2. ENCRYPTION_PASSPHRASE / ENCRYPTION_KEY_SALT not set
    //   3. Prisma client not generated (missing postinstall hook)
    //   4. OtpCode table doesn't exist (migrations not run on Supabase)
    console.error("[otp/request] FATAL:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) + "...",
        hasEncryptionPassphrase: !!process.env.ENCRYPTION_PASSPHRASE,
        hasEncryptionKeySalt: !!process.env.ENCRYPTION_KEY_SALT,
        otpMode: process.env.OTP_MODE || "dev",
      },
    });

    // Return a generic error to the user (don't leak internals)
    return NextResponse.json(
      { error: "تعذّر إرسال رمز التحقق. تحقق من إعدادات الخادم." },
      { status: 500 },
    );
  }
}
