import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptJSON, decryptJSON } from "@/lib/crypto";
import { requireVerifiedUser, sessionErrorResponse, SessionError } from "@/lib/session";
import {
  matchStage1Schema,
  matchStage2Schema,
  calculateBuyerFee,
} from "@/lib/schemas";
import {
  stage1HasMatch,
  stage2Filter,
  rankListings,
  type RankedMatch,
} from "@/lib/matching-engine";
import type { Listing } from "@prisma/client";
import crypto from "crypto";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match — two-stage matching.
//
//  Stage 1: { stage: 1, intent, type, city, commune?, district? }
//    • Hard-filter existence check (no budget, no score).
//    • If matches exist → returns { stage1HasMatches: true }.
//    • If no matches → saves the request as OPEN (for future alerts)
//      and returns { stage1HasMatches: false }.
//    • The OPEN request is preserved so that when a new listing is
//      published matching these criteria, a future cron can match it
//      and notify the buyer. (Notification mechanism not built yet.)
//
//  Stage 2: { stage: 2, ...stage1 + maxBudget, fullName, phone }
//    • Decrypts each candidate listing's secretMinPriceEnc internally.
//    • Filters by: stage-1 criteria + (maxBudget ≥ secretMinPrice).
//    • Scores by askingPrice ONLY (see matching-engine.ts).
//    • Creates a MatchQueue entry for EVERY match, sorted by score DESC.
//    • Promotes rank=1 to an active Match (status=PROPOSED, seller
//      notified, awaiting seller fee payment).
//    • Returns the blind card for the rank=1 match.
//
//  Rate limit: 3 stage-2 searches with same criteria per 24h per user.
//
//  SECURITY: secretMinPriceEnc is decrypted ONLY inside stage2Filter.
//  It is NEVER included in the response. The response contains only
//  askingPrice (public) and the score (computed from askingPrice).
// ──────────────────────────────────────────────────────────────────

const RATE_LIMIT_HOURS = 24;
const RATE_LIMIT_MAX = 3;
const SELLER_DEADLINE_HOURS = 48;

