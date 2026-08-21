import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJSON } from "@/lib/crypto";
import { getOrCreateSession } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  GET /api/seller/listings/[id]/secret
//
//  Returns the seller's OWN secret minimum price (decrypted) + precise
//  GPS location (decrypted). This is the ONLY endpoint that decrypts
//  secretMinPrice for a user. It is restricted to the listing owner —
//  no other user (buyer or otherwise) can call it. IDOR-protected via
//  ownership check.
//
//  Buyers NEVER have access to this endpoint's response. The buyer-side
//  match flow decrypts secretMinPrice server-side inside stage2Filter
//  and never returns it. GPS coordinates are returned to the buyer
//  ONLY after both parties pay (status=BUYER_FEE_PAID) via the
//  /api/match/[id]/pay-fee and /api/match/[id]/status endpoints.
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getOrCreateSession();

  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) {
    return NextResponse.json({ error: "العقار غير موجود" }, { status: 404 });
  }
  // Strict ownership — only the seller can see their own reserve + geo.
  if (listing.ownerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const decrypted = await decryptJSON<{ secretMinPrice: number }>(listing.secretMinPriceEnc);
  const geoLocation = listing.geoLocationEnc
    ? await decryptJSON<{ lat: number; lng: number; accuracy?: number | null }>(listing.geoLocationEnc)
    : null;
  return NextResponse.json({
    listingId: listing.id,
    secretMinPrice: decrypted?.secretMinPrice ?? null,
    geoLocation, // owner sees their own geo at any time
  });
}
