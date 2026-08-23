// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Map Search API
//
//  GET /api/listings/map?lat=...&lng=...&radius=1000&intent=SELL&type=APARTMENT
//
//  Returns active listings with:
//    • Decrypted GPS coordinates (for map marker placement)
//    • Public listing data (askingPrice, type, city, etc.)
//    • Distance from search center (in meters, only when lat/lng provided)
//
//  Security:
//    • Only ACTIVE listings with geoLocationEnc are returned
//    • secretMinPrice is NEVER returned
//    • Contact info is NEVER returned
//    • GPS coordinates are decrypted server-side for map display
// ──────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJSON } from "@/lib/crypto";

// ══════════════════════════════════════════════════════════════════
//  Haversine distance (meters)
// ══════════════════════════════════════════════════════════════════

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ══════════════════════════════════════════════════════════════════
//  GET — Fetch listings for map display
// ══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Optional filters
  const intent = searchParams.get("intent") as "SELL" | "RENT" | "SEASONAL_RENT" | null;
  const type = searchParams.get("type") as string | null;
  const city = searchParams.get("city") as string | null;
  const commune = searchParams.get("commune") as string | null;

  // Search center + radius (meters)
  const lat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : null;
  const lng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : null;
  const radiusMeters = searchParams.get("radius") ? parseFloat(searchParams.get("radius")!) : null;

  // Budget filter
  const maxBudget = searchParams.get("maxBudget") ? parseInt(searchParams.get("maxBudget")!) : null;

  // Pagination
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    // Build Prisma where clause
    const where: any = {
      status: { in: ["ACTIVE", "UNMODERATED"] },
      geoLocationEnc: { not: null },
    };

    if (intent) where.intent = intent;
    if (type) where.type = type;
    if (city) where.city = city;
    if (commune) where.commune = commune;
    if (maxBudget) {
      where.askingPrice = { lte: maxBudget };
    }

    // Fetch listings (we'll filter by distance after decryption)
    // Fetch more than limit to account for distance filtering
    const fetchLimit = radiusMeters ? Math.min(limit * 3, 200) : limit;
    const listings = await db.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      skip: radiusMeters ? 0 : offset, // offset only when not filtering by distance
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
        floor: true,
        facades: true,
        legalStatus: true,
        urbanPermitStatus: true,
        offerTitle: true,
        description: true,
        sellerFee: true,
        geoLocationEnc: true,
        createdAt: true,
        pricePerNight: true,
        minStayNights: true,
        availableFrom: true,
        availableTo: true,
      },
    });

    // Decrypt GPS and compute distances
    const results: any[] = [];

    for (const listing of listings) {
      if (!listing.geoLocationEnc) continue;

      try {
        const geo = await decryptJSON<{ lat: number; lng: number; accuracy?: number | null }>(
          listing.geoLocationEnc,
        );

        if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") continue;

        let distanceMeters: number | null = null;

        // Apply radius filter if center is provided
        if (lat !== null && lng !== null) {
          distanceMeters = haversineDistance(lat, lng, geo.lat, geo.lng);

          // Skip if outside radius
          if (radiusMeters !== null && distanceMeters > radiusMeters) {
            continue;
          }
        }

        // Format price display
        const isSeasonal = listing.intent === "SEASONAL_RENT";
        const displayPrice = isSeasonal
          ? listing.pricePerNight || listing.askingPrice
          : listing.askingPrice;

        results.push({
          id: listing.id,
          intent: listing.intent,
          type: listing.type,
          city: listing.city,
          commune: listing.commune,
          district: listing.district,
          askingPrice: listing.askingPrice,
          displayPrice,
          pricePerNight: listing.pricePerNight,
          minStayNights: listing.minStayNights,
          availableFrom: listing.availableFrom,
          availableTo: listing.availableTo,
          areaSqm: listing.areaSqm,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          floor: listing.floor,
          facades: listing.facades,
          legalStatus: listing.legalStatus,
          urbanPermitStatus: listing.urbanPermitStatus,
          offerTitle: listing.offerTitle,
          description: listing.description,
          sellerFee: listing.sellerFee,
          createdAt: listing.createdAt,
          // GPS for map marker (decrypted, rounded to 6 decimals ~0.1m)
          lat: Number(geo.lat.toFixed(6)),
          lng: Number(geo.lng.toFixed(6)),
          // Distance from search center (meters, null if no center provided)
          distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
        });
      } catch {
        // Decryption failed — skip this listing
        continue;
      }
    }

    // Sort by distance if center provided, otherwise by date
    if (lat !== null && lng !== null) {
      results.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    }

    // Apply limit + offset after distance filtering
    const paged = results.slice(offset, offset + limit);

    return NextResponse.json({
      listings: paged,
      total: results.length,
      hasMore: offset + limit < results.length,
      // Return search center for map centering
      center: lat !== null && lng !== null ? { lat, lng } : null,
      radiusMeters,
    });
  } catch (error) {
    console.error("[GET /api/listings/map] error:", error);
    return NextResponse.json(
      { error: "خطأ في جلب البيانات" },
      { status: 500 },
    );
  }
}
