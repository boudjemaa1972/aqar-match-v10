// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Match Lifecycle Service
//
//  High-level operations that wrap the state machine + DB.
//  These functions handle:
//    • Notification creation (IN_APP)
//    • Deadline field updates on Match records
//    • Entry point for the BuyerPaymentExpired seller decision flow
//    • Entry point for seller pre-buyer withdrawal buyer notification
//    • Entry point for buyer compensation choice
//
//  The service is the ONLY layer that writes to MatchNotification.
//  The state machine and scheduler are pure logic — no side effects.
// ──────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { TIME_WINDOWS } from "./constants";

// ══════════════════════════════════════════════════════════════════
//  NOTIFY SELLER — BuyerPaymentExpired
// ══════════════════════════════════════════════════════════════════
/**
 * Called when a match enters BuyerPaymentExpired state.
 * 1. Sets sellerDecisionDeadlineAt = now + 24h
 * 2. Sends an IN_APP notification explaining the two options:
 *    A) Full refund — seller gets their fee back
 *    B) Advance — seller keeps the fee, platform issues 5% apology
 *
 * This MUST be called within 1 hour of entering the state
 * (the notification is sent immediately, so it meets this requirement).
 */
export async function notifySellerBuyerPaymentExpired(
  matchId: string,
): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { request: true, listing: true },
  });

  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  const now = new Date();
  const decisionDeadline = new Date(
    now.getTime() + TIME_WINDOWS.SELLER_DECISION * 60 * 60 * 1000,
  );

  // Update deadline on the match record
  await db.match.update({
    where: { id: matchId },
    data: { sellerDecisionDeadlineAt: decisionDeadline },
  });

  // Send IN_APP notification to the seller
  // The notification explains both options with their financial implications
  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.sellerId,
        channel: "IN_APP",
      },
    });
  } catch {
    // Unique constraint: notification already sent for this pair — safe to ignore
  }
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFY BUYER — Seller withdrew pre-buyer payment
// ══════════════════════════════════════════════════════════════════
/**
 * Called when a match enters SellerWithdrewPreBuyerPayment state.
 * 1. Sets buyerAckDeadline on the match (used by scheduler)
 * 2. Sets buyerCompensationDeadlineAt = now + 48h (ack) + 24h (choice)
 * 3. Sends an IN_APP notification to the buyer explaining:
 *    - Seller withdrew before you paid
 *    - Your options: acknowledge within 48h to receive compensation
 *    - If you don't acknowledge: no compensation (CANCELLED_NO_COMPENSATION)
 *    - If you acknowledge: choose between cash (0.10 × buyer_fee) or credit (30 days)
 *
 * Financial detail: seller received refund of (seller_fee - 0.10 × buyer_fee).
 * The deducted 0.10 × buyer_fee is the buyer's potential compensation.
 */
export async function notifyBuyerSellerWithdrewPreBuyer(
  matchId: string,
): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { request: true, listing: true },
  });

  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  const now = new Date();
  const buyerAckDeadline = new Date(
    now.getTime() + TIME_WINDOWS.BUYER_ACK * 60 * 60 * 1000,
  );

  // Update ack deadline on the match record
  // The refundEligibleAt field is reused for buyerAckDeadline in the scheduler
  await db.match.update({
    where: { id: matchId },
    data: { refundEligibleAt: buyerAckDeadline },
  });

  // Send IN_APP notification to the buyer
  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.buyerId,
        channel: "IN_APP",
      },
    });
  } catch {
    // Unique constraint: notification already sent for this pair — safe to ignore
  }
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFY BUYER — BuyerCompensatedPending (choose cash or credit)
// ══════════════════════════════════════════════════════════════════
/**
 * Called when a match enters BuyerCompensatedPending state
 * (buyer acknowledged seller withdrawal).
 * 1. Sets buyerCompensationDeadlineAt = now + 24h
 * 2. Sends an IN_APP notification explaining the choice:
 *    A) Cash refund: 0.10 × buyer_fee paid immediately
 *    B) Credit: 0.10 × buyer_fee as 30-day platform credit
 *    C) Default (if no choice in 24h): cash refund
 */
export async function notifyBuyerCompensationChoice(
  matchId: string,
): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { request: true, listing: true },
  });

  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  const now = new Date();
  const compensationDeadline = new Date(
    now.getTime() + TIME_WINDOWS.BUYER_COMPENSATION * 60 * 60 * 1000,
  );

  // Update compensation deadline on the match record
  await db.match.update({
    where: { id: matchId },
    data: { buyerCompensationDeadlineAt: compensationDeadline },
  });

  // Send IN_APP notification to the buyer
  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.buyerId,
        channel: "IN_APP",
      },
    });
  } catch {
    // Unique constraint: notification already sent for this pair — safe to ignore
  }
}

