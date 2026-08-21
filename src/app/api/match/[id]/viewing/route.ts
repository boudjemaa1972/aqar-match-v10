import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  GET /api/match/[id]/viewing
//  Returns viewing details for a match — visible to buyer + seller.
//  Shows: date/time, representative NAME (no contact info), status,
//  confirmation flags, outcome.
//  NEVER shows: representative's phone, email, or personal contact.
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await params;
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Verify user is a participant
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { buyerId: true, sellerId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }
  if (match.buyerId !== user.id && match.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const viewing = await db.viewing.findFirst({
    where: { matchId },
    orderBy: { scheduledAt: "asc" },
  });

  if (!viewing) {
    return NextResponse.json({ viewing: null });
  }

  return NextResponse.json({
    viewing: {
      id: viewing.id,
      scheduledAt: viewing.scheduledAt,
      representativeName: viewing.representativeName, // display name only — NO contact
      status: viewing.status,
      buyerConfirmed: viewing.buyerConfirmed,
      sellerConfirmed: viewing.sellerConfirmed,
      outcome: viewing.outcome,
      // notes are INTERNAL — NOT returned to either party
    },
  });
}
