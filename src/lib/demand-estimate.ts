// ──────────────────────────────────────────────────────────────────
//  Demand Estimate — aggregated count of active buyer requests
//  matching a seller's intended listing criteria.
//
//  PRIVACY MODEL (non-negotiable):
//  ─────────────────────────────────────────────
//  • Returns an AGGREGATE COUNT only — never identities, never
//    precise criteria, never anything that could re-identify a
//    specific buyer.
//  • If the count is below MIN_PUBLIC_COUNT (3), returns a
//    qualitative "low" bucket instead of the exact number — this
//    prevents an attacker from querying narrow criteria and
//    inferring that "exactly 1 specific buyer exists".
//  • No buyer PII, no budget specifics, no contact info — ever.
//
//  RATE LIMITING:
//  ─────────────
//  Public endpoint (no auth) — must be rate-limited to prevent
//  market-intel scraping by competitors. Limit is enforced in
//  the API route via a per-IP sliding window.
// ──────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { decryptJSON } from "@/lib/crypto";
import type { PropertyIntent, PropertyType } from "@/lib/schemas";

// Minimum count below which we return a qualitative label instead
// of the exact number — protects low-volume segments from deanonymization.
export const MIN_PUBLIC_COUNT = 3;

// Max age of a request to be considered "active demand" — 30 days.
// After 30 days without a match, the buyer has likely moved on.
const REQUEST_ACTIVE_AGE_DAYS = 30;

export interface DemandEstimateInput {
  intent: PropertyIntent;
  propertyType: PropertyType;
  wilaya: string;
  commune?: string | null;
  // The seller's intended asking price — used to filter by buyer's
  // maxBudget ≥ askingPrice × 0.8 (loose overlap so buyers with slightly
  // lower budgets still count, since seller's secretMin may be lower).
  // For SEASONAL_RENT, this is pricePerNight instead.
  askingPrice?: number;
}

export interface DemandEstimateResult {
  // Exact count if ≥ MIN_PUBLIC_COUNT, otherwise null (qualitative).
  count: number | null;
  // Qualitative bucket: "high" | "medium" | "low" | "none"
  bucket: "high" | "medium" | "low" | "none";
  // True if count is below the privacy threshold.
  isBelowThreshold: boolean;
  // Whether commune was used as a filter (affects confidence).
  scopedToCommune: boolean;
}

/**
 * Estimate the number of active buyer requests matching the given
 * listing criteria. Returns an aggregated count only.
 *
 * Matching logic:
 *   1. intent === req.intent (SELL/RENT/SEASONAL_RENT)
 *   2. type === req.type
 *   3. city === req.city (wilaya)
 *   4. commune match IF provided AND req.commune is set (otherwise
 *      we match any commune in that wilaya for broader demand)
 *   5. buyer's maxBudget ≥ seller's askingPrice × 0.8 (loose overlap)
 *
 * Notes:
 *   - Only OPEN and FULFILLED requests within the last 30 days are counted.
 *   - CLOSED requests are excluded (buyer is no longer looking).
 *   - Budget is stored encrypted (maxBudgetEnc) — we decrypt in-memory
 *     only for the count, never log or return it.
 */
export async function estimateDemandForListing(
  input: DemandEstimateInput,
): Promise<DemandEstimateResult> {
  const since = new Date(
    Date.now() - REQUEST_ACTIVE_AGE_DAYS * 24 * 60 * 60 * 1000,
  );

  // Fetch candidate requests — broad filter on indexed columns only.
  // The commune and budget filters are applied in JS after decryption
  // (because maxBudgetEnc is encrypted, can't filter in SQL).
  const candidates = await db.matchRequest.findMany({
    where: {
      intent: input.intent,
      type: input.propertyType,
      city: input.wilaya,
      status: { in: ["OPEN", "FULFILLED"] },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      commune: true,
      maxBudgetEnc: true,
    },
  });

  // If no candidates at all → return "none" early.
  if (candidates.length === 0) {
    return {
      count: 0,
      bucket: "none",
      isBelowThreshold: false,
      scopedToCommune: !!input.commune,
    };
  }

  // Apply commune filter (if seller specified one, only count requests
  // for that commune OR requests that didn't specify a commune — those
  // are "broad search" buyers interested in the whole wilaya).
  let filtered = candidates;
  if (input.commune) {
    filtered = candidates.filter(
      (r) => !r.commune || r.commune === input.commune,
    );
  }

  // Apply budget filter: count requests where buyer's maxBudget ≥ 80%
  // of seller's askingPrice (loose overlap — buyer's budget reaches
  // the seller's approximate range). If askingPrice is not provided,
  // skip budget filter (count all matching type/location).
  const BUDGET_OVERLAP_RATIO = 0.8;
  let matchCount = 0;
  if (input.askingPrice && input.askingPrice > 0) {
    const minBudgetToMatch = Math.round(input.askingPrice * BUDGET_OVERLAP_RATIO);
    for (const r of filtered) {
      if (!r.maxBudgetEnc) continue;
      try {
        const decrypted = await decryptJSON<{ maxBudget: number }>(r.maxBudgetEnc);
        if (decrypted && typeof decrypted.maxBudget === "number") {
          if (decrypted.maxBudget >= minBudgetToMatch) {
            matchCount++;
          }
        }
      } catch {
        // Skip un-decryptable rows (corrupt data) — shouldn't happen.
      }
    }
  } else {
    // No askingPrice provided — count all type/location matches.
    matchCount = filtered.length;
  }

  // Apply privacy threshold.
  if (matchCount < MIN_PUBLIC_COUNT) {
    return {
      count: null, // hidden for privacy
      bucket: matchCount === 0 ? "none" : "low",
      isBelowThreshold: true,
      scopedToCommune: !!input.commune,
    };
  }

  // Bucket the count for display.
  let bucket: "high" | "medium" | "low" | "none";
  if (matchCount >= 20) bucket = "high";
  else if (matchCount >= 8) bucket = "medium";
  else bucket = "low"; // 3..7

  return {
    count: matchCount,
    bucket,
    isBelowThreshold: false,
    scopedToCommune: !!input.commune,
  };
}