export async function POST(req: Request) {
  // ── Auth: require verified phone (no guests) ───────────────
  // Matching is a sensitive action — guests must OTP-verify first.
  // This prevents spam match requests and protects sellers from
  // unverified buyers harvesting contact data.
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  // ════════════ STAGE 1: existence check ════════════
  if (body?.stage === 1) {
    const parsed = matchStage1Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 422 },
      );
    }
    const input = parsed.data;

    const candidates = await db.listing.findMany({
      where: {
        status: { in: ["ACTIVE", "UNMODERATED"] },
        intent: input.intent,
        type: input.type,
        city: input.city,
      },
      select: { intent: true, type: true, city: true, commune: true },
    });

    const hasMatch = stage1HasMatch(
      { intent: input.intent, type: input.type, city: input.city, commune: input.commune || null },
      candidates,
    );

    if (!hasMatch) {
      // Save the request as OPEN so a future cron can match new listings to it.
      const criteriaHash = crypto
        .createHash("sha256")
        .update(`${input.intent}|${input.type}|${input.city}|${input.commune || ""}`)
        .digest("hex");
      await db.matchRequest.create({
        data: {
          userId: user.id,
          intent: input.intent,
          type: input.type,
          city: input.city,
          commune: input.commune || null,
          district: input.district || null,
          criteriaHash,
          status: "OPEN",
        },
      });
    }

    return NextResponse.json({ stage1HasMatches: hasMatch });
  }

  // ════════════ STAGE 2: full match ════════════
  if (body?.stage === 2) {
    const parsed = matchStage2Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 422 },
      );
    }
    const input = parsed.data;

    // ── Rate limit ──────────────────────────────────────────────
    const criteriaHash = crypto
      .createHash("sha256")
      .update(`${input.intent}|${input.type}|${input.city}|${input.commune || ""}|${input.district || ""}`)
      .digest("hex");
    const since = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000);
    // Only count stage-2 searches (FULFILLED), not stage-1 existence checks (OPEN)
    const recentCount = await db.matchRequest.count({
      where: { userId: user.id, criteriaHash, status: "FULFILLED", createdAt: { gte: since } },
    });
    if (recentCount >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "تم تجاوز الحد الأقصى للبحث (3 محاولات خلال 24 ساعة). حاول غداً أو عدّل المعايير.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }

    // ── Fetch candidates (with encrypted secretMinPrice) ────────
    // EXCLUDE listings owned by the current user — a buyer/tenant
    // cannot match their own property (prevents self-dealing).
    const rawListings = await db.listing.findMany({
      where: {
        status: { in: ["ACTIVE", "UNMODERATED"] },
        intent: input.intent,
        type: input.type,
        city: input.city,
        ownerId: { not: user.id }, // ← prevent self-matching
      },
      take: 200,
    });

    // ── Decrypt secretMinPrice + geoLocation for filtering/scoring ONLY ─
    // This is the ONLY place these fields are decrypted in this route.
    // The decrypted values stay local to this scope and are NEVER sent
    // in the response — same confidentiality rule as secretMinPrice.
    const listingsWithSecret: Array<Listing & {
      _decryptedSecretMinPrice: number;
      _decryptedLat: number | null;
      _decryptedLng: number | null;
    }> = [];
    for (const l of rawListings) {
      try {
        // Decrypt secret price (per-intent field)
        let secretPrice: number | null = null;
        if (input.intent === "SEASONAL_RENT") {
          const d = await decryptJSON<{ secretMinPricePerNight: number }>(l.secretMinPricePerNightEnc || "");
          if (d && typeof d.secretMinPricePerNight === "number") secretPrice = d.secretMinPricePerNight;
        } else {
          const d = await decryptJSON<{ secretMinPrice: number }>(l.secretMinPriceEnc);
          if (d && typeof d.secretMinPrice === "number") secretPrice = d.secretMinPrice;
        }
        if (secretPrice === null) continue;

        // Decrypt geoLocation (optional — falls back to admin proximity)
        let decLat: number | null = null;
        let decLng: number | null = null;
        if (l.geoLocationEnc) {
          try {
            const geo = await decryptJSON<{ lat: number; lng: number }>(l.geoLocationEnc);
            if (geo && typeof geo.lat === "number" && typeof geo.lng === "number") {
              decLat = geo.lat;
              decLng = geo.lng;
            }
          } catch {
            // Skip malformed geo — admin fallback still works
          }
        }

        listingsWithSecret.push({
          ...l,
          _decryptedSecretMinPrice: secretPrice,
          _decryptedLat: decLat,
          _decryptedLng: decLng,
        });
      } catch {
        // Skip listings whose secret can't be decrypted (shouldn't happen)
      }
    }

    // ── Stage 2 filter: budget ≥ secretMinPrice (+ dates for SEASONAL) ─
    const filtered = stage2Filter(
      {
        intent: input.intent,
        type: input.type,
        city: input.city,
        commune: input.commune || null,
        budgetMax: input.maxBudget,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      },
      listingsWithSecret,
    );

    // ── Score by PUBLIC price ONLY (askingPrice or pricePerNight) ──
    const ranked: RankedMatch<Listing>[] = rankListings(
      {
        intent: input.intent,
        type: input.type,
        city: input.city,
        commune: input.commune || null,
        district: input.district || null,
        budgetMax: input.maxBudget,
        bedrooms: 0,
        bathrooms: 0,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        latitude: input.latitude,
        longitude: input.longitude,
        searchRadiusKm: input.searchRadiusKm,
      },
      filtered,
    );

    // ── No matches → save OPEN request and return empty ─────────
    if (ranked.length === 0) {
      await db.matchRequest.create({
        data: {
          userId: user.id,
          intent: input.intent,
          type: input.type,
          city: input.city,
          commune: input.commune || null,
          district: input.district || null,
          maxBudgetEnc: await encryptJSON({ maxBudget: input.maxBudget }),
          fullNameEnc: await encryptJSON({ fullName: input.fullName }),
          phoneEnc: await encryptJSON({ phone: input.phone }),
          criteriaHash,
          status: "OPEN",
        },
      });
      return NextResponse.json({ matches: [], stage1HasMatches: false });
    }

    // ── Persist the request ─────────────────────────────────────
    const matchRequest = await db.matchRequest.create({
      data: {
        userId: user.id,
        intent: input.intent,
        type: input.type,
        city: input.city,
        commune: input.commune || null,
        district: input.district || null,
        maxBudgetEnc: await encryptJSON({ maxBudget: input.maxBudget }),
        fullNameEnc: await encryptJSON({ fullName: input.fullName }),
        phoneEnc: await encryptJSON({ phone: input.phone }),
        criteriaHash,
        status: "FULFILLED",
      },
    });

    // ── Create MatchQueue entries (waterfall queue) ─────────────
    // Every match gets a queue entry, sorted by rank (1 = highest score).
    // Only rank=1 is promoted to an active Match initially.
    const queueEntries = await Promise.all(
      ranked.map(async (m, i) => {
        const rank = i + 1;
        return db.matchQueue.create({
          data: {
            requestId: matchRequest.id,
            listingId: m.listing.id,
            score: m.breakdown.total,
            rank,
            status: rank === 1 ? "ACTIVE" : "PENDING",
          },
        });
      }),
    );

    // ── Promote rank=1 to active Match ──────────────────────────
    const topMatch = ranked[0];
    const topQueue = queueEntries[0];
    // For SEASONAL_RENT, buyer fee is based on (pricePerNight × nights).
    // The buyer's stay length is derived from checkIn/checkOut.
    let feeBase = topMatch.listing.askingPrice;
    if (input.intent === "SEASONAL_RENT" && input.checkIn && input.checkOut) {
      const nights = Math.ceil(
        (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / (1000 * 60 * 60 * 24),
      );
      feeBase = (topMatch.listing.pricePerNight ?? 0) * Math.max(1, nights);
    }
    const buyerFee = calculateBuyerFee(feeBase, input.intent);
    const sellerFee = topMatch.listing.sellerFee;
    const now = new Date();
    const sellerDeadline = new Date(now.getTime() + SELLER_DEADLINE_HOURS * 60 * 60 * 1000);

    const activeMatch = await db.match.create({
      data: {
        requestId: matchRequest.id,
        listingId: topMatch.listing.id,
        buyerId: user.id,
        sellerId: topMatch.listing.ownerId,
        score: topMatch.breakdown.total,
        queueRank: 1,
        buyerFee,
        sellerFee,
        status: "PROPOSED",
        sellerDeadline,
      },
    });

    await db.matchQueue.update({
      where: { id: topQueue.id },
      data: { matchId: activeMatch.id },
    });

    // ── Build blind response ────────────────────────────────────
    // SECURITY: only PUBLIC prices are returned (askingPrice for SELL/RENT,
    // pricePerNight for SEASONAL_RENT). secretMinPrice / secretMinPricePerNight
    // are NEVER included. The score is computed from the public price only.
    //
    // COVER PHOTO: We decrypt ONLY the first photo from photosEnc and
    // return it as `coverPhoto`. This gives the buyer a visual of the
    // property exterior to build excitement before paying the fee.
    // The full gallery + contact + exact address remain encrypted
    // until both parties pay and consent.
    let coverPhoto: string | null = null;
    try {
      const photos = await decryptJSON<string[]>(topMatch.listing.photosEnc);
      if (photos && photos.length > 0) {
        coverPhoto = photos[0]; // first photo = exterior/cover
      }
    } catch {}

    const blindMatch = {
      matchId: activeMatch.id,
      score: topMatch.breakdown.total,
      intent: topMatch.listing.intent,
      type: topMatch.listing.type,
      city: topMatch.listing.city,
      commune: topMatch.listing.commune,
      district: topMatch.listing.district,
      askingPrice: topMatch.listing.askingPrice, // PUBLIC for SELL/RENT
      // SEASONAL_RENT public fields:
      pricePerNight: topMatch.listing.pricePerNight, // PUBLIC per-night price
      minStayNights: topMatch.listing.minStayNights,
      availableFrom: topMatch.listing.availableFrom, // shown to buyer (approx range)
      availableTo: topMatch.listing.availableTo,
      areaSqm: topMatch.listing.areaSqm,
      bedrooms: topMatch.listing.bedrooms,
      bathrooms: topMatch.listing.bathrooms,
      facades: topMatch.listing.facades,
      legalStatus: topMatch.listing.legalStatus,
      // عقود التعمير — public, non-sensitive (regulatory info only)
      urbanPermitStatus: topMatch.listing.urbanPermitStatus,
      offerTitle: topMatch.listing.offerTitle,
      coverPhoto, // PUBLIC — one exterior photo to entice the buyer
      buyerFee,
      sellerFee, // shown to buyer so they understand the structure
      queueSize: ranked.length,
      queueRank: 1,
      sellerDeadline,
      addressRevealed: false,
      contactRevealed: false,
      photosRevealed: false, // full gallery still locked
      // ── Qualitative proximity label (NEW) ──────────────────────
      // SECURITY: only a qualitative bucket is exposed ("very close" /
      // "close" / "moderate") — NEVER the raw distance in meters/km.
      // This prevents gradual triangulation attacks where a buyer
      // could query multiple reference points to narrow down the
      // seller's exact location.
      // null when the buyer didn't use the map picker (no GPS reference).
      geoProximityLabel: topMatch.breakdown.geoProximityDetail || null,
      // ⚠️ secretMinPrice AND secretMinPricePerNight are intentionally
      // NEVER included here. They are consumed only inside stage2Filter()
      // above and never leave the server.
      // ⚠️ Raw lat/lng of the listing are NEVER included — only the
      // qualitative label above.
    };

    return NextResponse.json({
      requestRef: matchRequest.id,
      matches: [blindMatch],
    });
  }

  return NextResponse.json({ error: "stage مطلوب (1 أو 2)" }, { status: 422 });
}
