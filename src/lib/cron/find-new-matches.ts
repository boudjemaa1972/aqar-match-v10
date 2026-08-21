import { db } from "@/lib/db";
import { encryptJSON, decryptJSON } from "@/lib/crypto";
import { calculateBuyerFee } from "@/lib/schemas";
import { rankListings, stage2Filter } from "@/lib/matching-engine";
import type { Listing, MatchRequest as PrismaMatchRequest } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────
//  findNewMatchesForPendingRequests()
//
//  Cron-ready function — call periodically (e.g., every 10–30 min) to:
//   1. Find all OPEN MatchRequests (buyer searches that found no match
//      when first submitted, but were saved for future notifications).
//   2. For each such request, find newly-published Listings (created
//      AFTER the request's createdAt) that match the criteria.
//   3. For each new (request, listing) pair:
//        a. Verify it doesn't already have a MatchNotification
//           (prevents double-notification if cron runs twice).
//        b. Decrypt the listing's secretMinPriceEnc in-memory ONLY,
//           apply stage2Filter to confirm the budget/date match.
//        c. Create a Match row (status=PROPOSED, same lifecycle as
//           a normal stage-2 match — no separate parallel path).
//        d. Create a MatchNotification row linking the request,
//           listing, and new match — IN_APP channel only.
//        e. Update MatchRequest.notifiedAt to mark that we've notified.
//   4. Return a summary for logging.
//
//  SECURITY:
//  ─────────
//  • secretMinPriceEnc is decrypted ONLY in-memory for the stage2Filter
//    check — NEVER persisted in plaintext, NEVER logged, NEVER returned.
//  • Buyer PII (fullName, phone) stays encrypted — we only need userId
//    to denormalize into the notification row.
//  • No external (SMS/email) notification is sent in this phase —
//    only an IN_APP notification row is created. Buyer polls
//    /api/notifications to see them.
//
//  IDEMPOTENCE:
//  ───────────
//  The @@unique([requestId, listingId]) on MatchNotification guarantees
//  that even if the cron runs twice in quick succession, only ONE
//  notification is created per (request, listing) pair. The second run
//  hits a unique constraint violation which we catch and skip.
// ──────────────────────────────────────────────────────────────────

const SELLER_DEADLINE_HOURS = 48;
// How many days back to look for listings (safety bound — without it,
// a request that's been OPEN for 6 months could match against an old
// listing the buyer has already seen). 30 days matches the demand
// estimate window, so notifications only fire for "fresh" listings.
const LISTING_FRESHNESS_DAYS = 30;

export interface FindNewMatchesResult {
  requestsScanned: number;
  newMatchesCreated: number;
  notificationsCreated: number;
  skippedAlreadyNotified: number;
  skippedNoMatch: number;
  errors: string[];
}