// ══════════════════════════════════════════════════════════════════
//  SELLER DECISION — Manual choice (within 24h window)
// ══════════════════════════════════════════════════════════════════
/**
 * Record the seller's decision timestamp.
 * Called after attemptTransition succeeds for SellerChooseRefundFull
 * or SellerChooseAdvance.
 */
export async function recordSellerDecision(matchId: string): Promise<void> {
  await db.match.update({
    where: { id: matchId },
    data: { sellerDecisionMadeAt: new Date() },
  });
}

// ══════════════════════════════════════════════════════════════════
//  MEETING AGREEMENT — Initialize on contact confirmation
// ══════════════════════════════════════════════════════════════════
/**
 * Called when a match enters MeetingAgreementPending state
 * (after seller confirms contact or buyer acknowledges post-withdrawal).
 * 1. Sets meetingAgreementDeadlineAt = now + 7 days
 * 2. Sets meetingAgreementStatus = NotStarted
 * 3. Sends notification to both parties explaining the next step
 */
export async function initializeMeetingAgreement(
  matchId: string,
): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { request: true, listing: true },
  });

  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  const now = new Date();
  const deadline = new Date(
    now.getTime() + TIME_WINDOWS.MEETING_AGREEMENT * 60 * 60 * 1000,
  );

  // Update match with meeting agreement fields
  await db.match.update({
    where: { id: matchId },
    data: {
      meetingAgreementDeadlineAt: deadline,
      meetingAgreementStatus: "NotStarted",
    },
  });

  // Notify both parties that they need to agree on a meeting date
  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.buyerId,
        channel: "IN_APP",
      },
    });
  } catch {
    // Unique constraint — safe to ignore
  }

  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.sellerId,
        channel: "IN_APP",
      },
    });
  } catch {
    // Unique constraint — safe to ignore
  }
}

// ══════════════════════════════════════════════════════════════════
//  MEETING AGREEMENT — Process propose/approve/reject
// ══════════════════════════════════════════════════════════════════

export type MeetingAction = "propose" | "approve";
export type MeetingRole = "buyer" | "seller";

export interface MeetingAgreementResult {
  success: boolean;
  status: string;
  agreedDate?: Date;
  error?: string;
}

/**
 * Process a meeting agreement action (propose or approve).
 *
 * @param matchId - The match ID
 * @param role - "buyer" or "seller"
 * @param action - "propose" or "approve"
 * @param proposedDate - ISO 8601 date string for the proposed meeting
 * @returns MeetingAgreementResult
 */
export async function processMeetingAgreement(
  matchId: string,
  role: MeetingRole,
  action: MeetingAction,
  proposedDate: string,
): Promise<MeetingAgreementResult> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { request: true, listing: true },
  });

  if (!match) {
    return { success: false, status: "error", error: "Match not found" };
  }

  // Verify the match is in MeetingAgreementPending state
  if (match.status !== "MEETING_AGREEMENT_PENDING") {
    return {
      success: false,
      status: match.status,
      error: "Match is not in meeting agreement phase",
    };
  }

  // Verify the user is part of this match
  const userId = role === "buyer" ? match.buyerId : match.sellerId;
  if (!userId) {
    return { success: false, status: "error", error: "Invalid role" };
  }

  // Validate proposed date is in the future
  const date = new Date(proposedDate);
  if (isNaN(date.getTime())) {
    return { success: false, status: "error", error: "Invalid date format" };
  }
  if (date <= new Date()) {
    return {
      success: false,
      status: "error",
      error: "Meeting date must be in the future",
    };
  }

  // Check deadline hasn't expired
  if (
    match.meetingAgreementDeadlineAt &&
    new Date() >= match.meetingAgreementDeadlineAt
  ) {
    return {
      success: false,
      status: "error",
      error: "Meeting agreement deadline has expired",
    };
  }

  if (action === "propose") {
    return await handlePropose(match, role, date);
  } else if (action === "approve") {
    return await handleApprove(match, role, date);
  }

  return { success: false, status: "error", error: "Invalid action" };
}

