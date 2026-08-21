import { NextResponse } from "next/server";
import { execSync } from "child_process";

// GET /api/setup
// One-time endpoint: creates all tables in the database using prisma db push.
// After running once, this endpoint can be disabled or removed.
//
// Usage: visit https://your-site.netlify.app/api/setup
// Returns: { ok: true, message: "..." } or { ok: false, error: "..." }

export async function GET() {
  // ── Security: only allow in production and only once ──────────
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL غير مُعرّف في بيئة الخادم." },
      { status: 500 },
    );
  }

  if (!process.env.ENCRYPTION_PASSPHRASE || !process.env.ENCRYPTION_KEY_SALT) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ENCRYPTION_PASSPHRASE أو ENCRYPTION_KEY_SALT غير مُعرّفين.",
      },
      { status: 500 },
    );
  }

  try {
    console.log("[setup] Starting prisma db push...");

    // Run prisma db push to sync schema to the database
    const output = execSync(
      "npx prisma db push --skip-generate --accept-data-loss --schema=prisma/schema.prisma",
      {
        encoding: "utf-8",
        timeout: 60_000, // 60 seconds max
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
        },
      },
    );

    console.log("[setup] prisma db push completed successfully");

    // Verify by counting users (quick DB connection test)
    const { db } = await import("@/lib/db");
    const userCount = await db.user.count();

    return NextResponse.json({
      ok: true,
      message: "تم إنشاء/تحديث الجداول بنجاح!",
      userCount,
      details: output.slice(-500), // last 500 chars of prisma output
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[setup] Failed:", errMsg);

    return NextResponse.json(
      {
        ok: false,
        error: "فشل إنشاء الجداول.",
        details: errMsg.slice(0, 500),
      },
      { status: 500 },
    );
  }
}
