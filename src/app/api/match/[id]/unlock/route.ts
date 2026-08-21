import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match/[id]/unlock  — DEPRECATED
//
//  This endpoint was used in the old flow where the buyer initiated
//  the unlock request. In the new seller-first fee model (v2), the
//  flow is:
//
//    1. Match created → seller notified (status=PROPOSED).
//    2. Seller pays + consents → POST /api/seller/matches/[id]/approve
//       (status=BUYER_NOTIFIED).
//    3. Buyer pays fee → POST /api/match/[id]/pay-fee
//       (status=BUYER_FEE_PAID, contact revealed).
//
//  This endpoint is kept as a 410 Gone to inform any old clients.
// ──────────────────────────────────────────────────────────────────

export async function POST() {
  return NextResponse.json(
    {
      error:
        "هذا المسار لم يعد مستخدماً. التدفق الجديد يتطلب من البائع الدفع أولاً عبر /api/seller/matches/[id]/approve، ثم يدفع المشتري عبر /api/match/[id]/pay-fee.",
      code: "DEPRECATED",
    },
    { status: 410 },
  );
}
