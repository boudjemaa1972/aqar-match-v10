import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireSellerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/matches/[id]/confirm-contact
//
//  After the buyer pays (status=BUYER_FEE_PAID), the seller has 48h
//  to confirm they've reached out to the buyer. If they confirm →
//  the match stays complete. If 48h passes without confirmation →
//  /api/match/process-expired marks it REFUNDED (buyer fee returned,
//  seller fee forfeited as penalty) and advances the queue.
//
//  This is the "seller seriousness" gate that protects buyers from
//  paying a fee and getting ghosted.
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

  const { match } = ctx;

  if (match.status !== "BUYER_FEE_PAID") {
    return NextResponse.json(
      { error: "التأكيد متاح فقط بعد دفع المشتري لرسمه." },
      { status: 400 },
    );
  }

  if (match.sellerConfirmContact) {
    return NextResponse.json({ ok: true, message: "تم تأكيد التواصل مسبقاً." });
  }

  await db.match.update({
    where: { id },
    data: {
      sellerConfirmContact: true,
      sellerConfirmAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    message: "تم تأكيد تواصلك مع المشتري. الصفقة مكتملة.",
    // ⚠️ secretMinPrice is NEVER returned here.
  });
}
