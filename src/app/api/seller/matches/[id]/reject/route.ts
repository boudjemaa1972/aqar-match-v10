import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireSellerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/matches/[id]/reject
//
//  Seller rejects revealing contact. Sets status=REJECTED.
//  Buyer will see "rejected" status on next poll.
//
//  IDOR protection: caller must be the seller of this match.
// ──────────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireSellerOfMatch(id);
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  await db.match.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  return NextResponse.json({
    matchId: id,
    status: "REJECTED",
    message: "تم رفض طلب الفتح. لن يتمكن المشتري من رؤية بيانات الاتصال.",
  });
}
