import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireSellerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/matches/[id]/approve
//
//  ⚠️  DEMO PAYMENT — NOT FOR PRODUCTION
//  In production this must integrate with Algerian payment gateways:
//     • CCP (Algérie Poste)
//     • BaridiMob
//     • Edahabia
//  Replace the `markPaid` logic with a real payment intent + webhook.
//
//  SELLER-FIRST FEE MODEL:
//   1. Match created → status=PROPOSED (seller notified).
//   2. THIS endpoint: seller pays sellerFee + consents →
//      status=BUYER_NOTIFIED (buyer gets notified).
//   3. Buyer pays buyerFee (separate endpoint) →
//      status=BUYER_FEE_PAID (contact revealed).
//
//  If the seller does NOT call this endpoint within 48h of the match
//  being created → /api/match/process-expired marks the match EXPIRED,
//  the seller fee is NOT charged (since they never paid), and the next
//  match in the queue is promoted.
//
//  Note: The spec mentions "forfeit seller fee if paid but no consent
//  in 48h". In this v2 model, paying and consenting happen in the same
//  call (this endpoint). So the 48h window is "pay+consent or expire".
//  If a future iteration splits pay and consent into two steps, the
//  forfeit logic would apply between them.
// ──────────────────────────────────────────────────────────────────

const BUYER_DEADLINE_HOURS = 48;

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

  const { match } = ctx;

  if (["REJECTED", "EXPIRED", "REFUNDED", "BUYER_FEE_PAID", "BUYER_NOTIFIED"].includes(match.status)) {
    return NextResponse.json(
      { error: "هذه المطابقة مغلقة أو تمت معالجتها بالفعل." },
      { status: 400 },
    );
  }

  if (match.status !== "PROPOSED") {
    return NextResponse.json(
      { error: "حالة غير متوقعة.", code: "INVALID_STATE" },
      { status: 400 },
    );
  }

  const now = new Date();
  const buyerDeadline = new Date(now.getTime() + BUYER_DEADLINE_HOURS * 60 * 60 * 1000);

  await db.match.update({
    where: { id },
    data: {
      sellerFeePaid: true,
      sellerFeePaidAt: now,
      sellerConsented: true,
      sellerConsentedAt: now,
      status: "BUYER_NOTIFIED",
      buyerDeadline,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "تم دفع رسمك وإبداء موافقتك. تم إشعار المشتري — لديه 48 ساعة لدفع رسمه.",
    buyerDeadline,
    buyerDeadlineHours: BUYER_DEADLINE_HOURS,
    // ⚠️ secretMinPrice is NEVER returned to anyone via this endpoint.
  });
}