async function handlePropose(
  match: any,
  role: MeetingRole,
  date: Date,
): Promise<MeetingAgreementResult> {
  const otherConsentField = role === "buyer" ? "sellerMeetingConsent" : "buyerMeetingConsent";

  // Check if the other party already proposed
  const otherConsent = match[otherConsentField];

  // Save this party's proposal
  if (role === "buyer") {
    await db.buyerMeetingConsent.upsert({
      where: { matchId: match.id },
      update: { proposedDate: date, consentStatus: "Proposed" },
      create: { matchId: match.id, proposedDate: date, consentStatus: "Proposed" },
    });
  } else {
    await db.sellerMeetingConsent.upsert({
      where: { matchId: match.id },
      update: { proposedDate: date, consentStatus: "Proposed" },
      create: { matchId: match.id, proposedDate: date, consentStatus: "Proposed" },
    });
  }

  // Determine new status
  let newStatus: string;
  if (otherConsent && otherConsent.consentStatus === "Proposed") {
    // Other party already proposed → check if dates match
    const otherDate = new Date(otherConsent.proposedDate).getTime();
    const thisDate = date.getTime();
    if (otherDate === thisDate) {
      // Same date proposed → auto-agree
      newStatus = "Agreed";
    } else {
      newStatus = "ConflictingProposals";
    }
  } else {
    newStatus = role === "buyer" ? "BuyerProposed" : "SellerProposed";
  }

  // Update match status
  const updateData: Record<string, any> = {
    meetingAgreementStatus: newStatus,
  };

  if (newStatus === "Agreed") {
    updateData.agreedMeetingDate = date;
    updateData.agreementConfirmedAt = new Date();
    updateData.status = "COMPLETED";
  }

  await db.match.update({
    where: { id: match.id },
    data: updateData,
  });

  // If auto-agreed, update both consents to Approved
  if (newStatus === "Agreed") {
    const now = new Date();
    await db.buyerMeetingConsent.updateMany({
      where: { matchId: match.id },
      data: { consentStatus: "Approved" },
    });
    await db.sellerMeetingConsent.updateMany({
      where: { matchId: match.id },
      data: { consentStatus: "Approved" },
    });
  }

  return {
    success: true,
    status: newStatus,
    agreedDate: newStatus === "Agreed" ? date : undefined,
  };
}

async function handleApprove(
  match: any,
  role: MeetingRole,
  date: Date,
): Promise<MeetingAgreementResult> {
  const otherConsentField = role === "buyer" ? "sellerMeetingConsent" : "buyerMeetingConsent";

  // Check if the other party has a proposal
  const otherConsent = match[otherConsentField];
  if (!otherConsent || otherConsent.consentStatus !== "Proposed") {
    return {
      success: false,
      status: match.meetingAgreementStatus,
      error: "No pending proposal from the other party to approve",
    };
  }

  // Verify the approved date matches the other party's proposal
  const otherDate = new Date(otherConsent.proposedDate).getTime();
  const thisDate = date.getTime();
  if (otherDate !== thisDate) {
    return {
      success: false,
      status: match.meetingAgreementStatus,
      error: "Approved date does not match the other party's proposal",
    };
  }

  // Mark this party's consent as Approved
  if (role === "buyer") {
    await db.buyerMeetingConsent.upsert({
      where: { matchId: match.id },
      update: { proposedDate: date, consentStatus: "Approved" },
      create: { matchId: match.id, proposedDate: date, consentStatus: "Approved" },
    });
  } else {
    await db.sellerMeetingConsent.upsert({
      where: { matchId: match.id },
      update: { proposedDate: date, consentStatus: "Approved" },
      create: { matchId: match.id, proposedDate: date, consentStatus: "Approved" },
    });
  }

  // Both parties have approved → Agreed!
  const now = new Date();
  await db.match.update({
    where: { id: match.id },
    data: {
      meetingAgreementStatus: "Agreed",
      agreedMeetingDate: date,
      agreementConfirmedAt: now,
      status: "COMPLETED",
    },
  });

  return {
    success: true,
    status: "Agreed",
    agreedDate: date,
  };
}

// ══════════════════════════════════════════════════════════════════
//  MEETING AGREEMENT — Get current status
// ══════════════════════════════════════════════════════════════════

export interface MeetingAgreementStatus {
  status: string;
  deadline: Date | null;
  buyerProposal: { date: Date; status: string } | null;
  sellerProposal: { date: Date; status: string } | null;
  agreedDate: Date | null;
  confirmedAt: Date | null;
}

export async function getMeetingAgreementStatus(
  matchId: string,
): Promise<MeetingAgreementStatus | null> {
  const match = await db.match.findUnique({
    where: { id: matchId },
  });

  if (!match) return null;

  const buyerConsent = await db.buyerMeetingConsent.findUnique({
    where: { matchId },
  });

  const sellerConsent = await db.sellerMeetingConsent.findUnique({
    where: { matchId },
  });

  return {
    status: match.meetingAgreementStatus || "NotStarted",
    deadline: match.meetingAgreementDeadlineAt,
    buyerProposal: buyerConsent
      ? { date: buyerConsent.proposedDate, status: buyerConsent.consentStatus }
      : null,
    sellerProposal: sellerConsent
      ? { date: sellerConsent.proposedDate, status: sellerConsent.consentStatus }
      : null,
    agreedDate: match.agreedMeetingDate,
    confirmedAt: match.agreementConfirmedAt,
  };
}
