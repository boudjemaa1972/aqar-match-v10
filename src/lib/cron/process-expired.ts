import { db } from "@/lib/db";
import { encryptJSON, decryptField, decryptJSON } from "@/lib/crypto";
import { calculateBuyerFee } from "@/lib/schemas";
import { rankListings, stage2Filter } from "@/lib/matching-engine";
import { cleanupExpiredRateLimits } from "@/lib/rate-limit";
import type { Listing } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────
//  processExpiredMatches()
//
//  Cron-ready function — call periodically (e.g., every hour) to:
//   1. EXPIRE matches where the seller didn't pay+consent in 48h.
//      → Status: PROPOSED → EXPIRED. Seller fee NOT charged (never paid).
//        (Resolutory condition — Art. 207 CC: no payment = no obligation.)
//      → Advance the MatchQueue: promote the next rank to a new Match.
//   2. EXPIRE matches where the buyer didn't pay in 48h after being notified.
//      → Status: BUYER_NOTIFIED → EXPIRED. Buyer fee NOT charged.
//        Seller fee refunded (resolutory condition — match did not complete).
//      → Advance the queue.
//   3. REFUND matches where the seller didn't confirm contact in 48h
//      after the buyer paid.
//      → Status: BUYER_FEE_PAID → REFUNDED. Buyer fee refunded.
//        Seller fee refunded (resolutory condition — match did not complete,
//        not attributable to the aggrieved party per Art. 207 CC).
//      → Advance the queue.
//
//  When advancing the queue, this function re-runs stage-2 matching
//  for the next PENDING entry. If no PENDING entries remain, the
//  MatchRequest is marked CLOSED (buyer will see "no more matches").
//
//  Returns a summary of actions taken (for logging/cron reports).
// ──────────────────────────────────────────────────────────────────

const WINDOW_HOURS = 48;

export interface ProcessResult {
  expiredSeller: number;
  expiredBuyer: number;
  refundedBuyer: number;
  queueAdvanced: number;
  queueExhausted: number;
  rateLimitEntriesDeleted: number;
  errors: string[];
}

export async function processExpiredMatches(): Promise<ProcessResult> {
  const result: ProcessResult = {
    expiredSeller: 0,
    expiredBuyer: 0,
    refundedBuyer: 0,
    queueAdvanced: 0,
    queueExhausted: 0,
    rateLimitEntriesDeleted: 0,
    errors: [],
  };

  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

  // ── 1. Seller didn't pay+consent in 48h (PROPOSED) ──────────
  const sellerExpired = await db.match.findMany({
    where: {
      status: "PROPOSED",
      sellerDeadline: { lt: now },
    },
    include: { request: true, listing: true },
  });
  for (const m of sellerExpired) {
    try {
      await db.match.update({
        where: { id: m.id },
        data: { status: "EXPIRED" },
      });
      await db.matchQueue.updateMany({
        where: { matchId: m.id },
        data: { status: "EXPIRED" },
      });
      result.expiredSeller++;
      await advanceQueue(m.requestId, result);
    } catch (e) {
      result.errors.push(`seller-expire ${m.id}: ${(e as Error).message}`);
    }
  }

  // ── 2. Buyer didn't pay in 48h (BUYER_NOTIFIED) ─────────────
  const buyerExpired = await db.match.findMany({
    where: {
      status: "BUYER_NOTIFIED",
      buyerDeadline: { lt: now },
    },
    include: { request: true },
  });
  for (const m of buyerExpired) {
    try {
      await db.match.update({
        where: { id: m.id },
        data: { status: "EXPIRED" },
      });
      await db.matchQueue.updateMany({
        where: { matchId: m.id },
        data: { status: "EXPIRED" },
      });
      result.expiredBuyer++;
      // Resolutory condition (Art. 207 CC): buyer didn't pay,
      // so seller fee is refunded (match did not complete).
      // In production: issue refund to seller via payment gateway.
      await advanceQueue(m.requestId, result);
    } catch (e) {
      result.errors.push(`buyer-expire ${m.id}: ${(e as Error).message}`);
    }
  }

  // ── 3. Seller didn't confirm contact in 48h after buyer paid ──
  const refundCandidates = await db.match.findMany({
    where: {
      status: "BUYER_FEE_PAID",
      sellerConfirmContact: false,
      refundEligibleAt: { lt: now },
    },
    include: { request: true },
  });
  for (const m of refundCandidates) {
    try {
      await db.match.update({
        where: { id: m.id },
        data: { status: "REFUNDED" },
      });
      await db.matchQueue.updateMany({
        where: { matchId: m.id },
        data: { status: "EXPIRED" },
      });
      // Resolutory condition (Art. 207 CC): seller didn't confirm contact,
      // so buyer fee is refunded (match did not complete, not attributable
      // to the buyer per Art. 207 CC).
      // In production: issue refund to buyer via payment gateway
      // (CCP/BaridiMob/Edahabia).
      result.refundedBuyer++;
      await advanceQueue(m.requestId, result);
    } catch (e) {
      result.errors.push(`refund ${m.id}: ${(e as Error).message}`);
    }
  }

  // ── 4. Cleanup: delete expired rate-limit entries ───────────────
  // Stale rows (resetAt < now) in RateLimitEntry serve no purpose once
  // the window has elapsed. Deleting them keeps the table bounded
  // (one row per active IP × route, not growing forever).
  // Best-effort: failures here are logged but don't fail the cron run.
  try {
    result.rateLimitEntriesDeleted = await cleanupExpiredRateLimits();
  } catch (e) {
    result.errors.push(`rate-limit-cleanup: ${(e as Error).message}`);
  }

  return result;
}