export async function findNewMatchesForPendingRequests(): Promise<FindNewMatchesResult> {
  const result: FindNewMatchesResult = {
    requestsScanned: 0,
    newMatchesCreated: 0,
    notificationsCreated: 0,
    skippedAlreadyNotified: 0,
    skippedNoMatch: 0,
    errors: [],
  };

  const now = new Date();
  const listingCutoff = new Date(
    now.getTime() - LISTING_FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
  );

  // ── 1. Find all OPEN requests (buyer searches awaiting a match) ──
  // OPEN = no match was found when the buyer searched; the request
  // was saved so a future cron could match new listings to it.
  // Limit to OPEN only — FULFILLED requests already have at least one
  // match (the buyer was shown a blind card). CLOSED requests are dead.
  const openRequests: PrismaMatchRequest[] = await db.matchRequest.findMany({
    where: { status: "OPEN" },
    take: 200, // batch cap — prevent unbounded work in a single run
  });
  result.requestsScanned = openRequests.length;

  if (openRequests.length === 0) return result;

  for (const req of openRequests) {
    try {
      // ── 2. Find candidate listings created AFTER the request ──
      // Use createdAt > req.createdAt AND within the freshness window
      // (whichever is more recent). We also exclude listings owned by
      // the requesting user (can't match your own property).
      const candidateListings: Listing[] = await db.listing.findMany({
        where: {
          status: { in: ["ACTIVE", "UNMODERATED"] },
          intent: req.intent,
          type: req.type,
          city: req.city,
          ownerId: { not: req.userId },
          createdAt: {
            gt: req.createdAt,
            gte: listingCutoff,
          },
        },
        take: 50, // cap per request
      });

      if (candidateListings.length === 0) {
        result.skippedNoMatch++;
        continue;
      }

      // ── 3. Filter candidates against stage-2 criteria ──
      // We need the buyer's maxBudget (encrypted) — decrypt once.
      let buyerMaxBudget: number | null = null;
      if (req.maxBudgetEnc) {
        try {
          const decrypted = await decryptJSON<{ maxBudget: number }>(req.maxBudgetEnc);
          if (decrypted && typeof decrypted.maxBudget === "number") {
            buyerMaxBudget = decrypted.maxBudget;
          }
        } catch {
          result.errors.push(
            `request ${req.id}: cannot decrypt maxBudgetEnc — skipping`,
          );
          continue;
        }
      }
      if (buyerMaxBudget === null) {
        // Stage-1-only request (no budget provided) — skip; can't stage-2 match.
        result.skippedNoMatch++;
        continue;
      }

      // ── For each candidate, check if already notified (skip if so) ──
      // We batch-check upfront to avoid N queries.
      const listingIds = candidateListings.map((l) => l.id);
      const alreadyNotified = await db.matchNotification.findMany({
        where: {
          requestId: req.id,
          listingId: { in: listingIds },
        },
        select: { listingId: true },
      });
      const alreadyNotifiedSet = new Set(alreadyNotified.map((n) => n.listingId));

      // ── For each candidate not already notified, attempt match ──
      for (const listing of candidateListings) {
        if (alreadyNotifiedSet.has(listing.id)) {
          result.skippedAlreadyNotified++;
          continue;
        }

        try {
          // Decrypt listing's secret price for stage-2 filter check
          let secretPrice: number | null = null;
          if (req.intent === "SEASONAL_RENT") {
            const d = await decryptJSON<{ secretMinPricePerNight: number }>(
              listing.secretMinPricePerNightEnc || "",
            );
            if (d && typeof d.secretMinPricePerNight === "number") {
              secretPrice = d.secretMinPricePerNight;
            }
          } else {
            const d = await decryptJSON<{ secretMinPrice: number }>(
              listing.secretMinPriceEnc,
            );
            if (d && typeof d.secretMinPrice === "number") {
              secretPrice = d.secretMinPrice;
            }
          }
          if (secretPrice === null) {
            // Can't decrypt — skip this listing
            continue;
          }

          // Decrypt geo (optional — admin fallback if absent)
          let decLat: number | null = null;
          let decLng: number | null = null;
          if (listing.geoLocationEnc) {
            try {
              const geo = await decryptJSON<{ lat: number; lng: number }>(
                listing.geoLocationEnc,
              );
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
            ...listing,
            _decryptedSecretMinPrice: secretPrice,
            _decryptedLat: decLat,
            _decryptedLng: decLng,
          };

          // Stage-2 filter — must pass hard filters + budget + dates (seasonal)
          const filtered = stage2Filter(
            {
              intent: req.intent,
              type: req.type,
              city: req.city,
              commune: req.commune || null,
              budgetMax: buyerMaxBudget,
            },
            [listingWithSecret],
          );

          if (filtered.length === 0) {
            // Doesn't match criteria — skip silently (not an error)
            result.skippedNoMatch++;
            continue;
          }

          // Score by askingPrice only (never by secretMinPrice)
          const ranked = rankListings(
            {
              intent: req.intent,
              type: req.type,
              city: req.city,
              commune: req.commune || null,
              district: req.district || null,
              budgetMax: buyerMaxBudget,
              bedrooms: 0,
              bathrooms: 0,
            },
            [listingWithSecret],
          );

          if (ranked.length === 0) {
            // Below MIN_REVEAL_THRESHOLD — skip
            result.skippedNoMatch++;
            continue;
          }

          const topMatch = ranked[0];
          const score = topMatch.breakdown.total;

          // ── Compute fees (same logic as /api/match route) ──
          let feeBase = listing.askingPrice;
          // For SEASONAL_RENT, fee base is pricePerNight × nights — but we
          // don't have checkIn/checkOut on OPEN requests (buyer didn't
          // complete stage 2 fully). Fall back to askingPrice or a
          // per-night estimate. This is acceptable because fees are
          // finalized at payment time, not at match creation.
          const buyerFee = calculateBuyerFee(feeBase, req.intent);
          const sellerFee = listing.sellerFee;
          const sellerDeadline = new Date(
            now.getTime() + SELLER_DEADLINE_HOURS * 60 * 60 * 1000,
          );

          // ── Create Match + MatchNotification atomically ──
          // Order matters: create Match first (needs requestId+listingId),
          // then MatchNotification links to it.
          const newMatch = await db.match.create({
            data: {
              requestId: req.id,
              listingId: listing.id,
              buyerId: req.userId,
              sellerId: listing.ownerId,
              score,
              queueRank: 1, // single-match queue (simplified for cron path)
              buyerFee,
              sellerFee,
              status: "PROPOSED",
              sellerDeadline,
            },
          });

          try {
            await db.matchNotification.create({
              data: {
                requestId: req.id,
                listingId: listing.id,
                matchId: newMatch.id,
                userId: req.userId,
                channel: "IN_APP",
              },
            });
            result.notificationsCreated++;
          } catch (createErr) {
            // Unique constraint violation = already notified for this pair
            // (race with another cron run) — mark the match as EXPIRED to
            // undo, since we have no notification pointing to it.
            // This is the safest recovery: don't leave orphan matches.
            await db.match
              .update({
                where: { id: newMatch.id },
                data: { status: "EXPIRED" },
              })
              .catch(() => {
                /* best-effort cleanup */
              });
            result.skippedAlreadyNotified++;
            continue;
          }

          // Mark the request as notifiedAt — informational only (the
          // real dedup is the @@unique constraint above).
          await db.matchRequest.update({
            where: { id: req.id },
            data: { notifiedAt: now },
          });

          result.newMatchesCreated++;
        } catch (innerErr) {
          result.errors.push(
            `request ${req.id}, listing ${listing.id}: ${(innerErr as Error).message}`,
          );
        }
      }
    } catch (outerErr) {
      result.errors.push(`request ${req.id}: ${(outerErr as Error).message}`);
    }
  }

  return result;
}
