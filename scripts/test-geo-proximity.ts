// ──────────────────────────────────────────────────────────────────
//  Geo Proximity Test — direct DB + matching-engine test.
//
//  This script does NOT go through the HTTP API (which requires OTP
//  auth + would consume rate-limit quota). Instead it:
//    1. Decrypts geoLocationEnc of existing listings directly.
//    2. Calls scoreMatch() with TWO different buyer reference points:
//       a. Very close (within 500m of the listing)
//       b. Far (more than 5km from the listing)
//    3. Prints both scores side-by-side to prove geoProximity works.
//
//  Also validates: the scoreMatch() return value does NOT contain
//  raw lat/lng or raw distance — only the qualitative label.
// ──────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { decryptJSON } from "../src/lib/crypto";
import { scoreMatch } from "../src/lib/matching-engine";
const db = new (PrismaClient as any)();

async function main() {
  // Find a listing that has GPS coordinates
  const listings = await db.listing.findMany({
    where: {
      status: { in: ["ACTIVE", "UNMODERATED"] },
      NOT: { geoLocationEnc: null },
      intent: "SELL",
    },
    take: 5,
    select: {
      id: true,
      intent: true,
      type: true,
      city: true,
      commune: true,
      district: true,
      askingPrice: true,
      areaSqm: true,
      bedrooms: true,
      bathrooms: true,
      legalStatus: true,
      secretMinPriceEnc: true,
      geoLocationEnc: true,
    },
  });

  if (listings.length === 0) {
    console.log("No listings with GPS found. Inserting one...");
    // Insert a listing with GPS via direct DB call
    return;
  }

  console.log(`Found ${listings.length} listings with GPS.`);
  console.log("");

  // Decrypt secret + geo for the first listing
  const listing = listings[0];

  const secret = await decryptJSON<{ secretMinPrice: number }>(listing.secretMinPriceEnc);
  const geo = await decryptJSON<{ lat: number; lng: number }>(listing.geoLocationEnc);

  if (!secret || !geo) {
    console.log("Failed to decrypt listing data.");
    return;
  }

  console.log(`Listing: ${listing.type} in ${listing.city}/${listing.commune}`);
  console.log(`  Asking: ${listing.askingPrice.toLocaleString()} DZD`);
  console.log(`  Secret min: ${secret.secretMinPrice.toLocaleString()} DZD`);
  console.log(`  GPS: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`);
  console.log("");

  // Build the listing object for scoreMatch
  const listingForScoring = {
    ...listing,
    _decryptedLat: geo.lat,
    _decryptedLng: geo.lng,
  };

  // ── Test A: buyer VERY CLOSE (within 500m) ──
  // Offset ~0.004 degrees ≈ ~400m (at Algeria's latitude)
  const buyerCloseLat = geo.lat + 0.004;
  const buyerCloseLng = geo.lng + 0.002;

  const resultClose = scoreMatch(
    {
      intent: listing.intent,
      type: listing.type,
      city: listing.city,
      commune: listing.commune,
      district: null,
      budgetMax: listing.askingPrice, // buyer budget = asking price → full price match
      bedrooms: listing.bedrooms ?? 0,
      bathrooms: listing.bathrooms ?? 0,
      latitude: buyerCloseLat,
      longitude: buyerCloseLng,
    },
    listingForScoring,
    secret.secretMinPrice,
  );

  // ── Test B: buyer FAR (more than 5km) ──
  // Offset ~0.1 degrees ≈ ~11km
  const buyerFarLat = geo.lat + 0.1;
  const buyerFarLng = geo.lng + 0.05;

  const resultFar = scoreMatch(
    {
      intent: listing.intent,
      type: listing.type,
      city: listing.city,
      commune: listing.commune,
      district: null,
      budgetMax: listing.askingPrice,
      bedrooms: listing.bedrooms ?? 0,
      bathrooms: listing.bathrooms ?? 0,
      latitude: buyerFarLat,
      longitude: buyerFarLng,
    },
    listingForScoring,
    secret.secretMinPrice,
  );

  // ── Test C: buyer with NO GPS (manual entry only) ──
  const resultNoGps = scoreMatch(
    {
      intent: listing.intent,
      type: listing.type,
      city: listing.city,
      commune: listing.commune,
      district: null,
      budgetMax: listing.askingPrice,
      bedrooms: listing.bedrooms ?? 0,
      bathrooms: listing.bathrooms ?? 0,
      latitude: null,
      longitude: null,
    },
    listingForScoring,
    secret.secretMinPrice,
  );

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  GEO PROXIMITY TEST — score comparison");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Scenario A: buyer VERY CLOSE (~400m from listing)");
  console.log(`  Total score:  ${resultClose.total}`);
  console.log(`  Price:        ${resultClose.price} / 35`);
  console.log(`  Location:     ${resultClose.location} / 25 (admin)`);
  console.log(`  GeoProximity: ${resultClose.geoProximity} / 15  ← ${resultClose.geoProximityDetail}`);
  console.log(`  Features:     ${resultClose.features} / 25`);
  console.log("");
  console.log("Scenario B: buyer FAR (~11km from listing)");
  console.log(`  Total score:  ${resultFar.total}`);
  console.log(`  Price:        ${resultFar.price} / 35`);
  console.log(`  Location:     ${resultFar.location} / 25 (admin)`);
  console.log(`  GeoProximity: ${resultFar.geoProximity} / 15  ← ${resultFar.geoProximityDetail}`);
  console.log(`  Features:     ${resultFar.features} / 25`);
  console.log("");
  console.log("Scenario C: buyer with NO GPS (manual entry only)");
  console.log(`  Total score:  ${resultNoGps.total}`);
  console.log(`  Price:        ${resultNoGps.price} / 35`);
  console.log(`  Location:     ${resultNoGps.location} / 25 (admin)`);
  console.log(`  GeoProximity: ${resultNoGps.geoProximity} / 15  ← ${resultNoGps.geoProximityDetail}`);
  console.log(`  Features:     ${resultNoGps.features} / 25`);
  console.log("");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  SECURITY VERIFICATION");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("");
  const responseShape = JSON.stringify(resultClose);
  const hasRawLat = /"lat"/.test(responseShape) || /"latitude"/.test(responseShape);
  const hasRawLng = /"lng"/.test(responseShape) || /"longitude"/.test(responseShape);
  const hasRawDistance = /\d+(\.\d+)?\s*(متر|كم|m|km)/.test(responseShape);

  console.log(`Contains raw lat field?     ${hasRawLat ? "✗ LEAK!" : "✓ NO"}`);
  console.log(`Contains raw lng field?     ${hasRawLng ? "✗ LEAK!" : "✓ NO"}`);
  console.log(`Contains raw distance?      ${hasRawDistance ? "✗ LEAK!" : "✓ NO"}`);
  console.log("");
  console.log("Full response shape (no secrets, no coords):");
  console.log(JSON.stringify(resultClose, null, 2));

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
