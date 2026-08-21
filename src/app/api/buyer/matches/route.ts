import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { decryptField, decryptJSON } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────
//  GET /api/buyer/matches
//
//  Returns all matches where the current session user is the BUYER.
//  Used by the Buyer Dashboard to show ongoing negotiations, fee
//  payment status, and revealed contact info.
//
//  IDOR protection: filter by buyerId = session.user.id
//  SECURITY:
//    • Never returns secretMinPrice / secretMinPricePerNight.
//    • Contact / location / geoLocation / photos are decrypted ONLY
//      for matches in status BUYER_FEE_PAID (both parties paid).
//    • In all other states, only public listing fields are returned
//      (askingPrice, type, city, areaSqm, legalStatus, etc.).
// ──────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getOrCreateSession();

  const matches = await db.match.findMany({
    where: { buyerId: user.id },
    include: { listing: true, negotiation: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const out = await Promise.all(
    matches.map(async (m) => {
      const isRevealed = m.status === "BUYER_FEE_PAID";

      // Public listing fields (always visible to buyer)
      const listing: Record<string, unknown> = {
        id: m.listing.id,
        intent: m.listing.intent,
        type: m.listing.type,
        city: m.listing.city,
        commune: m.listing.commune,
        district: m.listing.district,
        askingPrice: m.listing.askingPrice,
        pricePerNight: m.listing.pricePerNight,
        areaSqm: m.listing.areaSqm,
        bedrooms: m.listing.bedrooms,
        bathrooms: m.listing.bathrooms,
        floor: m.listing.floor,
        facades: m.listing.facades,
        legalStatus: m.listing.legalStatus,
        urbanPermitStatus: m.listing.urbanPermitStatus,
        offerTitle: m.listing.offerTitle,
        minStayNights: m.listing.minStayNights,
        availableFrom: m.listing.availableFrom,
        availableTo: m.listing.availableTo,
      };

      // Decrypted fields — ONLY when status = BUYER_FEE_PAID
      if (isRevealed) {
        const contact = await decryptField(m.listing.contactEnc);
        const location = await decryptField(m.listing.locationEnc);
        const photos = await decryptJSON<string[]>(m.listing.photosEnc);
        const geoLocation = m.listing.geoLocationEnc
          ? await decryptJSON<{ lat: number; lng: number; accuracy?: number | null }>(m.listing.geoLocationEnc)
          : null;
        listing.contact = contact;
        listing.location = location;
        listing.photos = photos || [];
        listing.geoLocation = geoLocation;
      }

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
        buyerFee: m.buyerFee,
        sellerFee: m.sellerFee,
        createdAt: m.createdAt,
        // Negotiation info
        rounds: m.negotiation?.rounds ?? 0,
        buyerOffer: m.negotiation?.buyerOffer ?? null,
        sellerOffer: m.negotiation?.sellerOffer ?? null,
        buyerTurn: m.negotiation?.buyerTurn ?? true,
        revealed: isRevealed,
        listing,
        // ⚠️ secretMinPrice / secretMinPricePerNight are NEVER returned.
      };
    }),
  );

  return NextResponse.json({ matches: out });
}
