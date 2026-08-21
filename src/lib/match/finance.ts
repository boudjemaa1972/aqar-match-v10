// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Financial Calculations
//
//  Implements ALL financial operations for the match lifecycle:
//    1. Seller Withdrawal Penalty — deduction from seller's fee
//       (when seller withdraws AFTER buyer paid — full forfeit)
//    2. Seller Pre-Buyer Withdrawal Refund — partial refund
//       (when seller withdraws BEFORE buyer pays — refund minus 10%)
//    3. Buyer Compensation — cash or credit
//       (0.10 × buyer_fee — awarded when seller withdraws pre-buyer
//        and buyer acknowledges, or when seller fails to confirm)
//    4. Platform Apology to Buyer — 5% credit from platform
//       (when seller withdraws post-buyer and buyer ack window expires)
//
//  These are SEPARATE functions by design (as required by spec):
//    • calculateSellerWithdrawalPenalty — full forfeit (post-buyer)
//    • calculateSellerPreBuyerWithdrawalRefund — partial refund (pre-buyer)
//    • calculateBuyerCompensation — 0.10 × buyer_fee (cash or credit)
//    • calculatePlatformApology — 5% apology
//
//  Financial rule (Section3 of spec):
//    All percentages (10%, 5%) are calculated on buyer_fee as the
//    reference unit: 0.10 × buyer_fee = 10% of buyer fee = 5% of seller fee
//
//  Legal basis: Algerian Civil Code, Article 207 (resolutory condition).
// ──────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════════

export interface FeeBreakdown {
  sellerFee: number;
  buyerFee: number;
}

export interface WithdrawalPenalty {
  /** Amount deducted from seller's fee (seller loses this) */
  deduction: number;
  /** Remaining seller fee after deduction */
  remainingSellerFee: number;
  /** Whether seller fee is fully consumed */
  fullyConsumed: boolean;
  /** Reason for the penalty */
  reason: string;
}

export interface SellerPreBuyerRefund {
  /** Amount refunded to seller: seller_fee - 0.10 × buyer_fee */
  refundAmount: number;
  /** Amount deducted as potential compensation: 0.10 × buyer_fee */
  deduction: number;
  /** Reason */
  reason: string;
}

export interface BuyerCompensation {
  /** Amount the buyer receives: 0.10 × buyer_fee */
  amount: number;
  /** The buyer's original fee (for reference) */
  originalBuyerFee: number;
  /** Reason */
  reason: string;
}

export interface PlatformApology {
  /** Amount the platform pays to the buyer as apology */
  apologyAmount: number;
  /** Percentage used (5% of buyer fee) */
  percentage: number;
  /** Reason for the apology */
  reason: string;
  /** The buyer's original fee (for reference) */
  originalBuyerFee: number;
}

// ══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════════

/** 10% of buyer fee — used for withdrawal deduction and buyer bonus */
const PENALTY_PERCENTAGE = 0.10;

/** Platform apology percentage — 5% of buyer fee */
const APOLOGY_PERCENTAGE = 0.05;

/** Minimum apology amount in DZD */
const MIN_APOLOGY_DZD = 500;

// ══════════════════════════════════════════════════════════════════
//  FUNCTION 1: Seller Withdrawal Penalty (post-buyer-payment)
// ══════════════════════════════════════════════════════════════════
//  When the seller withdraws AFTER the buyer has paid their fee,
//  the seller forfeits their ENTIRE fee. This is a DEDUCTION from
//  the seller's fee, recorded as a separate Payment entry in the ledger.
//
//  This is DISTINCT from the platform apology — the seller's
//  penalty goes to the platform, not to the buyer.
//
//  @param sellerFee - The seller's original fee amount
//  @param buyerFee - The buyer's fee amount (for reference)
//  @returns WithdrawalPenalty with deduction details
// ══════════════════════════════════════════════════════════════════

export function calculateSellerWithdrawalPenalty(
  sellerFee: number,
  buyerFee: number,
): WithdrawalPenalty {
  const deduction = sellerFee;
  const remainingSellerFee = 0;
  const fullyConsumed = true;

  return {
    deduction,
    remainingSellerFee,
    fullyConsumed,
    reason: "Seller withdrew after buyer payment — full fee forfeited",
  };
}

