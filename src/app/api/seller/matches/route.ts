import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { decryptField } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────
//  GET /api/seller/matches
//
//  Returns all matches where the current session user is the seller.
//  Used by the Seller Dashboard to show pending unlock requests &
//  pending negotiation offers.
//
//  IDOR protection: filter by sellerId = session.user.id
//  Note: uses getOrCreateSession() so a first-time visitor gets a
//  guest session automatically — they'll have zero listings until
//  they POST to activate seller mode.
// ──────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getOrCreateSession();

  // Find all matches where current user is the seller.
  const [matches, listingsCount] = await Promise.all([
    db.match.findMany({
      where: { sellerId: user.id },
      include: { listing: true, negotiation: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.listing.count({ where: { ownerId: user.id } }),
  ]);

  if (listingsCount === 0) {
    return NextResponse.json({
      matches: [],
      hasListings: false,
      message: "ليس لديك عقارات بعد. فعّل وضع البائع التجريبي للبدء.",
    });
  }

  const out = await Promise.all(
    matches.map(async (m) => {
      // Decrypt seller-side contact info so seller can preview their own listing
      const location = await decryptField(m.listing.locationEnc);
      return {
        matchId: m.id,
        score: m.score,
        status: m.status,
        queueRank: m.queueRank,
        sellerFeePaid: m.sellerFeePaid,
        sellerConsented: m.sellerConsented,
        buyerFeePaid: m.buyerFeePaid,
        sellerConfirmContact: m.sellerConfirmContact,
        sellerDeadline: m.sellerDeadline,
        buyerDeadline: m.buyerDeadline,
        refundEligibleAt: m.refundEligibleAt,
        buyerConsent: m.buyerConsent,
        sellerFee: m.sellerFee,
        buyerFee: m.buyerFee,
        createdAt: m.createdAt,
        rounds: m.negotiation?.rounds ?? 0,
        buyerOffer: m.negotiation?.buyerOffer ?? null,
        sellerOffer: m.negotiation?.sellerOffer ?? null,
        buyerTurn: m.negotiation?.buyerTurn ?? true,
        listing: {
          id: m.listing.id,
          intent: m.listing.intent,
          type: m.listing.type,
          city: m.listing.city,
          commune: m.listing.commune,
          district: m.listing.district,
          askingPrice: m.listing.askingPrice,
          areaSqm: m.listing.areaSqm,
          bedrooms: m.listing.bedrooms,
          bathrooms: m.listing.bathrooms,
          facades: m.listing.facades,
          legalStatus: m.listing.legalStatus,
          offerTitle: m.listing.offerTitle,
          location, // seller can see own location
        },
      };
    }),
  );

  return NextResponse.json({ matches: out });
}

// NOTE: This route is GET-only. To create a real listing, use:
//     POST /api/seller/listings           (production-grade)
// To bootstrap the demo (assign a seed listing to the current user), use:
//     POST /api/seller/demo-activate      (demo-only, explicit)

