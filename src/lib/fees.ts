// ──────────────────────────────────────────────────────────────────
//  Fee logic per account category (3-tier business model).
//
//  INDIVIDUAL → pay-per-deal fixed fee (existing calculateSellerFee/BuyerFee)
//  AGENCY     → subscription-based, no per-deal fee (subscription covers all)
//  DEVELOPER  → commission-based, no upfront fee, commission on deal close
//
//  CROSS-CATEGORY MATCHES:
//    • INDIVIDUAL ↔ AGENCY  → individual pays their fee, agency exempt
//    • INDIVIDUAL ↔ DEVELOPER → individual pays their fee, developer has
//      NO contact reveal (chat + viewing only), commission on deal close
//    • AGENCY ↔ DEVELOPER   → both exempt from per-deal fees
// ──────────────────────────────────────────────────────────────────

import type { AccountCategory } from "./schemas";

/**
 * Returns true if the given party is exempt from per-deal fees.
 * - AGENCY with active subscription → exempt
 * - DEVELOPER → exempt (commission-based, not fee-based)
 * - INDIVIDUAL → NOT exempt (pays per deal)
 */
export function isExemptFromPerDealFee(category: AccountCategory | undefined | null): boolean {
  if (!category) return false;
  return category === "AGENCY" || category === "DEVELOPER";
}

/**
 * Returns true if contact reveal is STRUCTURALLY BLOCKED for this party.
 * Only DEVELOPER category — this is a deliberate business model decision:
 * developers' contact info is never revealed; communication happens
 * exclusively via internal chat + scheduled viewings.
 */
export function isContactRevealBlocked(category: AccountCategory | undefined | null): boolean {
  return category === "DEVELOPER";
}

/**
 * Check if either party in a match is a DEVELOPER.
 * If so, contact reveal is blocked regardless of the other party's category.
 */
export function shouldBlockContactReveal(
  sellerCategory: AccountCategory | undefined | null,
  buyerCategory: AccountCategory | undefined | null,
): boolean {
  return isContactRevealBlocked(sellerCategory) || isContactRevealBlocked(buyerCategory);
}

/**
 * Calculate commission for a DEVELOPER deal.
 * @param dealValue — actual transaction value in DZD
 * @param commissionRate — percentage (e.g., 2.5 means 2.5%)
 * @returns commission amount in DZD
 */
export function calculateDeveloperCommission(dealValue: number, commissionRate: number): number {
  return Math.round((dealValue * commissionRate) / 100);
}

// ══════════════════════════════════════════════════════════════════
//  PROMOTIONAL OFFERS (Nitro Offer)
// ══════════════════════════════════════════════════════════════════
// Time-limited discounts that integrate with the 3-tier fee model.
// Admin controls start/end/maxRedemptions/active via /api/admin/offers.

export interface ActiveOffer {
  id: string;
  code: string;
  category: "INDIVIDUAL" | "AGENCY" | "DEVELOPER";
  discountType: "PERCENTAGE" | "FIXED_WAIVER" | "FREE_TRIAL_DAYS";
  discountValue: number;
  maxRedemptions: number | null;
  redemptionsUsed: number;
  endsAt: Date;
  remaining: number | null; // remaining redemptions (null = unlimited)
  daysRemaining: number; // days until endsAt
}

/**
 * Fetches the active promotional offer for a given category.
 * Returns null if no offer is active (expired, maxed out, or manually disabled).
 * Called server-side only (uses Prisma).
 */
export async function getActiveOffer(
  category: "INDIVIDUAL" | "AGENCY" | "DEVELOPER",
): Promise<ActiveOffer | null> {
  const { db } = await import("./db");
  const now = new Date();

  const offer = await db.promotionalOffer.findFirst({
    where: {
      category,
      active: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [
        { maxRedemptions: null },
        { redemptionsUsed: { lt: db.promotionalOffer.fields.maxRedemptions } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!offer) return null;

  const remaining =
    offer.maxRedemptions !== null
      ? Math.max(0, offer.maxRedemptions - offer.redemptionsUsed)
      : null;

  const daysRemaining = Math.ceil(
    (offer.endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );

  return {
    id: offer.id,
    code: offer.code,
    category: offer.category,
    discountType: offer.discountType as "PERCENTAGE" | "FIXED_WAIVER" | "FREE_TRIAL_DAYS",
    discountValue: offer.discountValue,
    maxRedemptions: offer.maxRedemptions,
    redemptionsUsed: offer.redemptionsUsed,
    endsAt: offer.endsAt,
    remaining,
    daysRemaining,
  };
}

/**
 * Applies a promotional offer discount to a fee amount.
 * @param originalFee — the fee before discount
 * @param offer — the active promotional offer (or null)
 * @returns { finalFee, originalFee, hasDiscount }
 */
export function applyOfferDiscount(
  originalFee: number,
  offer: ActiveOffer | null,
): { finalFee: number; originalFee: number; hasDiscount: boolean } {
  if (!offer) {
    return { finalFee: originalFee, originalFee, hasDiscount: false };
  }

  if (offer.discountType === "PERCENTAGE") {
    const discount = Math.round((originalFee * offer.discountValue) / 100);
    return {
      finalFee: Math.max(0, originalFee - discount),
      originalFee,
      hasDiscount: true,
    };
  }

  if (offer.discountType === "FIXED_WAIVER") {
    return {
      finalFee: Math.max(0, originalFee - offer.discountValue),
      originalFee,
      hasDiscount: true,
    };
  }

  // FREE_TRIAL_DAYS doesn't affect per-deal fees (used for AGENCY subscriptions)
  return { finalFee: originalFee, originalFee, hasDiscount: false };
}

/**
 * Records an offer redemption atomically (increments redemptionsUsed
 * only if the offer is still valid — prevents race conditions).
 * Returns true if redemption was recorded, false if offer expired/maxed.
 */
export async function redeemOffer(
  offerId: string,
  userId: string,
  matchId?: string,
): Promise<boolean> {
  const { db } = await import("./db");
  const now = new Date();

  // Atomic increment with guard — only updates if still valid
  const result = await db.promotionalOffer.updateMany({
    where: {
      id: offerId,
      active: true,
      endsAt: { gte: now },
      OR: [
        { maxRedemptions: null },
        { redemptionsUsed: { lt: db.promotionalOffer.fields.maxRedemptions } },
      ],
    },
    data: { redemptionsUsed: { increment: 1 } },
  });

  if (result.count === 0) return false; // offer expired or maxed

  // Record the redemption
  await db.offerRedemption.create({
    data: { offerId, userId, matchId: matchId || null },
  }).catch(() => {
    // Unique constraint violation = already redeemed for this match — that's OK
  });

  return true;
}
