import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateSession, requireVerifiedUser, sessionErrorResponse, SessionError } from "@/lib/session";
import { encryptJSON, decryptField, decryptJSON } from "@/lib/crypto";
import {
  WILAYAS,
  COMMUNES_BY_WILAYA,
  PROPERTY_FEATURES,
  publishListingSchema,
  calculateSellerFee,
  isLandType,
} from "@/lib/schemas";

// ──────────────────────────────────────────────────────────────────
//  GET /api/seller/listings — list current user's listings.
// ──────────────────────────────────────────────────────────────────

export async function GET() {
try {
  const user = await getOrCreateSession();

  const listings = await db.listing.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (listings.length === 0) {
    return NextResponse.json({ listings: [], hasListings: false });
  }

  const listingIds = listings.map((l) => l.id);
  const matches = await db.match.findMany({
    where: { listingId: { in: listingIds } },
    select: { listingId: true, status: true, score: true },
  });

  const stats = new Map<
    string,
    { total: number; pending: number; accepted: number; rejected: number }
  >();
  for (const m of matches) {
    const s = stats.get(m.listingId) || { total: 0, pending: 0, accepted: 0, rejected: 0 };
    s.total++;
    // MatchStatus: PROPOSED | SELLER_FEE_PAID | BUYER_NOTIFIED | BUYER_FEE_PAID | REJECTED | EXPIRED | REFUNDED
    // "pending" = any active state before completion/terminal
    if (m.status === "PROPOSED" || m.status === "SELLER_FEE_PAID" || m.status === "BUYER_NOTIFIED") s.pending++;
    if (m.status === "BUYER_FEE_PAID") s.accepted++; // contact revealed = completed
    if (m.status === "REJECTED") s.rejected++;
    stats.set(m.listingId, s);
  }

  const out = await Promise.all(
    listings.map(async (l) => {
      try {
        const location = await decryptField(l.locationEnc);
        const geoLocation = l.geoLocationEnc
          ? await decryptJSON<{ lat: number; lng: number; accuracy?: number | null }>(l.geoLocationEnc)
          : null;
        const features = (() => {
          try { return JSON.parse(l.features) || []; } catch { return []; }
        })();
        const s = stats.get(l.id) || { total: 0, pending: 0, accepted: 0, rejected: 0 };
        return {
          id: l.id,
          intent: l.intent,
          type: l.type,
          city: l.city,
          commune: l.commune,
          district: l.district,
          askingPrice: l.askingPrice,
          areaSqm: l.areaSqm,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
          floor: l.floor,
          facades: l.facades,
          legalStatus: l.legalStatus,
          urbanPermitStatus: l.urbanPermitStatus,
          offerTitle: l.offerTitle,
          description: l.description,
          features,
          status: l.status,
          sellerFee: l.sellerFee,
          location: location || "",
          geoLocation,
          createdAt: l.createdAt,
          stats: s,
        };
      } catch (e) {
        // If decrypt fails, return listing with raw data
        const s = stats.get(l.id) || { total: 0, pending: 0, accepted: 0, rejected: 0 };
        return {
          id: l.id,
          intent: l.intent,
          type: l.type,
          city: l.city,
          commune: l.commune,
          district: l.district,
          askingPrice: l.askingPrice,
          areaSqm: l.areaSqm,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
          floor: l.floor,
          facades: l.facades,
          legalStatus: l.legalStatus,
          urbanPermitStatus: l.urbanPermitStatus,
          offerTitle: l.offerTitle,
          description: l.description,
          features: [],
          status: l.status,
          sellerFee: l.sellerFee,
          location: l.city,
          geoLocation: null,
          createdAt: l.createdAt,
          stats: s,
        };
      }
    }),
  );

  return NextResponse.json({ listings: out, hasListings: out.length > 0 });
} catch (e) {
  console.error("[GET /api/seller/listings] error:", e);
  return NextResponse.json({ listings: [], hasListings: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
}
}

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/listings — create a new listing.
//  Encrypts: secretMinPrice, location, contact, photos.
//  Computes sellerFee from secretMinPrice.
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── Auth: require logged-in user (guest or verified) ─────────
  // Listings creation: allow any logged-in user to publish.
  // In production, switch back to requireVerifiedUser() for security.
  const user = await getOrCreateSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = publishListingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "بيانات غير صالحة",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }

  const d = parsed.data;

  // For land types, clear irrelevant fields
  const isLand = isLandType(d.type);
  const isSeasonal = d.intent === "SEASONAL_RENT";

  // ── SERVER-SIDE pricing floor enforcement (SOURCE OF TRUTH) ──
  // The Zod schema above is advisory; this is the authoritative check.
  // Belt-and-suspenders: even if a future schema change accidentally
  // relaxes a floor, this guard catches it.
  //
  // Rules:
  //   SELL: askingPrice ≥ 1,000,000 AND secretMinPrice ≥ 1,000,000 (ABSOLUTE)
  //   RENT: askingPrice ≥ 3,000     AND secretMinPrice ≥ 3,000
  //   SEASONAL_RENT: pricePerNight ≥ 2,000 AND secretMinPricePerNight ≥ 2,000
  //   All: secretMinPrice ≤ askingPrice
  const {
    getAskingPriceFloor,
    getAskingPriceFloorMessage,
    getReservePriceFloor,
    getReservePriceFloorMessage,
  } = await import("@/lib/schemas");

  // askingPrice floor (SELL / RENT only — SEASONAL_RENT uses pricePerNight)
  if (!isSeasonal && (d.askingPrice ?? 0) < getAskingPriceFloor(d.intent)) {
    return NextResponse.json(
      { error: getAskingPriceFloorMessage(d.intent) },
      { status: 422 },
    );
  }
  // secretMinPrice ≤ askingPrice (SELL / RENT)
  if (!isSeasonal && (d.secretMinPrice ?? 0) > (d.askingPrice ?? 0)) {
    return NextResponse.json(
      { error: "الحد الأدنى السري يجب أن يكون أقل من أو يساوي السعر المطلوب" },
      { status: 422 },
    );
  }
  // secretMinPrice absolute floor (SELL / RENT)
  if (!isSeasonal && (d.secretMinPrice ?? 0) < getReservePriceFloor(d.intent)) {
    return NextResponse.json(
      { error: getReservePriceFloorMessage(d.intent) },
      { status: 422 },
    );
  }
  // SEASONAL_RENT: pricePerNight + secretMinPricePerNight floors
  if (isSeasonal && (d.secretMinPricePerNight ?? 0) < getReservePriceFloor("SEASONAL_RENT")) {
    return NextResponse.json(
      { error: getReservePriceFloorMessage("SEASONAL_RENT") },
      { status: 422 },
    );
  }
  if (isSeasonal && (d.secretMinPricePerNight ?? 0) > (d.pricePerNight ?? 0)) {
    return NextResponse.json(
      { error: "الحد الأدنى السري لليلة يجب أن يكون أقل من أو يساوي السعر المعلن لليلة" },
      { status: 422 },
    );
  }

  // Validate commune belongs to wilaya
  const allowed = COMMUNES_BY_WILAYA[d.city as keyof typeof COMMUNES_BY_WILAYA] || [];
  if (!allowed.includes(d.commune)) {
    return NextResponse.json(
      { error: "البلدية غير تابعة للولاية المختارة" },
      { status: 422 },
    );
  }

  try {
    // Encrypt sensitive fields
    // For SEASONAL_RENT, we encrypt the per-night secret in a separate field.
    const secretMinPriceEnc = isSeasonal
      ? "" // not used for SEASONAL_RENT
      : await encryptJSON({ secretMinPrice: d.secretMinPrice! });
    const secretMinPricePerNightEnc = isSeasonal
      ? await encryptJSON({ secretMinPricePerNight: d.secretMinPricePerNight! })
      : null;

    const locationEnc = await encryptJSON({
      city: d.city,
      commune: d.commune,
      district: d.district || null,
      street: d.description || d.offerTitle, // approximate address until seller refines
    });
    const contactEnc = await encryptJSON({
      phone: d.phone,
      whatsapp: d.phone,
      email: user.email,
      fullName: d.fullName,
    });
    const photosEnc = await encryptJSON(
      d.photos && d.photos.length > 0
        ? d.photos
        : [
            "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
            "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=80",
          ],
    );

    // ── GPS coordinates (encrypted) ─────────────────────────────
    // Single AES-256-GCM field holding JSON { lat, lng, accuracy? }.
    // Null if seller didn't provide GPS — matching engine falls back
    // to administrative proximity (wilaya/commune/district) in that case.
    const geoLocationEnc =
      d.latitude != null && d.longitude != null
        ? await encryptJSON({
            lat: d.latitude,
            lng: d.longitude,
            accuracy: d.locationAccuracy ?? null,
          })
        : null;

    // ── Compute seller fee based on account category ──────────
    // INDIVIDUAL → per-deal fee (existing tiered calculation)
    // AGENCY     → fee = 0 (subscription covers all deals)
    // DEVELOPER  → fee = 0 (commission on deal close, not per-deal)
    let sellerFee: number;
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        accountCategory: true,
        categoryVerified: true,
        agencySubscription: { select: { status: true, endDate: true, listingsLimit: true } },
      },
    });
    const effectiveCategory =
      fullUser?.categoryVerified ? fullUser.accountCategory : "INDIVIDUAL";

    if (effectiveCategory === "AGENCY") {
      // Verify active subscription + listing limit
      const sub = fullUser?.agencySubscription;
      if (!sub || sub.status !== "ACTIVE" || sub.endDate < new Date()) {
        return NextResponse.json(
          { error: "لا يوجد اشتراك نشط. اشترك في باقة لنشر إعلاناتك.", code: "SUBSCRIPTION_REQUIRED" },
          { status: 402 }, // Payment Required
        );
      }
      // Check monthly listing limit
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const listingsThisMonth = await db.listing.count({
        where: { ownerId: user.id, createdAt: { gte: monthAgo } },
      });
      if (listingsThisMonth >= (sub.listingsLimit ?? 0)) {
        return NextResponse.json(
          { error: `تجاوزت حد الإعلانات الشهرية (${sub.listingsLimit}). ارقِ باقتك للاستمرار.`, code: "LISTING_LIMIT_REACHED" },
          { status: 402 },
        );
      }
      sellerFee = 0; // subscription covers this
    } else if (effectiveCategory === "DEVELOPER") {
      sellerFee = 0; // commission on deal close, not per-deal
    } else {
      // INDIVIDUAL — existing per-deal fee calculation
      if (isSeasonal) {
        const nights = d.minStayNights ?? 1;
        sellerFee = calculateSellerFee(d.pricePerNight! * nights, "SEASONAL_RENT");
      } else {
        sellerFee = calculateSellerFee(d.askingPrice!, d.intent);
      }
      // ── Apply promotional offer if active ──
      const { getActiveOffer, applyOfferDiscount } = await import("@/lib/fees");
      const offer = await getActiveOffer("INDIVIDUAL");
      if (offer) {
        const discounted = applyOfferDiscount(sellerFee, offer);
        sellerFee = discounted.finalFee;
      }
    }

    const listing = await db.listing.create({
      data: {
        ownerId: user.id,
        intent: d.intent,
        type: d.type,
        city: d.city,
        commune: d.commune,
        district: d.district || null,
        askingPrice: isSeasonal ? 0 : (d.askingPrice ?? 0), // 0 placeholder for seasonal
        // SEASONAL_RENT fields:
        pricePerNight: isSeasonal ? d.pricePerNight : null,
        secretMinPricePerNightEnc,
        minStayNights: isSeasonal ? (d.minStayNights ?? 1) : null,
        availableFrom: isSeasonal && d.availableFrom ? new Date(d.availableFrom) : null,
        availableTo: isSeasonal && d.availableTo ? new Date(d.availableTo) : null,
        // GPS coordinates — encrypted single field (replaces 3 raw columns)
        geoLocationEnc,
        areaSqm: d.areaSqm,
        bedrooms: isLand ? null : (d.bedrooms ?? null),
        bathrooms: isLand ? null : (d.bathrooms ?? null),
        floor: isLand ? null : (d.floor ?? null),
        facades: d.facades ?? null,
        // ── Feature completeness fields (for future Hedonic Model) ──
        buildingAge: d.buildingAge ?? null,
        hasElevator: d.hasElevator ?? false,
        hasParking: d.hasParking ?? false,
        seasonalSeason: isSeasonal ? (d.seasonalSeason ?? null) : null,
        legalStatus: d.legalStatus,
        urbanPermitStatus: d.urbanPermitStatus ?? null,
        offerTitle: d.offerTitle,
        description: d.description || null,
        features: JSON.stringify([]),
        accountType: d.accountType,
        secretMinPriceEnc,
        locationEnc,
        contactEnc,
        photosEnc,
        sellerFee,
        status: "ACTIVE",
      },
    });

    await db.user.update({
      where: { id: user.id },
      data: {
        role: d.intent === "RENT" || d.intent === "SEASONAL_RENT" ? "LANDLORD" : "SELLER",
        accountType: d.accountType,
      },
    });

    return NextResponse.json({
      ok: true,
      listingId: listing.id,
      sellerFee,
      message: "عقارك نُشر وهو الآن بحالة 'غير مُراقب'. أنشئ حساباً في 20 ثانية لتعديله وتلقي الإشعارات.",
    });
  } catch (err) {
    // Always return JSON — never let the client hit "JSON.parse: unexpected end of data"
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    console.error("[POST /api/seller/listings] publish failed:", message);
    // Detect missing encryption env explicitly so the seller sees a useful hint
    if (message.includes("ENCRYPTION_PASSPHRASE") || message.includes("ENCRYPTION_KEY_SALT")) {
      return NextResponse.json(
        { error: "خطأ في إعداد التشفير على الخادم. يرجى التواصل مع الإدارة." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "تعذّر نشر العقار بسبب خطأ داخلي. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