// ══════════════════════════════════════════════════════════════════
//  FUNCTION 2: Seller Pre-Buyer Withdrawal Refund
// ══════════════════════════════════════════════════════════════════
//  When the seller withdraws BEFORE the buyer has paid their fee,
//  the seller receives a PARTIAL refund:
//    refund = seller_fee - 0.10 × buyer_fee
//  The deducted amount (0.10 × buyer_fee) stays with the platform
//  as potential compensation for the buyer.
//
//  Per the spec: "ينسحب البائع قبل دفع المشتري"
//    → يرد للبائع: seller_fee - 0.10 × buyer_fee
//    → المبلغ المخصوم يبقى مرتبطًا بالـ Match كتعويض محتمل
//
//  @param sellerFee - The seller's original fee amount
//  @param buyerFee - The buyer's fee amount (for percentage calculation)
//  @returns SellerPreBuyerRefund with refund and deduction details
// ══════════════════════════════════════════════════════════════════

export function calculateSellerPreBuyerWithdrawalRefund(
  sellerFee: number,
  buyerFee: number,
): SellerPreBuyerRefund {
  const deduction = Math.round(buyerFee * PENALTY_PERCENTAGE);
  const refundAmount = Math.max(0, sellerFee - deduction);

  return {
    refundAmount,
    deduction,
    reason:
      "Seller withdrew before buyer paid — partial refund, 10% held as potential compensation",
  };
}

// ══════════════════════════════════════════════════════════════════
//  FUNCTION 3: Buyer Compensation
// ══════════════════════════════════════════════════════════════════
//  When the buyer is entitled to compensation:
//    - Seller withdrew pre-buyer AND buyer acknowledged → 0.10 × buyer_fee
//    - Seller failed to confirm contact → buyer_fee + 0.10 × buyer_fee
//
//  The buyer can choose between:
//    - Cash refund: immediate payment of the compensation
//    - Credit: 30-day platform credit (same amount, different form)
//
//  Per the spec: "أكد → يختار: تعويض فوري 0.10 × buyer_fee أو Credit 30 يومًا"
//
//  @param buyerFee - The buyer's original fee amount
//  @param includeOriginalFee - If true, also refund the original buyer_fee
//                             (used for seller-fails-to-confirm path)
//  @returns BuyerCompensation with amount details
// ══════════════════════════════════════════════════════════════════

export function calculateBuyerCompensation(
  buyerFee: number,
  includeOriginalFee: boolean = false,
): BuyerCompensation {
  const bonus = Math.round(buyerFee * PENALTY_PERCENTAGE);
  const amount = includeOriginalFee ? buyerFee + bonus : bonus;

  return {
    amount,
    originalBuyerFee: buyerFee,
    reason: includeOriginalFee
      ? "Seller failed to confirm contact — buyer refund + 10% bonus"
      : "Seller withdrew before buyer paid — 10% compensation",
  };
}

// ══════════════════════════════════════════════════════════════════
//  FUNCTION 4: Platform Apology to Buyer
// ══════════════════════════════════════════════════════════════════
//  When the seller withdraws AFTER the buyer has paid and the buyer
//  doesn't acknowledge contact within 48h, the platform issues a
//  5% apology credit to the buyer. This is a SEPARATE payment
//  from the platform, recorded as a distinct ledger entry.
//
//  @param buyerFee - The buyer's original fee amount
//  @returns PlatformApology with apology amount details
// ══════════════════════════════════════════════════════════════════

export function calculatePlatformApology(
  buyerFee: number,
): PlatformApology {
  const apologyAmount = Math.max(
    MIN_APOLOGY_DZD,
    Math.round(buyerFee * APOLOGY_PERCENTAGE),
  );

  return {
    apologyAmount,
    percentage: APOLOGY_PERCENTAGE,
    reason:
      "Platform apology — seller withdrew, buyer ack window expired",
    originalBuyerFee: buyerFee,
  };
}

