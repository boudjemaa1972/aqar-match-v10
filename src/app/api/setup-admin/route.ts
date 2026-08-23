import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

// POST /api/setup-admin — promote current user to ADMIN
// One-time endpoint for the platform owner to gain admin access.
export async function POST() {
  try {
    const user = await getOrCreateSession();

    if (user.isGuest) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول بحساب حقيقي أولاً (ليس كضيف)" },
        { status: 403 },
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { systemRole: "ADMIN" },
    });

    return NextResponse.json({
      ok: true,
      message: "تم تفعيل صلاحيات الإدارة! أعد تحميل الصفحة.",
      adminUrl: "/admin",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطأ غير معروف" },
      { status: 500 },
    );
  }
}
