import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptField, decryptJSON } from "@/lib/crypto";
import {
  requireBuyerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";
import { shouldBlockContactReveal } from "@/lib/fees";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match/[id]/pay-fee  (BUYER fee payment)
//
//  ⚠️  DEMO PAYMENT — NOT FOR PRODUCTION
//  This endpoint marks the buyer's fee as paid without real payment
//  processing. Future integration must use Algerian payment gateways:
//     • CCP (Compte Postal) — Algérie Poste
//     • BaridiMob — mobile banking app
//     • Edahabia — national bank card
//  Replace the `markPaid` logic below with a real payment intent +
//  webhook handler when integrating these gateways.
//
//  FLOW (seller-first model):
//   1. Match created → status=PROPOSED, seller notified.
//   2. Seller pays sellerFee + consents (separate endpoint) →
//      status=SELLER_FEE_PAID → BUYER_NOTIFIED.
//   3. THIS endpoint: buyer pays buyerFee → status=BUYER_FEE_PAID
//      (contact revealed to both parties).
//   4. Seller must "confirm contact" within 48h of buyer payment.
//      If not → /api/match/process-expired refunds buyer, advances queue.
//
//  This endpoint can ONLY be called when status=BUYER_NOTIFIED.
//  If status=PROPOSED or SELLER_FEE_PAID, the buyer cannot pay yet
//  (seller must go first).
// ──────────────────────────────────────────────────────────────────

const SELLER_CONFIRM_WINDOW_HOURS = 48;

export async function POST(
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

  // ── FAIL-FAST: block contact reveal for DEVELOPER category ──
  // This is a deliberate business model decision, not a technical limitation.
  // DEVELOPER matches use internal chat + scheduled viewings instead.
  const [seller, buyer] = await Promise.all([
    db.user.findUnique({ where: { id: match.sellerId }, select: { accountCategory: true, categoryVerified: true } }),
    db.user.findUnique({ where: { id: match.buyerId }, select: { accountCategory: true, categoryVerified: true } }),
  ]);
  const sellerCat = seller?.categoryVerified ? seller.accountCategory : "INDIVIDUAL";
  const buyerCat = buyer?.categoryVerified ? buyer.accountCategory : "INDIVIDUAL";
  if (shouldBlockContactReveal(sellerCat, buyerCat)) {
    return NextResponse.json(
      {
        error: "هذه المطابقة تتطلب فئة المرقّين العقاريين. لا يمكن كشف بيانات التواصل مباشرة — استخدم المحادثة الداخلية لتنظيم موعد معاينة مع ممثل المنصة.",
        code: "DEVELOPER_NO_CONTACT_REVEAL",
      },
      { status: 403 },
    );
  }

  // Closed states
  if (["REJECTED", "EXPIRED", "REFUNDED", "BUYER_FEE_PAID"].includes(match.status)) {
    return NextResponse.json(
      { error: "هذه المطابقة مغلقة أو مكتملة." },
      { status: 400 },
    );
  }

  // Seller must go first
  if (match.status === "PROPOSED" || match.status === "SELLER_FEE_PAID") {
    return NextResponse.json(
      {
        error:
          "يجب أن يدفع البائع رسمه ويوافق أولاً قبل أن تتمكن من الدفع. سيتم إشعارك فور استجابة البائع.",
        code: "SELLER_MUST_PAY_FIRST",
      },
      { status: 409 },
    );
  }

  // Status must be BUYER_NOTIFIED at this point
  if (match.status !== "BUYER_NOTIFIED") {
    return NextResponse.json(
      { error: "حالة غير متوقعة.", code: "INVALID_STATE" },
      { status: 400 },
    );
  }

  // Already paid?
  if (match.buyerFeePaid) {
    return NextResponse.json({
      ok: true,
      message: "تم دفع رسمك مسبقاً.",
    });
  }

  const now = new Date();
  const refundEligibleAt = new Date(now.getTime() + SELLER_CONFIRM_WINDOW_HOURS * 60 * 60 * 1000);

  await db.match.update({
    where: { id },
    data: {
      buyerFeePaid: true,
      buyerFeePaidAt: now,
      refundEligibleAt,
      status: "BUYER_FEE_PAID",
      buyerConsent: true,
    },
  });

  // Decrypt contact/location/geo/photos for the buyer now that both parties paid.
  // ⚠️ secretMinPriceEnc is NEVER decrypted here — only contact + location + geo + photos.
  const contact = await decryptField(match.listing.contactEnc);
  const location = await decryptField(match.listing.locationEnc);
  const photos = await decryptJSON<string[]>(match.listing.photosEnc);
  // Decrypt GPS coordinates — null if seller didn't set precise location.
  // Frontend uses this to render an inline map; null means "no precise location".
  const geoLocation = match.listing.geoLocationEnc
    ? await decryptJSON<{ lat: number; lng: number; accuracy?: number | null }>(match.listing.geoLocationEnc)
    : null;

  return NextResponse.json({
    ok: true,
    message: "تم تأكيد جدّيتك ودفع رسمك. بيانات التواصل مفتوحة الآن لك وللبائع.",
    refundEligibleAt,
    refundWindowHours: SELLER_CONFIRM_WINDOW_HOURS,
    contact,
    location,
    geoLocation, // null if no GPS, else { lat, lng, accuracy? }
    photos: photos || [],
    // ⚠️ secretMinPrice is intentionally NEVER included in this response.
    // The buyer has no way to learn the seller's reserve, ever.
  });
}