// ══════════════════════════════════════════════════════════════════
//  LEDGER ENTRY TYPES
// ══════════════════════════════════════════════════════════════════
//  Each financial operation creates a Payment entry in the ledger.
//  The `payer` and `payee` fields identify who paid and who received.
// ══════════════════════════════════════════════════════════════════

export type PaymentPayer = "BUYER" | "SELLER" | "PLATFORM";
export type PaymentPayee = "BUYER" | "SELLER" | "PLATFORM";

export interface LedgerEntry {
  matchId: string;
  payer: PaymentPayer;
  payee: PaymentPayee;
  amount: number;
  type:
    | "FEE_PAYMENT"
    | "SELLER_WITHDRAWAL_PENALTY"
    | "SELLER_PRE_BUYER_REFUND"
    | "BUYER_COMPENSATION_CASH"
    | "BUYER_COMPENSATION_CREDIT"
    | "PLATFORM_APOLOGY"
    | "REFUND"
    | "REFUND_WITH_BONUS";
  description: string;
}

/**
 * Create a ledger entry for seller withdrawal penalty (post-buyer).
 */
export function createSellerPenaltyEntry(
  matchId: string,
  penalty: WithdrawalPenalty,
): LedgerEntry {
  return {
    matchId,
    payer: "SELLER",
    payee: "PLATFORM",
    amount: penalty.deduction,
    type: "SELLER_WITHDRAWAL_PENALTY",
    description: penalty.reason,
  };
}

/**
 * Create a ledger entry for seller pre-buyer withdrawal refund.
 * Refund goes from PLATFORM → SELLER.
 */
export function createSellerPreBuyerRefundEntry(
  matchId: string,
  refund: SellerPreBuyerRefund,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "SELLER",
    amount: refund.refundAmount,
    type: "SELLER_PRE_BUYER_REFUND",
    description: refund.reason,
  };
}

/**
 * Create a ledger entry for buyer cash compensation.
 */
export function createBuyerCashCompensationEntry(
  matchId: string,
  compensation: BuyerCompensation,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "BUYER",
    amount: compensation.amount,
    type: "BUYER_COMPENSATION_CASH",
    description: compensation.reason,
  };
}

/**
 * Create a ledger entry for buyer credit compensation (30-day).
 */
export function createBuyerCreditCompensationEntry(
  matchId: string,
  compensation: BuyerCompensation,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "BUYER",
    amount: compensation.amount,
    type: "BUYER_COMPENSATION_CREDIT",
    description: `[credit_30d] ${compensation.reason}`,
  };
}

/**
 * Create a ledger entry for platform apology to buyer.
 */
export function createApologyEntry(
  matchId: string,
  apology: PlatformApology,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "BUYER",
    amount: apology.apologyAmount,
    type: "PLATFORM_APOLOGY",
    description: apology.reason,
  };
}

/**
 * Create a ledger entry for buyer refund with 10% bonus.
 * Used when seller fails to confirm contact after buyer paid.
 */
export function createRefundWithBonusEntry(
  matchId: string,
  amount: number,
  reason: string,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "BUYER",
    amount,
    type: "REFUND_WITH_BONUS",
    description: reason,
  };
}

/**
 * Create a ledger entry for seller refund (full — deadline expiry).
 */
export function createSellerRefundEntry(
  matchId: string,
  amount: number,
  reason: string,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "SELLER",
    amount,
    type: "REFUND",
    description: reason,
  };
}

/**
 * Create a ledger entry for auto-timeout refund.
 * Same financial outcome as createSellerRefundEntry, but tagged
 * with 'auto_timeout' for audit distinction.
 */
export function createAutoTimeoutRefundEntry(
  matchId: string,
  amount: number,
  reason: string,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "SELLER",
    amount,
    type: "REFUND",
    description: `[auto_timeout] ${reason}`,
  };
}

/**
 * Create a ledger entry for buyer refund (PLATFORM → BUYER).
 * Used when buyer is entitled to a full refund (e.g., meeting agreement failed).
 */
export function createBuyerRefundEntry(
  matchId: string,
  amount: number,
  reason: string,
): LedgerEntry {
  return {
    matchId,
    payer: "PLATFORM",
    payee: "BUYER",
    amount,
    type: "REFUND",
    description: reason,
  };
}
