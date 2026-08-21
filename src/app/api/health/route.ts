import { NextResponse } from "next/server";

// GET /api/health
// Returns the status of all critical environment variables
// so the developer can quickly diagnose deployment issues.
// SECURITY: Only exposes boolean presence, never actual secret values.

export async function GET() {
  const checks: Record<string, { ok: boolean; hint?: string }> = {};

  // 1. Database
  checks.DATABASE_URL = {
    ok: !!process.env.DATABASE_URL,
    hint: !process.env.DATABASE_URL
      ? "غير مُعرّف — أضفه في Netlify → Site Settings → Environment Variables"
      : process.env.DATABASE_URL.startsWith("postgresql")
        ? "صيغة صحيحة (PostgreSQL)"
        : process.env.DATABASE_URL.startsWith("file:")
          ? "⚠️ يشير إلى ملف SQLite — يجب أن يكون PostgreSQL في الإنتاج"
          : "⚠️ الصيغة غير متوقعة — تأكد من أن القيمة تبدأ بـ postgresql://",
  };

  // 2. Encryption
  checks.ENCRYPTION_PASSPHRASE = {
    ok: !!process.env.ENCRYPTION_PASSPHRASE,
    hint: !process.env.ENCRYPTION_PASSPHRASE
      ? "غير مُعرّف — أنشأه بـ: openssl rand -base64 48"
      : process.env.ENCRYPTION_PASSPHRASE.length < 16
        ? "⚠️ قصير جداً — يجب أن يكون ≥16 حرف"
        : "✓ مُعرّف",
  };
  checks.ENCRYPTION_KEY_SALT = {
    ok: !!process.env.ENCRYPTION_KEY_SALT,
    hint: !process.env.ENCRYPTION_KEY_SALT
      ? "غير مُعرّف — أنشأه بـ: openssl rand -base64 32"
      : "✓ مُعرّف",
  };

  // 3. OTP
  const otpMode = process.env.OTP_MODE || "dev";
  checks.OTP_MODE = {
    ok: true,
    hint: otpMode === "production"
      ? "⚠️ وضع الإنتاج — تأكد من إعداد مزوّد SMS"
      : "وضع التطوير (الرمز يظهر في الاستجابة)",
  };

  // 4. Email (optional but needed for signup verification)
  const hasSmtp = !!process.env.SMTP_HOST;
  checks.EMAIL = {
    ok: true,
    hint: hasSmtp
      ? `SMTP مُعرّف: ${process.env.SMTP_HOST}`
      : "⚠️ SMTP غير مُعرّف — إرسال البريد لن يعمل (الحساب سيُنشأ لكن لن يصل بريد التحقق)",
  };

  // 5. Try a quick database connection test
  let dbConnection = "skipped";
  let dbError = "";
  try {
    const { db } = await import("@/lib/db");
    const count = await db.user.count();
    dbConnection = "ok";
    checks.DATABASE = {
      ok: true,
      hint: `✓ متصل — عدد المستخدمين: ${count}`,
    };
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
    checks.DATABASE = {
      ok: false,
      hint: `✗ فشل الاتصال: ${dbError.slice(0, 120)}`,
    };
  }

  // Overall status
  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
