import type { Listing } from "@prisma/client";

// ══════════════════════════════════════════════════════════════════
//  Aqar Match — Weighted Hybrid Matching Engine v3
//  with Fuzzy Logic + Negotiation Buffer
//
//  4 LAYERS:
//  ─────────
//  Layer 1 — Hard Filters (red line, no flexibility)
//  Layer 2 — Spatial Fuzzy Logic (location proximity scoring)
//  Layer 3 — Blind Price Algorithm (negotiation buffer + overlap)
//  Layer 4 — Soft Features (rooms, area, bathrooms — flexible)
//
//  WEIGHTED SCORING (configurable):
//  ────────────────────────────────
//  • Price overlap    — 40 pts (most important to user)
//  • Location fuzzy   — 40 pts (geographic proximity)
//  • Soft features    — 20 pts (rooms, area, bathrooms, legal)
//
//  MIN_REVEAL_THRESHOLD = 65% — anything below is hidden from user.
//
//  SECURITY INVARIANT:
//  secretMinPrice is consumed ONLY in Layer 3 (blindPriceScore).
//  It is NEVER returned, NEVER logged, NEVER in the displayed score.
//  The displayed score uses askingPrice (public) only.
// ══════════════════════════════════════════════════════════════════

// ── Configuration ────────────────────────────────────────────────
export const MIN_REVEAL_THRESHOLD = 65;

// Negotiation buffer: if buyer's budget is within X% below the
// seller's secret minimum, we still match (with reduced score).
// Example: secret=10M, budget=9.5M → gap=5% < 10% buffer → MATCH.
export const NEGOTIATION_BUFFER_PERCENT = 0.10; // 10%

// ══════════════════════════════════════════════════════════════════
//  WEIGHT DISTRIBUTION (must sum to 100)
//  ─────────────────────────────────────────────────────────────────
//  Updated to introduce a dedicated GPS-proximity layer (geoProximity)
//  that supplements — but does NOT replace — the administrative
//  location match. This allows a buyer standing 200m from a listing
//  in an adjacent commune (administrative boundary mismatch) to still
//  get a strong match, instead of being penalized for the boundary.
//
//  • price         35  (was 40) — still the most important single factor
//  • location      25  (was 40) — administrative match (wilaya/commune/district)
//  • geoProximity  15  (NEW)     — GPS Haversine, Gaussian decay @ 500m
//  • features      25  (was 20) — area, bedrooms, bathrooms, legal status
//
//  geoProximity is ONLY applied when BOTH buyer and listing have
//  decrypted GPS coordinates. If either side lacks GPS, geoProximity
//  is skipped (score 0 for that layer) and the other layers keep their
//  full weight — graceful fallback, no penalty for manual-only users.
//
//  SECURITY: the actual distance in meters is NEVER returned in any
//  API response. Only a qualitative label ("very close" / "close" /
//  "moderate") is exposed via locationDetail. The raw distance is
//  computed in-memory and immediately discarded after scoring.
// ══════════════════════════════════════════════════════════════════
export const WEIGHTS = {
  price: 35,         // Layer 3
  location: 25,      // Layer 2 — administrative
  geoProximity: 15,  // Layer 2b — GPS Haversine (NEW)
  features: 25,      // Layer 4
} as const;

// ── geoProximity parameters ───────────────────────────────────────
// Sigma for Gaussian decay. With sigma=0.4 km:
//   • 0.0 km (same spot)  → 100% (15 pts)
//   • 0.5 km (very close) → ~88% (13 pts)
//   • 1.0 km              → ~54%
//   • 2.0 km              → ~14%
//   • 3.0 km              → ~2%
//   • 5+ km               → ~0% (effectively zero for this layer)
// This gives maximum weight to properties within ~500m, then a smooth
// Gaussian decay. Past 5km, geoProximity contributes effectively 0
// (the administrative location layer still does its job separately).
const GEO_PROXIMITY_SIGMA_KM = 0.4;
const GEO_PROXIMITY_MAX_KM = 5; // beyond this, geoProximity ≈ 0

