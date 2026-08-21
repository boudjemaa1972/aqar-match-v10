import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptField, decryptJSON } from "@/lib/crypto";
import {
  requireBuyerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  GET /api/match/[id]/status
//
//  Buyer polls this endpoint to check match progress.
//
//  States the buyer can see:
//   • PROPOSED        — match created, waiting for seller to pay+consent
//   • SELLER_FEE_PAID — (transient, rarely seen by buyer)
//   • BUYER_NOTIFIED  — seller consented, buyer can now pay buyerFee
//   • BUYER_FEE_PAID  — buyer paid, contact revealed (returns contact)
//   • EXPIRED         — 48h timeout, queue advancing
//   • REFUNDED        — buyer fee refunded (seller didn't confirm)
//   • REJECTED        — explicitly rejected
//
//  SECURITY: This response NEVER includes secretMinPrice, in any state.
//  Only askingPrice (public) is returned. When the match is BUYER_FEE_PAID,
//  contact + location + photos are decrypted and returned (both parties
//  have paid and consented at that point).
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireBuyerOfMatch(id);
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  const { match } = ctx;

  // ── BUYER_FEE_PAID: contact + geo are revealed ──────────────
  if (match.status === "BUYER_FEE_PAID") {
    const contact = await decryptField(match.listing.contactEnc);
    const location = await decryptField(match.listing.locationEnc);
    const photos = await decryptJSON<string[]>(match.listing.photosEnc);
    // Decrypt GPS — null if seller didn't set precise location.
    // Returned ONLY in this branch (BUYER_FEE_PAID) — never in earlier states.
    const geoLocation = match.listing.geoLocationEnc
      ? await decryptJSON<{ lat: number; lng: number; accuracy?: number | null }>(match.listing.geoLocationEnc)
      : null;
    return NextResponse.json({
      matchId: id,
      status: match.status,
      revealed: true,
      contact,
      location,
      geoLocation, // null if no GPS, else { lat, lng, accuracy? }
      photos: photos || [],
      sellerConfirmedContact: match.sellerConfirmContact,
      refundEligibleAt: match.refundEligibleAt,
      askingPrice: match.listing.askingPrice, // public
      // ⚠️ secretMinPrice is intentionally NEVER included here.
      // The buyer cannot learn the seller's reserve, ever — not even
      // after both parties have paid and consented.
    });
  }

  // ── Other states: return status + public info only ───────────
  return NextResponse.json({
    matchId: id,
    status: match.status,
    revealed: false,
    sellerFeePaid: match.sellerFeePaid,
    sellerConsented: match.sellerConsented,
    buyerFeePaid: match.buyerFeePaid,
    sellerDeadline: match.sellerDeadline,
    buyerDeadline: match.buyerDeadline,
    askingPrice: match.listing.askingPrice, // public — always visible
    buyerFee: match.buyerFee,
    queueRank: match.queueRank,
    message: getStatusMessage(match.status),
    // ⚠️ secretMinPrice is intentionally NEVER included here.
  });
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "PROPOSED":
      return "تم العثور على تطابق! في انتظار دفع البائع لرسمه وموافقته.";
    case "SELLER_FEE_PAID":
      return "البائع دفع رسمه، في انتظار موافقته النهائية.";
    case "BUYER_NOTIFIED":
      return "البائع وافق! يمكنك الآن دفع رسمك لعرض بيانات التواصل.";
    case "EXPIRED":
      return "انتهت صلاحية هذه المطابقة. جاري البحث عن العرض التالي في الطابور.";
    case "REFUNDED":
      return "تم استرداد رسمك. لم يستجب البائع في الوقت المحدد.";
    case "REJECTED":
      return "تم رفض هذه المطابقة.";
    default:
      return "";
  }
}
