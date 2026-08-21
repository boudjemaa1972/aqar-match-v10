// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Match Lifecycle Scheduler
//
//  Independent service that processes expired matches using the
//  state machine. This is NOT a cron job that runs on page load —
//  it's a standalone service that can be:
//    1. Called via HTTP endpoint (for external cron services)
//    2. Run as a background process
//    3. Triggered by the mini-services scheduler
//
//  The scheduler:
//    1. Finds matches with expired deadlines
//    2. Validates transitions through the state machine
//    3. Executes financial operations (refunds, penalties, apologies)
//    4. Advances the match queue
//
//  Legal basis: Algerian Civil Code, Article 207 (resolutory condition).
// ──────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { attemptTransition, isFinal, type MatchContext } from "./state-machine";
import { calculateBuyerFee } from "@/lib/schemas";
import {
  calculateSellerWithdrawalPenalty,
  calculateSellerPreBuyerWithdrawalRefund,
  calculatePlatformApology,
  calculateBuyerCompensation,
  createSellerPenaltyEntry,
  createSellerPreBuyerRefundEntry,
  createApologyEntry,
  createSellerRefundEntry,
  createBuyerRefundEntry,
  createAutoTimeoutRefundEntry,
  createBuyerCashCompensationEntry,
  createBuyerCreditCompensationEntry,
  createRefundWithBonusEntry,
  type LedgerEntry,
} from "./finance";
import { MatchLifecycleStatus, Action, TIME_WINDOWS, FINAL_STATES } from "./constants";

// ══════════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════════