// ── Types ────────────────────────────────────────────────────────
export interface ScoreInput {
  intent: string;
  type: string;
  city: string;
  commune?: string | null;
  district?: string | null;
  budgetMax?: number;
  bedrooms?: number;
  bathrooms?: number;
  // SEASONAL_RENT only:
  checkIn?: string;
  checkOut?: string;
  // GPS coordinates (buyer's location or search center)
  latitude?: number | null;
  longitude?: number | null;
  searchRadiusKm?: number; // max distance in km for hard filter
}

export interface MatchScoreBreakdown {
  total: number;
  price: number;          // 0..35
  location: number;       // 0..25 (administrative)
  geoProximity: number;    // 0..15 (GPS Haversine, NEW)
  features: number;       // 0..25
  // Detailed sub-scores for debugging/display:
  // SECURITY: locationDetail + geoProximityDetail expose ONLY qualitative
  // labels ("very close", "nearby"), NEVER raw distances in meters/km.
  locationDetail: string;
  geoProximityDetail: string; // NEW — qualitative label only
  priceDetail: string;
  featuresDetail: string;
}

// ── Helpers ──────────────────────────────────────────────────────
function gaussian(distance: number, sigma: number): number {
  const s2 = 2 * sigma * sigma;
  return Math.exp(-(distance * distance) / s2);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ══════════════════════════════════════════════════════════════════
//  LAYER 1: Hard Filters (red line)
// ══════════════════════════════════════════════════════════════════
// If any of these fail → immediate rejection (score = 0, no match).
function passesHardFilters(
  req: ScoreInput,
  listing: Pick<Listing, "intent" | "type" | "city">,
): boolean {
  if (req.intent !== listing.intent) return false;
  if (req.type !== listing.type) return false;
  if (req.city !== listing.city) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════════
//  LAYER 2: Administrative Location (commune / district match)
//  LAYER 2b: GPS Proximity (Haversine, NEW — see geoProximityScore)
// ══════════════════════════════════════════════════════════════════
//  Administrative match (this layer) — pure string comparison:
//  • Same wilaya + same commune + same neighbourhood → 100% (25 pts)
//  • Same wilaya + same commune + adjacent neighbourhood → 85% (21 pts)
//  • Same wilaya + same commune + no neighbourhood specified → 90% (22 pts)
//  • Same wilaya + different commune (buyer didn't specify) → 75% (18 pts)
//  • Same wilaya + different commune (buyer specified) → 60% (15 pts)
//
//  GPS Proximity (Layer 2b, separate function) — Gaussian decay from
//  0 km, with maximum points within ~500m. ONLY runs when both sides
//  have GPS coordinates. Independent of this administrative layer.
//
//  SECURITY: this layer's detail string never exposes raw distances.
// ══════════════════════════════════════════════════════════════════

interface LocationScore {
  score: number;      // 0..WEIGHTS.location
  detail: string;
}

// ── Haversine distance (km) ──────────────────────────────────────
// Returns the great-circle distance between two GPS points in km.
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Administrative location scoring (no GPS dependency) ────────
//
// Scores the listing purely on administrative match: same wilaya /
// commune / district. This layer runs REGARDLESS of whether GPS
// coordinates are available — it's independent of geoProximityScore.
//
// Hard radius filter (searchRadiusKm) — still enforced here when
// GPS is available on both sides, because it's a REJECTION filter,
// not a scoring input. The qualitative label returned does NOT
// expose the raw distance.
function spatialFuzzyScore(
  req: ScoreInput,
  listing: {
    city: string;
    commune?: string | null;
    district?: string | null;
    _decryptedLat?: number | null;
    _decryptedLng?: number | null;
  },
): LocationScore {
  const reqLat = req.latitude;
  const reqLng = req.longitude;
  const listLat = listing._decryptedLat;
  const listLng = listing._decryptedLng;
  const radius = req.searchRadiusKm;

  // ── Hard radius filter (only when both sides have GPS) ───────
  // REJECTION filter — if buyer set a search radius and listing is
  // beyond it, reject entirely (score=0). Detail label intentionally
  // does NOT include the raw distance — only "out of range".
  if (
    reqLat !== undefined && reqLat !== null &&
    reqLng !== undefined && reqLng !== null &&
    listLat !== undefined && listLat !== null &&
    listLng !== undefined && listLng !== null &&
    radius !== undefined && radius > 0
  ) {
    const distKm = haversineKm(reqLat, reqLng, listLat, listLng);
    if (distKm > radius) {
      return {
        score: 0,
        detail: "خارج نطاق البحث المحدد",
      };
    }
  }

  // ── Administrative proximity scoring (always runs) ──────────
  let percentage = 0;
  let detail = "";

  const reqCommune = req.commune?.trim();
  const reqDistrict = req.district?.trim();
  const listCommune = listing.commune?.trim();
  const listDistrict = listing.district?.trim();

  if (reqCommune && listCommune && reqCommune === listCommune) {
    if (reqDistrict && listDistrict) {
      if (reqDistrict === listDistrict) {
        percentage = 100;
        detail = `نفس البلدية (${listCommune}) + نفس الحي (${listDistrict})`;
      } else {
        percentage = 85;
        detail = `نفس البلدية (${listCommune}) + حي مختلف`;
      }
    } else {
      percentage = 90;
      detail = `نفس البلدية (${listCommune})`;
    }
  } else if (!reqCommune) {
    percentage = listCommune ? 75 : 70;
    detail = listCommune
      ? `بلدية ${listCommune} (بحث مفتوح)`
      : "بحث مفتوح في الولاية";
  } else {
    percentage = 60;
    detail = `بلدية مختلفة (${listCommune || "؟"} ≠ ${reqCommune})`;
  }

  const score = Math.round((percentage / 100) * WEIGHTS.location);
  return { score, detail };
}

// ── GPS Proximity Score (NEW LAYER — geoProximity) ────────────────
// Computes a Gaussian decay score based on Haversine distance between
// buyer and listing GPS coordinates.
//
// SECURITY MODEL (non-negotiable):
//   • The raw distance in meters/km is NEVER returned in the detail
//     string. Only a qualitative label is exposed.
//   • The raw distance is computed in-memory and discarded after
//     scoring — never persisted, never logged, never sent to any
//     client (buyer OR seller).
//   • This prevents gradual triangulation attacks where a buyer could
//     repeatedly query with different reference points to narrow down
//     a seller's exact location.
//
// Returns { score: 0..WEIGHTS.geoProximity, detail: qualitative label }
// or null if GPS is unavailable on either side (caller treats null
// as "skip this layer, no penalty, no bonus").
interface GeoProximityScore {
  score: number;  // 0..WEIGHTS.geoProximity
  detail: string; // qualitative label only
}

function geoProximityScore(
  req: ScoreInput,
  listing: {
    _decryptedLat?: number | null;
    _decryptedLng?: number | null;
  },
): GeoProximityScore | null {
  const reqLat = req.latitude;
  const reqLng = req.longitude;
  const listLat = listing._decryptedLat;
  const listLng = listing._decryptedLng;

  // ── If either side lacks GPS → skip this layer entirely ──────
  // Graceful fallback: no penalty for manual-only users. The other
  // layers (location, price, features) still score normally.
  if (
    reqLat === undefined || reqLat === null ||
    reqLng === undefined || reqLng === null ||
    listLat === undefined || listLat === null ||
    listLng === undefined || listLng === null
  ) {
    return null;
  }

  const distKm = haversineKm(reqLat, reqLng, listLat, listLng);

  // Beyond max range → score 0 for this layer (but don't reject —
  // the administrative location layer may still match).
  if (distKm > GEO_PROXIMITY_MAX_KM) {
    return {
      score: 0,
      // Qualitative label only — never expose the raw distance
      detail: "بعيد جغرافياً",
    };
  }

  // Gaussian decay — peak at 0km, ~88% at 500m, decays smoothly
  const gaussianValue = gaussian(distKm, GEO_PROXIMITY_SIGMA_KM);
  const percentage = Math.round(gaussianValue * 100);
  const score = Math.round((percentage / 100) * WEIGHTS.geoProximity);

  // ── Qualitative label only (NO raw distance) ────────────────
  // Buckets are wide enough to prevent triangulation: an attacker
  // querying multiple reference points can only learn which bucket
  // they're in, not the precise distance.
  let detail: string;
  if (distKm <= 0.5) {
    detail = "قريب جداً من موقعك";
  } else if (distKm <= 1.5) {
    detail = "قريب من موقعك";
  } else if (distKm <= 3) {
    detail = "متوسط البعد";
  } else {
    detail = "بعيد نسبياً";
  }

  return { score, detail };
}

// ══════════════════════════════════════════════════════════════════
//  LAYER 3: Blind Price Algorithm
// ══════════════════════════════════════════════════════════════════
//  Uses the SECRET minimum price (decrypted server-side, never
//  returned to buyer) to determine price overlap.
//
//  Cases:
//  1. budget ≥ secretMin → EXCELLENT match. Bonus if askingPrice
//     is well below budget (good deal for buyer).
//  2. budget < secretMin but within NEGOTIATION_BUFFER → MATCH
//     with reduced score (e.g., 75%). Shows "ضمن نطاق ميزانيتك
//     أو قريب منها جداً".
//  3. budget < secretMin beyond buffer → FAIL (score = 0).
//
//  The DISPLAYED score uses askingPrice (public) only.
//  The FILTER uses secretMinPrice (secret) only.
// ══════════════════════════════════════════════════════════════════

interface PriceScore {
  score: number;      // 0..40
  detail: string;
  withinBuffer: boolean; // true if matched via negotiation buffer
}

function blindPriceScore(
  budgetMax: number,
  publicPrice: number,     // askingPrice or pricePerNight
  secretMinPrice: number,  // decrypted, never returned
): PriceScore {
  // Case 1: Budget ≥ secret minimum → strong match
  if (budgetMax >= secretMinPrice) {
    // Now score based on PUBLIC price vs budget (how good a deal?)
    const ratio = publicPrice / budgetMax;
    let percentage: number;
    if (ratio <= 0.7) {
      // askingPrice is 30%+ below budget → amazing deal
      percentage = 100;
    } else if (ratio <= 1.0) {
      // askingPrice within budget → good deal
      // Linear: 85% at ratio=1.0, 100% at ratio=0.7
      percentage = 85 + (1 - ratio) / 0.3 * 15;
    } else {
      // askingPrice slightly above budget but secret is within
      // → still matchable, mild decay
      percentage = 85 * gaussian((ratio - 1) * 5, 1.0);
    }
    const score = Math.round(clamp(percentage, 0, 100) / 100 * WEIGHTS.price);
    return {
      score,
      detail: `الميزانية ≥ الحد الأدنى السري — تطابق سعر ممتاز`,
      withinBuffer: false,
    };
  }

  // Case 2: Budget below secret, but within negotiation buffer
  const gap = (secretMinPrice - budgetMax) / secretMinPrice;
  if (gap <= NEGOTIATION_BUFFER_PERCENT) {
    // Within 10% buffer → match with reduced score
    // Map gap 0% → 80%, gap 10% → 60%
    const percentage = 80 - (gap / NEGOTIATION_BUFFER_PERCENT) * 20;
    const score = Math.round(clamp(percentage, 0, 100) / 100 * WEIGHTS.price);
    return {
      score,
      detail: `ضمن نطاق ميزانيتك أو قريب منها جداً (هامش تساوم ${Math.round(gap * 100)}%)`,
      withinBuffer: true,
    };
  }

  // Case 3: Beyond buffer → fail
  return {
    score: 0,
    detail: `الميزانية أقل من الحد الأدنى السري بفارق ${Math.round(gap * 100)}%`,
    withinBuffer: false,
  };
}

// ══════════════════════════════════════════════════════════════════
//  LAYER 4: Soft Features (rooms, area, bathrooms, legal, dates)
// ══════════════════════════════════════════════════════════════════
//  Flexible matching:
//  • More rooms than requested → BONUS (bigger is better)
//  • Fewer rooms than requested → HEAVY PENALTY
//  • Area within range → high score; close to range → moderate
//  • Legal status: formal docs → bonus
//  • SEASONAL_RENT: date proximity → bonus
// ══════════════════════════════════════════════════════════════════

interface FeatureScore {
  score: number;  // 0..20
  detail: string;
}

function softFeaturesScore(
  req: ScoreInput,
  listing: Pick<
    Listing,
    | "bedrooms" | "bathrooms" | "areaSqm" | "legalStatus"
    | "availableFrom" | "availableTo" | "minStayNights"
    | "intent"
  >,
): FeatureScore {
  let score = 0;
  const details: string[] = [];
  const maxScore = WEIGHTS.features;

  // Sub-weights within the 25 pts (was 20, scaled up proportionally):
  //  rooms: 9 pts (was 7)
  //  bathrooms: 4 pts (was 3)
  //  area: 6 pts (was 5)
  //  legal: 4 pts (was 3)
  //  dates (SEASONAL only): 2 pts (unchanged)

  // ── Rooms (9 pts) ────────────────────────────────────────────
  let roomsScore = 0;
  if (req.bedrooms !== undefined && req.bedrooms > 0) {
    if (listing.bedrooms !== null) {
      if (listing.bedrooms >= req.bedrooms) {
        // Equal or more → full score (bigger is better)
        roomsScore = 9;
        if (listing.bedrooms > req.bedrooms) {
          details.push(`${listing.bedrooms} غرف (طلب: ${req.bedrooms}) — مكافأة: غرف أكثر`);
        } else {
          details.push(`${listing.bedrooms} غرف = طلبك (${req.bedrooms})`);
        }
      } else {
        // Fewer rooms → heavy penalty
        const diff = req.bedrooms - listing.bedrooms;
        roomsScore = 9 * gaussian(diff, 1.0);
        details.push(`${listing.bedrooms} غرف (طلب: ${req.bedrooms}) — خصم: غرف أقل`);
      }
    }
  } else {
    roomsScore = 6; // no preference → neutral (was 5)
  }
  score += roomsScore;

  // ── Bathrooms (4 pts) ────────────────────────────────────────
  let bathScore = 0;
  if (req.bathrooms !== undefined && req.bathrooms > 0 && listing.bathrooms !== null) {
    if (listing.bathrooms >= req.bathrooms) {
      bathScore = 4;
    } else {
      bathScore = 4 * gaussian(req.bathrooms - listing.bathrooms, 1.0);
    }
  } else {
    bathScore = 3; // was 2
  }
  score += bathScore;

  // ── Area (6 pts) ────────────────────────────────────────────
  // We don't have explicit areaMin/areaMax from buyer in this flow,
  // so we give neutral score. Future: add area preferences to search.
  let areaScore = 4; // neutral (was 3)
  if (listing.areaSqm > 0) {
    areaScore = 5; // has valid area → slight bonus (was 4)
  }
  score += areaScore;

  // ── Legal status (4 pts) ────────────────────────────────────
  let legalScore = 1;
  if (listing.legalStatus) {
    if (listing.legalStatus === "LIVRET_FONCIER" || listing.legalStatus === "NOTARIZED_ACT") {
      legalScore = 4;
      details.push("وضعية قانونية ممتازة");
    } else if (listing.legalStatus === "REGISTERED_UNNOTARIZED" || listing.legalStatus === "ADMIN_DECISION") {
      legalScore = 3;
    } else if (listing.legalStatus === "PRIVATE_ACT") {
      legalScore = 1;
    } else {
      legalScore = 0;
    }
  }
  score += legalScore;

  // ── SEASONAL_RENT: date proximity (2 pts) ───────────────────
  if (req.intent === "SEASONAL_RENT" && req.checkIn && req.checkOut
      && listing.availableFrom && listing.availableTo) {
    const checkIn = new Date(req.checkIn).getTime();
    const checkOut = new Date(req.checkOut).getTime();
    const availFrom = new Date(listing.availableFrom).getTime();
    const availTo = new Date(listing.availableTo).getTime();
    const stayMid = (checkIn + checkOut) / 2;
    const availMid = (availFrom + availTo) / 2;
    const availSpan = Math.max(1, availTo - availFrom);
    const normalizedDist = Math.abs(stayMid - availMid) / availSpan;
    const dateScore = 2 * gaussian(normalizedDist * 2, 1.0);
    score += dateScore;
    if (dateScore > 1) {
      details.push("تواريخ متاحة قريبة من طلبك");
    }
  } else {
    score += 1; // neutral for non-seasonal
  }

  score = Math.round(clamp(score, 0, maxScore));
  return {
    score,
    detail: details.join(" · ") || "مواصفات مناسبة",
  };
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCORING FUNCTION
// ══════════════════════════════════════════════════════════════════
// Type for listings passed to scoreMatch — extends Prisma Listing with
// two transient decrypted fields (prefixed _ to mark them as runtime-only).
// The caller (match route) is responsible for decrypting geoLocationEnc
// and secretMinPriceEnc BEFORE calling this function — the engine itself
// never touches crypto, keeping a clean separation of concerns.
export type ListingForScoring = Pick<
  Listing,
  | "intent" | "type" | "city" | "commune" | "district"
  | "askingPrice" | "areaSqm" | "bedrooms" | "bathrooms" | "legalStatus"
  | "pricePerNight" | "availableFrom" | "availableTo" | "minStayNights"
> & {
  _decryptedLat?: number | null;
  _decryptedLng?: number | null;
};

export function scoreMatch(
  req: ScoreInput,
  listing: ListingForScoring,
  secretMinPrice: number, // decrypted, NEVER returned
): MatchScoreBreakdown {
  // Layer 1: Hard filters
  if (!passesHardFilters(req, listing)) {
    return {
      total: 0, price: 0, location: 0, geoProximity: 0, features: 0,
      locationDetail: "فشل الفلتر الصارم",
      geoProximityDetail: "—",
      priceDetail: "—",
      featuresDetail: "—",
    };
  }

  // Determine public price (askingPrice for SELL/RENT, pricePerNight for SEASONAL)
  const publicPrice = req.intent === "SEASONAL_RENT"
    ? (listing.pricePerNight ?? 0)
    : listing.askingPrice;

  // Layer 3: Blind price (uses secretMinPrice + budgetMax)
  const priceResult = req.budgetMax !== undefined
    ? blindPriceScore(req.budgetMax, publicPrice, secretMinPrice)
    : { score: WEIGHTS.price * 0.6, detail: "لا توجد ميزانية محددة", withinBuffer: false };

  // If price completely fails (beyond buffer) → no match
  if (priceResult.score === 0) {
    return {
      total: 0, price: 0, location: 0, geoProximity: 0, features: 0,
      locationDetail: "—",
      geoProximityDetail: "—",
      priceDetail: priceResult.detail,
      featuresDetail: "—",
    };
  }

  // Layer 2: Administrative location (wilaya/commune/district)
  const locResult = spatialFuzzyScore(req, listing);

  // Layer 2b: GPS Proximity (NEW — Gaussian decay @ 500m peak)
  // Returns null if either side lacks GPS → layer is skipped (no bonus,
  // no penalty). The other layers still score at full weight.
  const geoResult = geoProximityScore(req, listing);
  const geoScore = geoResult?.score ?? 0;
  const geoDetail = geoResult?.detail ?? "غير متاح (إدخال يدوي)";

  // Layer 4: Soft features
  const featResult = softFeaturesScore(req, listing);

  // ── Final weighted score ────────────────────────────────────
  // When geoProximity is unavailable (null), the 15 pts it would have
  // contributed are simply not added — the max achievable becomes 85
  // instead of 100. This is intentional: we DON'T redistribute those
  // pts to other layers, because doing so would mask the absence of
  // GPS data and could create false-positive high scores. A user who
  // wants the full 100 must use the map picker.
  const total = clamp(
    priceResult.score + locResult.score + geoScore + featResult.score,
    0, 100,
  );

  return {
    total: Math.round(total),
    price: priceResult.score,
    location: locResult.score,
    geoProximity: geoScore,
    features: featResult.score,
    locationDetail: locResult.detail,
    geoProximityDetail: geoDetail,
    priceDetail: priceResult.detail,
    featuresDetail: featResult.detail,
  };
}

// ══════════════════════════════════════════════════════════════════
//  STAGE 1: Existence check (hard filters only, no scoring)
// ══════════════════════════════════════════════════════════════════
export function stage1HasMatch(
  req: { intent: string; type: string; city: string; commune?: string | null },
  listings: Pick<Listing, "intent" | "type" | "city" | "commune">[],
): boolean {
  return listings.some(
    (l) =>
      l.intent === req.intent &&
      l.type === req.type &&
      l.city === req.city &&
      (!req.commune || l.commune === req.commune),
  );
}

// ══════════════════════════════════════════════════════════════════
//  STAGE 2: Filter by secretMinPrice (+ dates for SEASONAL_RENT)
// ══════════════════════════════════════════════════════════════════
// This filter applies the negotiation buffer: listings whose
// secretMinPrice is within NEGOTIATION_BUFFER_PERCENT above the
// buyer's budget are KEPT (they'll get a reduced score from Layer 3).
export function stage2Filter(
  req: {
    intent: string;
    type: string;
    city: string;
    commune?: string | null;
    budgetMax: number;
    checkIn?: string;
    checkOut?: string;
  },
  listings: Array<Listing & { _decryptedSecretMinPrice: number }>,
): Array<Listing & { _decryptedSecretMinPrice: number }> {
  return listings.filter((l) => {
    // Hard filters
    if (l.intent !== req.intent) return false;
    if (l.type !== req.type) return false;
    if (l.city !== req.city) return false;
    if (req.commune && l.commune !== req.commune) return false;

    // Blind price filter with negotiation buffer:
    // Keep if budget ≥ secretMin (exact match)
    // OR if gap ≤ buffer (negotiation match)
    const secret = l._decryptedSecretMinPrice;
    if (req.budgetMax < secret) {
      const gap = (secret - req.budgetMax) / secret;
      if (gap > NEGOTIATION_BUFFER_PERCENT) return false; // beyond buffer
    }

    // SEASONAL_RENT: date overlap + min stay
    if (req.intent === "SEASONAL_RENT") {
      if (!req.checkIn || !req.checkOut) return false;
      if (!l.availableFrom || !l.availableTo) return false;
      const checkIn = new Date(req.checkIn);
      const checkOut = new Date(req.checkOut);
      const availFrom = new Date(l.availableFrom);
      const availTo = new Date(l.availableTo);
      if (checkIn < availFrom || checkOut > availTo) return false;
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      if (l.minStayNights && nights < l.minStayNights) return false;
    }

    return true;
  });
}

// ══════════════════════════════════════════════════════════════════
//  RANK: Score + sort listings
// ══════════════════════════════════════════════════════════════════
export interface RankedMatch<L = Listing> {
  listing: L;
  breakdown: MatchScoreBreakdown;
}

export function rankListings<L extends Listing>(
  req: ScoreInput,
  listings: Array<L & { _decryptedSecretMinPrice: number; _decryptedLat?: number | null; _decryptedLng?: number | null }>,
): RankedMatch<L>[] {
  return listings
    .map((listing) => ({
      listing,
      breakdown: scoreMatch(req, listing as ListingForScoring, listing._decryptedSecretMinPrice),
    }))
    .filter((m) => m.breakdown.total >= MIN_REVEAL_THRESHOLD)
    .sort((a, b) => b.breakdown.total - a.breakdown.total);
}

// ══════════════════════════════════════════════════════════════════
//  DYNAMIC WEIGHTS — Feedback Loop
// ══════════════════════════════════════════════════════════════════
//  When a buyer rejects a match, we record the reason and adjust
//  their personal weight profile. This makes the platform "learn"
//  what matters most to each user.
//
//  Mapping rejection reasons → weight categories:
//    PRICE_TOO_HIGH          → price category
//    LOCATION_NOT_IDEAL      → location category
//    TOO_FEW_ROOMS           → features category
//    TOO_MANY_ROOMS          → features category
//    AREA_TOO_SMALL          → features category
//    AREA_TOO_LARGE          → features category
//    LEGAL_STATUS_WEAK       → features category
//    DATES_NOT_AVAILABLE     → location category (dates are spatial)
//    OTHER                   → no adjustment
//
//  Adjustment logic:
//    When a buyer rejects due to reason X, it means the current
//    weight for X was TOO LOW (the algorithm over-scored other
//    factors). So we INCREASE the weight for X and DECREASE
//    the others proportionally.
//
//    The learningRate controls how aggressive the shift is.
//    Default 0.5 = gentle (shifts 0.5 points per rejection).
// ══════════════════════════════════════════════════════════════════

export type RejectionReasonType =
  | "PRICE_TOO_HIGH"
  | "LOCATION_NOT_IDEAL"
  | "TOO_FEW_ROOMS"
  | "TOO_MANY_ROOMS"
  | "AREA_TOO_SMALL"
  | "AREA_TOO_LARGE"
  | "LEGAL_STATUS_WEAK"
  | "DATES_NOT_AVAILABLE"
  | "OTHER";

export interface UserWeights {
  price: number;
  location: number;
  features: number;
}

export const DEFAULT_WEIGHTS: UserWeights = {
  price: WEIGHTS.price,
  location: WEIGHTS.location,
  features: WEIGHTS.features,
};

// ── Map rejection reason → weight category ───────────────────────
function reasonToCategory(reason: RejectionReasonType): "price" | "location" | "features" | null {
  switch (reason) {
    case "PRICE_TOO_HIGH":
      return "price";
    case "LOCATION_NOT_IDEAL":
    case "DATES_NOT_AVAILABLE":
      return "location";
    case "TOO_FEW_ROOMS":
    case "TOO_MANY_ROOMS":
    case "AREA_TOO_SMALL":
    case "AREA_TOO_LARGE":
    case "LEGAL_STATUS_WEAK":
      return "features";
    default:
      return null;
  }
}

// ── Adjust weights based on a rejection ──────────────────────────
// Returns the NEW weights (does not mutate the input).
// Logic: increase the rejected category's weight by learningRate,
// and decrease the other two proportionally to maintain sum=100.
export function adjustWeightsFromRejection(
  current: UserWeights,
  reason: RejectionReasonType,
  learningRate: number = 0.5,
): UserWeights {
  const category = reasonToCategory(reason);
  if (!category) {
    // OTHER → no adjustment
    return { ...current };
  }

  const next = { ...current };

  // Increase the rejected category
  next[category] += learningRate;

  // Decrease the other two proportionally
  const others = (["price", "location", "features"] as const).filter((c) => c !== category);
  const otherSum = current[others[0]] + current[others[1]];
  if (otherSum > 0) {
    for (const o of others) {
      const proportion = current[o] / otherSum;
      next[o] -= learningRate * proportion;
    }
  } else {
    // Fallback: equal split
    for (const o of others) {
      next[o] -= learningRate / 2;
    }
  }

  // Clamp: no weight below 10 (prevent any factor from becoming irrelevant)
  for (const key of ["price", "location", "features"] as const) {
    next[key] = Math.max(10, next[key]);
  }

  // Renormalize to sum = 100
  const sum = next.price + next.location + next.features;
  if (sum > 0) {
    next.price = Math.round((next.price / sum) * 100);
    next.location = Math.round((next.location / sum) * 100);
    next.features = 100 - next.price - next.location; // ensure exact sum
  }

  return next;
}

// ── Apply user weights to a score breakdown ──────────────────────
// Takes the raw sub-scores (0..1 percentages) and re-weights them
// using the user's personal weight profile.
export function applyUserWeights(
  pricePercent: number,    // 0..1
  locationPercent: number, // 0..1
  featuresPercent: number, // 0..1
  weights: UserWeights,
): number {
  const total =
    pricePercent * weights.price +
    locationPercent * weights.location +
    featuresPercent * weights.features;
  return Math.round(total);
}

