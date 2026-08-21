import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, SessionError, sessionErrorResponse } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match/[id]/report-dispute
//  Either party can flag a match as disputed. Sets disputeFlag=true.
//  Body: { reason: string }
// ──────────────────────────────────────────────────────────────────

const reportSchema = z.object({
  reason: z.string().min(10, "يرجى تقديم سبب واضح (10 أحرف على الأقل)").max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Verify user is a participant
  const match = await db.match.findUnique({
    where: { id },
    select: { buyerId: true, sellerId: true, disputeFlag: true },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }
  if (match.buyerId !== user.id && match.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  await db.match.update({
    where: { id },
    data: {
      disputeFlag: true,
      disputeReason: parsed.data.reason,
      disputeReportedAt: new Date(),
      disputeReportedBy: user.id,
    },
  });

  return NextResponse.json({ ok: true, message: "تم تسجيل البلاغ. ستقوم الإدارة بمراجعته." });
}