export interface SchedulerResult {
  processed: number;
  expired: number;
  refunded: number;
  completed: number;
  cancelled: number;
  queueAdvanced: number;
  queueExhausted: number;
  ledgerEntries: LedgerEntry[];
  errors: string[];
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCHEDULER FUNCTION
// ══════════════════════════════════════════════════════════════════

export async function runScheduler(
  now: Date = new Date(),
): Promise<SchedulerResult> {
  const result: SchedulerResult = {
    processed: 0,
    expired: 0,
    refunded: 0,
    completed: 0,
    cancelled: 0,
    queueAdvanced: 0,
    queueExhausted: 0,
    ledgerEntries: [],
    errors: [],
  };

  // ── 1. Find all non-final matches with deadlines ──
  // Use FINAL_STATES from constants.ts instead of a hardcoded duplicate
  // to avoid drift when new terminal states are added.
  const FINAL_STATUS_LIST = Array.from(FINAL_STATES);

  const activeMatches = await db.match.findMany({
    where: {
      status: {
        notIn: FINAL_STATUS_LIST,
      },
    },
    include: { request: true, listing: true },
  });

  for (const match of activeMatches) {
    try {
      const context: MatchContext = {
        status: match.status as MatchLifecycleStatus,
        createdAt: match.createdAt,
        sellerDeadline: match.sellerDeadline,
        buyerDeadline: match.buyerDeadline,
        sellerConfirmDeadline: match.refundEligibleAt,
        buyerAckDeadline: match.refundEligibleAt,
        refundDeadline: match.refundEligibleAt,
        sellerDecisionDeadline: (match as any).sellerDecisionDeadlineAt,
        buyerCompensationDeadline: (match as any).buyerCompensationDeadlineAt,
        meetingAgreementDeadline: (match as any).meetingAgreementDeadlineAt,
      };

      // ── Determine which timed action to attempt ──
      const action = determineTimedAction(
        match.status as MatchLifecycleStatus,
        now,
      );
      if (!action) {
        // No timed action applicable — skip
        continue;
      }

      // ── Attempt transition through state machine ──
      // The state machine will check time conditions internally
      const transition = attemptTransition(context, action, now);

      if (!transition.success) {
        // Time condition not met or invalid transition — skip
        continue;
      }

      result.processed++;

      // ── Execute the transition ──
      await executeTransition(match, transition, result, now);
    } catch (e) {
      result.errors.push(
        `match ${match.id}: ${(e as Error).message}`,
      );
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════
//  DETERMINE TIMED ACTION
// ══════════════════════════════════════════════════════════════════

function determineTimedAction(
  status: MatchLifecycleStatus,
  _now: Date,
): Action | null {
  switch (status) {
    case MatchLifecycleStatus.Proposed:
      return Action.SellerDeadlineExpires;
    case MatchLifecycleStatus.SellerFeePaid:
      return Action.SellerDeadlineExpires;
    case MatchLifecycleStatus.BuyerNotified:
      return Action.BuyerDeadlineExpires;
    case MatchLifecycleStatus.BuyerFeePaid:
      return Action.SellerConfirmWindowExpires;
    case MatchLifecycleStatus.SellerWithdrewPreBuyerPayment:
      return Action.BuyerAckWindowExpires;
    case MatchLifecycleStatus.SellerWithdrewPostBuyerPayment:
      return Action.BuyerAckWindowExpires;
    case MatchLifecycleStatus.BuyerPaymentExpired:
      return Action.SellerDecisionWindowExpires;
    case MatchLifecycleStatus.BuyerCompensatedPending:
      return Action.BuyerCompensationWindowExpires;
    case MatchLifecycleStatus.MeetingAgreementPending:
      return Action.MeetingAgreementWindowExpires;
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════════════
//  EXECUTE TRANSITION
// ══════════════════════════════════════════════════════════════════

async function executeTransition(
  match: any,
  transition: any,
  result: SchedulerResult,
  now: Date,
): Promise<void> {
  const { to, action } = transition;

  // ── Update match status ──
  const updateData: Record<string, any> = { status: to };

  // When entering BuyerPaymentExpired: set 24h seller decision deadline
  if (to === MatchLifecycleStatus.BuyerPaymentExpired) {
    const decisionDeadline = new Date(
      now.getTime() + TIME_WINDOWS.SELLER_DECISION * 60 * 60 * 1000,
    );
    updateData.sellerDecisionDeadlineAt = decisionDeadline;
  }

  // When entering BuyerCompensatedPending: set 24h buyer compensation deadline
  if (to === MatchLifecycleStatus.BuyerCompensatedPending) {
    const compensationDeadline = new Date(
      now.getTime() + TIME_WINDOWS.BUYER_COMPENSATION * 60 * 60 * 1000,
    );
    updateData.buyerCompensationDeadlineAt = compensationDeadline;
  }

  // When entering MeetingAgreementPending: initialize meeting agreement fields
  if (to === MatchLifecycleStatus.MeetingAgreementPending) {
    const meetingDeadline = new Date(
      now.getTime() + TIME_WINDOWS.MEETING_AGREEMENT * 60 * 60 * 1000,
    );
    updateData.meetingAgreementDeadlineAt = meetingDeadline;
    updateData.meetingAgreementStatus = "NotStarted";
  }

  await db.match.update({
    where: { id: match.id },
    data: updateData,
  });

  // ── Update queue status ──
  await db.matchQueue.updateMany({
    where: { matchId: match.id },
    data: { status: "EXPIRED" },
  });

  // ── Execute financial operations based on transition ──
  switch (to) {
    case MatchLifecycleStatus.Rejected:
      // Seller rejected — no financial operation (no fees charged yet)
      break;

    case MatchLifecycleStatus.ExpiredSeller:
      result.expired++;
      // Seller withdrew before paying or deadline expired — full refund
      if (match.sellerFeePaid) {
        const refundEntry = createSellerRefundEntry(
          match.id,
          match.sellerFee,
          "Seller deadline expired — full refund",
        );
        result.ledgerEntries.push(refundEntry);
      }
      break;

    case MatchLifecycleStatus.ExpiredBuyer:
      result.expired++;
      // Buyer didn't pay or rejected — no financial operation
      break;

    case MatchLifecycleStatus.Refunded:
      result.refunded++;
      // Seller didn't confirm contact in 48h after buyer paid
      // Per spec: buyer gets buyer_fee + 0.10 × buyer_fee
      const refundWithBonus = calculateBuyerCompensation(
        match.buyerFee,
        true, // includeOriginalFee = true → buyer_fee + 10% bonus
      );
      const refundEntry = createRefundWithBonusEntry(
        match.id,
        refundWithBonus.amount,
        refundWithBonus.reason,
      );
      result.ledgerEntries.push(refundEntry);
      break;

    case MatchLifecycleStatus.SellerWithdrewPreBuyerPayment:
      // Seller withdrew before buyer paid
      // Per spec: refund = seller_fee - 0.10 × buyer_fee
      const preBuyerRefund = calculateSellerPreBuyerWithdrawalRefund(
        match.sellerFee,
        match.buyerFee,
      );
      const sellerRefundEntry = createSellerPreBuyerRefundEntry(
        match.id,
        preBuyerRefund,
      );
      result.ledgerEntries.push(sellerRefundEntry);
      // NOTE: Notification to buyer happens in service layer
      break;

    case MatchLifecycleStatus.CancelledNoCompensation:
      result.cancelled++;
      // Seller withdrew pre-buyer, buyer ack window expired
      // The deducted 0.10 × buyer_fee stays with the platform — no ledger
      // entry needed because the deduction was never collected as a separate
      // payment; it was held from the seller's refund.
      break;

    case MatchLifecycleStatus.CancelledWithPlatformApology:
      result.cancelled++;
      // Seller withdrew post-buyer, buyer ack window expired
      // Platform issues 5% apology to buyer
      const apology = calculatePlatformApology(match.buyerFee);
      const apologyEntry = createApologyEntry(match.id, apology);
      result.ledgerEntries.push(apologyEntry);
      // Also record seller penalty (full fee forfeited)
      const penalty = calculateSellerWithdrawalPenalty(
        match.sellerFee,
        match.buyerFee,
      );
      const penaltyEntry = createSellerPenaltyEntry(match.id, penalty);
      result.ledgerEntries.push(penaltyEntry);
      break;

    case MatchLifecycleStatus.SellerRefundedFull:
      result.refunded++;
      // Seller chose full refund after buyer default, OR auto-timeout
      // Financial outcome: seller gets full fee back
      const sellerRefund2 = action === Action.SellerDecisionWindowExpires
        ? createAutoTimeoutRefundEntry(
            match.id,
            match.sellerFee,
            "auto_timeout: seller decision window expired — full refund",
          )
        : createSellerRefundEntry(
            match.id,
            match.sellerFee,
            "Seller chose full refund after buyer payment expired",
          );
      result.ledgerEntries.push(sellerRefund2);
      break;

    case MatchLifecycleStatus.SellerAdvance:
      result.completed++;
      // Seller chose to keep fee as advance
      // Platform issues 5% apology to buyer
      const sellerApology = calculatePlatformApology(match.buyerFee);
      const sellerApologyEntry = createApologyEntry(match.id, sellerApology);
      result.ledgerEntries.push(sellerApologyEntry);
      break;

    case MatchLifecycleStatus.BuyerCompensatedCash:
      // Buyer chose cash compensation (0.10 × buyer_fee)
      const cashComp = calculateBuyerCompensation(match.buyerFee, false);
      const cashEntry = createBuyerCashCompensationEntry(match.id, cashComp);
      result.ledgerEntries.push(cashEntry);
      break;

    case MatchLifecycleStatus.BuyerCompensatedCredit:
      // Buyer chose 30-day credit (0.10 × buyer_fee)
      const creditComp = calculateBuyerCompensation(match.buyerFee, false);
      const creditEntry = createBuyerCreditCompensationEntry(
        match.id,
        creditComp,
      );
      result.ledgerEntries.push(creditEntry);
      break;

    case MatchLifecycleStatus.MeetingAgreementFailed:
      result.cancelled++;
      // 7 days passed without meeting agreement
      // Both parties are entitled to a FULL refund of their fees.
      // NOTE: This path has zero platform revenue — both S and B are refunded.
      // Consider adding an administrative deduction (max 5% or 500 DZD)
      // in a future iteration to cover payment processing costs.
      const buyerRefund = createBuyerRefundEntry(
        match.id,
        match.buyerFee,
        "Meeting agreement deadline expired — buyer refund",
      );
      result.ledgerEntries.push(buyerRefund);
      if (match.sellerFeePaid) {
        const sellerRefund = createSellerRefundEntry(
          match.id,
          match.sellerFee,
          "Meeting agreement deadline expired — seller refund",
        );
        result.ledgerEntries.push(sellerRefund);
      }
      break;
  }

  // ── Advance queue ──
  await advanceQueue(match.requestId, result);
}

// ══════════════════════════════════════════════════════════════════
//  ADVANCE QUEUE
// ══════════════════════════════════════════════════════════════════

async function advanceQueue(
  requestId: string,
  result: SchedulerResult,
): Promise<void> {
  const next = await db.matchQueue.findFirst({
    where: { requestId, status: "PENDING" },
    orderBy: { rank: "asc" },
  });

  if (!next) {
    // Queue exhausted
    await db.matchRequest.update({
      where: { id: requestId },
      data: { status: "CLOSED" },
    });
    result.queueExhausted++;
    return;
  }

  // Get listing for fee calculation
  const listing = await db.listing.findUnique({
    where: { id: next.listingId },
  });

  if (!listing) {
    result.errors.push(`advance ${requestId}: listing not found`);
    return;
  }

  const buyerFee = calculateBuyerFee(
    listing.askingPrice,
    listing.intent,
  );

  // Promote to active match
  const now = new Date();
  const sellerDeadline = new Date(
    now.getTime() + TIME_WINDOWS.SELLER_PAYMENT * 60 * 60 * 1000,
  );

  const request = await db.matchRequest.findUnique({
    where: { id: requestId },
  });

  const newMatch = await db.match.create({
    data: {
      requestId,
      listingId: next.listingId,
      buyerId: request?.userId || "",
      sellerId: listing.ownerId,
      score: next.score,
      queueRank: next.rank,
      buyerFee,
      sellerFee: listing.sellerFee,
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
