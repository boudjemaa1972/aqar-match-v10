import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// GET /api/admin/disputes — matches flagged as disputes
export async function GET() {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }

  const disputes = await db.match.findMany({
    where: { disputeFlag: true },
    select: {
      id: true, status: true, score: true, createdAt: true,
      disputeReason: true, disputeReportedAt: true, disputeReportedBy: true,
      buyer: { select: { id: true, accountCategory: true } },
      seller: { select: { id: true, accountCategory: true } },
      listing: { select: { id: true, intent: true, type: true, city: true, askingPrice: true, offerTitle: true } },
      conversation: { select: { id: true } },
      viewings: { select: { id: true, scheduledAt: true, status: true } },
    },
    orderBy: { disputeReportedAt: "desc" },
  });

  return NextResponse.json({ disputes });
}
