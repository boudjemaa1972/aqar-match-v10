import { NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";

// GET /api/setup
// One-time endpoint: creates all tables in the database using prisma db push.
// After running once, this endpoint can be disabled or removed.
//
// Usage: visit https://your-site.netlify.app/api/setup

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL غير مُعرّف." },
      { status: 500 },
    );
  }

  try {
    // Step 1: Try connecting and counting users (fast check)
    const { db } = await import("@/lib/db");
    let userCount: number;
    try {
      userCount = await db.user.count();
    } catch {
      // Tables don't exist yet — proceed to create them
      userCount = -1;
    }

    if (userCount >= 0) {
      return NextResponse.json({
        ok: true,
        message: "الجداول موجودة بالفعل!",
        userCount,
      });
    }

    // Step 2: Tables don't exist — use prisma db push via direct binary path
    console.log("[setup] Tables not found, running prisma db push...");
    const prismaBin = path.join(
      process.cwd(),
      "node_modules",
      ".bin",
      "prisma",
    );
    const schemaPath = path.join(
      process.cwd(),
      "prisma",
      "schema.prisma",
    );

    const output = execSync(
      `"${prismaBin}" db push --skip-generate --accept-data-loss --schema="${schemaPath}"`,
      {
        encoding: "utf-8",
        timeout: 60_000,
        env: { ...process.env },
      },
    );

    console.log("[setup] prisma db push completed");

    // Step 3: Verify
    userCount = await db.user.count();
    return NextResponse.json({
      ok: true,
      message: "تم إنشاء الجداول بنجاح!",
      userCount,
      details: output.slice(-300),
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[setup] Failed:", errMsg);

    let userMessage = "فشل إنشاء الجداول.";
    if (errMsg.includes("DATABASE_URL") || errMsg.includes("P1001")) {
      userMessage = "تعذّر الاتصال بقاعدة DATABASE_URL. تأكد من صحته.";
    } else if (errMsg.includes("ENOSPC") || errMsg.includes("disk")) {
      userMessage = "مساحة القرص ممتلئة على الخادم.";
    } else if (errMsg.includes("ETIMEOUT") || errMsg.includes("ECONNREFUSED")) {
      userMessage = "انتهت مهلة الاتصال بقاعدة البيانات.";
    }

    return NextResponse.json(
      { ok: false, error: userMessage, details: errMsg.slice(0, 500) },
      { status: 500 },
    );
  }
}
