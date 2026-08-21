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
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[otp/request] FATAL:", {
      message: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) + "...",
        hasEncryptionPassphrase: !!process.env.ENCRYPTION_PASSPHRASE,
        hasEncryptionKeySalt: !!process.env.ENCRYPTION_KEY_SALT,
        otpMode: process.env.OTP_MODE || "dev",
      },
    });

    // Determine a user-friendly error based on the actual error
    let userMessage = "تعذّر إرسال رمز التحقق.";
    if (errMsg.includes("DATABASE_URL") || errMsg.includes("P1001") || errMsg.includes("connector") || errMsg.includes("database")) {
      userMessage = "تعذّر الاتصال بقاعدة البيانات. تحقق من إعداد DATABASE_URL.";
    } else if (errMsg.includes("ENCRYPTION") || errMsg.includes("ENCRYPTION_PASSPHRASE") || errMsg.includes("ENCRYPTION_KEY_SALT") || errMsg.includes("decrypt")) {
      userMessage = "تعذّر تشفير البيانات. تحقق من إعداد ENCRYPTION_PASSPHRASE و ENCRYPTION_KEY_SALT.";
    } else if (errMsg.includes("OtpCode") || errMsg.includes("table") || errMsg.includes("migration") || errMsg.includes("P2021")) {
      userMessage = "جدول OTP غير موجود. تأكد من تشغيل الترحيلات (migrations) على قاعدة البيانات.";
    } else if (errMsg.includes("rate") || errMsg.includes("limit")) {
      userMessage = "تم تجاوز حد الطلبات. حاول بعد قليل.";
    }
    // Append a short code for support / debugging
    const code = errMsg.slice(0, 80).replace(/[^a-zA-Z0-9_ ]/g, "");
    return NextResponse.json(
      { error: userMessage, debugCode: code },
      { status: 500 },
    );
  }
}
