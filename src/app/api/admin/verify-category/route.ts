import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSecret } from "@/lib/admin-guard";

// ──────────────────────────────────────────────────────────────────
//  POST /api/admin/verify-category
//  Admin-only: verifies a user's account category (AGENCY or DEVELOPER).
//  Sets categoryVerified = true + records who verified + when.
//  Protected by CRON_SECRET.
//
//  Body: { userId }
//  This is a manual verification step — in the future, it will be
//  integrated with official Algerian registries.
// ──────────────────────────────────────────────────────────────────

const verifySchema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  const guard = requireAdminSecret(req);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId مطلوب" }, { status: 422 });
  }

  const { userId } = parsed.data;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, accountCategory: true, categoryVerified: true },
  });
  if (!user) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }
  if (user.accountCategory === "INDIVIDUAL") {
    return NextResponse.json(
      { error: "الفردية لا تتطلب تحقق فئة" },
      { status: 400 },
    );
  }
  if (user.categoryVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  await db.user.update({
    where: { id: userId },
    data: {
      categoryVerified: true,
      categoryVerifiedAt: new Date(),
      // categoryVerifiedBy would be set to the admin's userId in production
    },
  });

  return NextResponse.json({
    ok: true,
    userId,
    accountCategory: user.accountCategory,
    verified: true,
  });
}