// ── Advance the MatchQueue: promote next PENDING entry ────────────
async function advanceQueue(requestId: string, result: ProcessResult) {
  const next = await db.matchQueue.findFirst({
    where: { requestId, status: "PENDING" },
    orderBy: { rank: "asc" },
    include: { listing: true, request: true },
  });

  if (!next) {
    // Queue exhausted — mark request as CLOSED
    await db.matchRequest.update({
      where: { id: requestId },
      data: { status: "CLOSED" },
    });
    result.queueExhausted++;
    return;
  }

  // Re-validate the next listing against the buyer's budget (in case
  // the listing's secretMinPrice changed — unlikely but defensive).
  const maxBudgetEnc = await decryptJSON<{ maxBudget: number }>(next.request.maxBudgetEnc || "");
  if (!maxBudgetEnc) {
    result.errors.push(`advance ${requestId}: cannot decrypt maxBudget`);
    return;
  }

  // Decrypt the listing's secretMinPrice for the filter check
  const decryptedSecret = await decryptJSON<{ secretMinPrice: number }>(next.listing.secretMinPriceEnc);
  if (!decryptedSecret) {
    result.errors.push(`advance ${requestId}: cannot decrypt secretMinPrice`);
    return;
  }

  // Decrypt geoLocation for scoring (optional — admin fallback if absent)
  let decLat: number | null = null;
  let decLng: number | null = null;
  if (next.listing.geoLocationEnc) {
    try {
      const geo = await decryptJSON<{ lat: number; lng: number }>(next.listing.geoLocationEnc);
      if (geo && typeof geo.lat === "number" && typeof geo.lng === "number") {
        decLat = geo.lat;
        decLng = geo.lng;
      }
    } catch {
      // Skip — admin proximity fallback still works
    }
  }

  const listingWithSecret: Listing & {
    _decryptedSecretMinPrice: number;
    _decryptedLat: number | null;
    _decryptedLng: number | null;
  } = {
    ...next.listing,
    _decryptedSecretMinPrice: decryptedSecret.secretMinPrice,
    _decryptedLat: decLat,
    _decryptedLng: decLng,
  };

  const filtered = stage2Filter(
    {
      intent: next.request.intent,
      type: next.request.type,
      city: next.request.city,
      commune: next.request.commune || null,
      budgetMax: maxBudgetEnc.maxBudget,
    },
    [listingWithSecret],
  );

  if (filtered.length === 0) {
    // Listing no longer matches — mark EXPIRED and try next
    await db.matchQueue.update({
      where: { id: next.id },
      data: { status: "EXPIRED" },
    });
    return advanceQueue(requestId, result);
  }

  // Re-score (askingPrice only)
  const ranked = rankListings(
    {
      intent: next.request.intent,
      type: next.request.type,
      city: next.request.city,
      commune: next.request.commune || null,
      district: next.request.district || null,
      budgetMax: maxBudgetEnc.maxBudget,
      bedrooms: 0,
      bathrooms: 0,
    },
    [listingWithSecret],
  );

  const score = ranked[0]?.breakdown.total ?? next.score;
  const buyerFee = calculateBuyerFee(next.listing.askingPrice, next.request.intent);
  const sellerFee = next.listing.sellerFee;
  const now = new Date();
  const sellerDeadline = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);

  // Promote to a new active Match
  const newMatch = await db.match.create({
    data: {
      requestId: next.request.id,
      listingId: next.listing.id,
      buyerId: next.request.userId,
      sellerId: next.listing.ownerId,
      score,
      queueRank: next.rank,
      buyerFee,
      sellerFee,
      status: "PROPOSED",
      sellerDeadline,
    },
  });

  await db.matchQueue.update({
    where: { id: next.id },
    data: { status: "ACTIVE", matchId: newMatch.id },
  });

  result.queueAdvanced++;
}
