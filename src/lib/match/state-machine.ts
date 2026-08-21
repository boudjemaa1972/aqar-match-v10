// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Match Lifecycle State Machine
//
//  Implements the transition table defined in constants.ts.
//  Key design decisions:
//    • The state machine is a PURE FUNCTION — no side effects
//    • Time conditions are checked INSIDE attemptTransition,
//      not just by the scheduler (bug fix for pre-existing issue)
//    • All transitions are auditable via TransitionResult
//    • The machine rejects invalid transitions with clear errors
//
//  BUG FIX (Article 207 CC compliance):
//  Previously, timed actions like BuyerAckWindowExpires were only
//  checked by the scheduler, not by the state machine itself. This
//  meant a direct call to attemptTransition from an API endpoint
//  could bypass the time window. Now, attemptTransition checks
//  time conditions when `timed: true` is set on a transition.
// ──────────────────────────────────────────────────────────────────

import {
  MatchLifecycleStatus,
  Action,
  TRANSITION_MAP,
  FINAL_STATES,
  TIME_WINDOWS,
  type Transition,
} from "./constants";

// ══════════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════════

export interface MatchContext {
  status: MatchLifecycleStatus;
  createdAt: Date;
  sellerDeadline?: Date | null;
  buyerDeadline?: Date | null;
  sellerConfirmDeadline?: Date | null;
  buyerAckDeadline?: Date | null;
  refundDeadline?: Date | null;
  sellerDecisionDeadline?: Date | null;
  buyerCompensationDeadline?: Date | null;
  meetingAgreementDeadline?: Date | null;
}

export interface TransitionResult {
  success: boolean;
  from: MatchLifecycleStatus;
  to: MatchLifecycleStatus | null;
  action: Action;
  error?: string;
  /** Whether a time condition was checked */
  timeCheckApplied: boolean;
  /** The time condition that was checked (if any) */
  timeCondition?: string;
}

// ══════════════════════════════════════════════════════════════════
//  LOOKUP HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * Find a transition in the TRANSITION_MAP.
 */
function findTransition(
  from: MatchLifecycleStatus,
  action: Action,
): Transition | undefined {
  return TRANSITION_MAP.find((t) => t.from === from && t.action === action);
}

/**
 * Check if a state is a final (terminal) state.
 */
export function isFinal(status: MatchLifecycleStatus): boolean {
  return FINAL_STATES.has(status);
}

/**
 * Get all valid actions for a given state.
 */
export function getValidActions(status: MatchLifecycleStatus): Action[] {
  return TRANSITION_MAP.filter((t) => t.from === status).map((t) => t.action);
}

// ══════════════════════════════════════════════════════════════════
//  TIME CONDITION CHECKS
// ══════════════════════════════════════════════════════════════════

/**
 * Check if a time-based action is eligible.
 * Returns { eligible: true } if the time window has passed,
 * or { eligible: false, reason: string } if not.
 *
 * This is called INSIDE attemptTransition when the transition
 * has `timed: true`, preventing direct callers from bypassing
 * time windows.
 */
function checkTimeCondition(
  action: Action,
  context: MatchContext,
  now: Date,
): { eligible: true } | { eligible: false; reason: string } {
  switch (action) {
    case Action.SellerDeadlineExpires: {
      const deadline = context.sellerDeadline;
      if (!deadline) {
        return { eligible: false, reason: "No seller deadline set" };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Seller deadline not reached (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.BuyerDeadlineExpires: {
      const deadline = context.buyerDeadline;
      if (!deadline) {
        return { eligible: false, reason: "No buyer deadline set" };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Buyer deadline not reached (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.SellerConfirmWindowExpires: {
      const deadline = context.sellerConfirmDeadline;
      if (!deadline) {
        return { eligible: false, reason: "No seller confirm deadline set" };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Seller confirm window not expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.BuyerAckWindowExpires: {
      const deadline = context.buyerAckDeadline;
      if (!deadline) {
        return { eligible: false, reason: "No buyer ack deadline set" };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Buyer ack window not expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.RefundWindowExpires: {
      const deadline = context.refundDeadline;
      if (!deadline) {
        return { eligible: false, reason: "No refund deadline set" };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Refund window not expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.SellerDecisionWindowExpires: {
      const deadline = context.sellerDecisionDeadline;
      if (!deadline) {
        return { eligible: false, reason: "No seller decision deadline set" };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Seller decision window not expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.SellerChooseRefundFull:
    case Action.SellerChooseAdvance: {
      // These are user-initiated but gated by the decision deadline.
      // If the deadline exists and has passed, reject the manual choice
      // (the scheduler would have already auto-transitioned).
      const deadline = context.sellerDecisionDeadline;
      if (deadline && now >= deadline) {
        return {
          eligible: false,
          reason: `Seller decision deadline expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.BuyerCompensationWindowExpires: {
      const deadline = context.buyerCompensationDeadline;
      if (!deadline) {
        return {
          eligible: false,
          reason: "No buyer compensation deadline set",
        };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Buyer compensation window not expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.BuyerChooseCashCompensation:
    case Action.BuyerChooseCredit: {
      // User-initiated but gated by the compensation deadline.
      const deadline = context.buyerCompensationDeadline;
      if (deadline && now >= deadline) {
        return {
          eligible: false,
          reason: `Buyer compensation deadline expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.MeetingAgreementWindowExpires: {
      const deadline = context.meetingAgreementDeadline;
      if (!deadline) {
        return {
          eligible: false,
          reason: "No meeting agreement deadline set",
        };
      }
      if (now < deadline) {
        return {
          eligible: false,
          reason: `Meeting agreement window not expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    case Action.ProposeMeetingDate:
    case Action.ApproveMeetingDate:
    case Action.RejectMeetingDate: {
      // Gated by the meeting agreement deadline.
      const deadline = context.meetingAgreementDeadline;
      if (deadline && now >= deadline) {
        return {
          eligible: false,
          reason: `Meeting agreement deadline expired (${deadline.toISOString()})`,
        };
      }
      return { eligible: true };
    }

    default:
      // Non-timed action — always eligible
      return { eligible: true };
  }
}

// ══════════════════════════════════════════════════════════════════
//  CORE: attemptTransition
// ══════════════════════════════════════════════════════════════════

/**
 * Attempt a state transition.
 *
 * This is the SINGLE ENTRY POINT for all state changes.
 * It validates:
 *   1. The (from, action) pair exists in TRANSITION_MAP
 *   2. If timed: true, the time condition is checked
 *   3. Returns a TransitionResult for audit logging
 *
 * @param context - Current match state + deadline information
 * @param action - The action to attempt
 * @param now - Current time (injectable for testing)
 * @returns TransitionResult with success/failure + details
 */
export function attemptTransition(
  context: MatchContext,
  action: Action,
  now: Date = new Date(),
): TransitionResult {
  const { status } = context;

  // ── Check 1: Is the state a final state? ──
  if (isFinal(status)) {
    return {
      success: false,
      from: status,
      to: null,
      action,
      error: `Cannot transition from final state ${status}`,
      timeCheckApplied: false,
    };
  }

  // ── Check 2: Find the transition in the map ──
  const transition = findTransition(status, action);
  if (!transition) {
    return {
      success: false,
      from: status,
      to: null,
      action,
      error: `No transition defined for ${status} + ${action}`,
      timeCheckApplied: false,
    };
  }

  // ── Check 3: Time condition enforcement ──
  // For scheduler-only timed actions: enforce the deadline.
  // For user-initiated deadline-gated actions (SellerChooseRefundFull,
  // SellerChooseAdvance, BuyerChooseCashCompensation, BuyerChooseCredit):
  // also enforce — the user must decide BEFORE the deadline expires,
  // or the scheduler auto-resolves.
  const isDeadlineGated =
    transition.timed ||
    action === Action.SellerChooseRefundFull ||
    action === Action.SellerChooseAdvance ||
    action === Action.BuyerChooseCashCompensation ||
    action === Action.BuyerChooseCredit ||
    action === Action.ProposeMeetingDate ||
    action === Action.ApproveMeetingDate ||
    action === Action.RejectMeetingDate;

  if (isDeadlineGated) {
    const timeCheck = checkTimeCondition(action, context, now);
    if (!timeCheck.eligible) {
      return {
        success: false,
        from: status,
        to: null,
        action,
        error: `Time condition not met: ${timeCheck.reason}`,
        timeCheckApplied: true,
        timeCondition: timeCheck.reason,
      };
    }
  }

  // ── Transition is valid ──
  return {
    success: true,
    from: status,
    to: transition.to,
    action,
    timeCheckApplied: isDeadlineGated,
    timeCondition: isDeadlineGated
      ? `Time window verified for ${action}`
      : undefined,
  };
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS: Get deadline field name for an action
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the deadline field that should be set when a timed
 * action creates a new state with a time window.
 */
export function getDeadlineFieldForAction(
  action: Action,
): keyof MatchContext | null {
  switch (action) {
    case Action.SellerPaysFee:
    case Action.SellerConsents:
    case Action.SellerDeadlineExpires:
      return "sellerDeadline";
    case Action.BuyerPaysFee:
    case Action.BuyerDeadlineExpires:
      return "buyerDeadline";
    case Action.SellerConfirmsContact:
    case Action.SellerConfirmWindowExpires:
      return "sellerConfirmDeadline";
    case Action.SellerWithdrawsPostBuyerPayment:
    case Action.SellerWithdrawsPreBuyerPayment:
    case Action.BuyerAckWindowExpires:
      return "buyerAckDeadline";
    case Action.RefundWindowExpires:
      return "refundDeadline";
    case Action.SellerDecisionWindowExpires:
    case Action.SellerChooseRefundFull:
    case Action.SellerChooseAdvance:
      return "sellerDecisionDeadline";
    case Action.BuyerAcknowledgesContact:
    case Action.BuyerCompensationWindowExpires:
    case Action.BuyerChooseCashCompensation:
    case Action.BuyerChooseCredit:
      return "buyerCompensationDeadline";
    case Action.ProposeMeetingDate:
    case Action.ApproveMeetingDate:
    case Action.RejectMeetingDate:
    case Action.MeetingAgreementWindowExpires:
      return "meetingAgreementDeadline";
    default:
      return null;
  }
}

/**
 * Calculate the deadline for a timed action.
 * Returns a Date offset by the appropriate time window.
 */
export function calculateDeadline(
  action: Action,
  from: Date,
): Date {
  const hours = getHoursForAction(action);
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

function getHoursForAction(action: Action): number {
  switch (action) {
    case Action.SellerPaysFee:
    case Action.SellerDeadlineExpires:
      return TIME_WINDOWS.SELLER_PAYMENT;
    case Action.BuyerPaysFee:
    case Action.BuyerDeadlineExpires:
      return TIME_WINDOWS.BUYER_PAYMENT;
    case Action.SellerConfirmsContact:
    case Action.SellerConfirmWindowExpires:
      return TIME_WINDOWS.SELLER_CONFIRM;
    case Action.SellerWithdrawsPostBuyerPayment:
    case Action.SellerWithdrawsPreBuyerPayment:
    case Action.BuyerAckWindowExpires:
      return TIME_WINDOWS.BUYER_ACK;
    case Action.RefundWindowExpires:
      return TIME_WINDOWS.REFUND;
    case Action.SellerDecisionWindowExpires:
    case Action.SellerChooseRefundFull:
    case Action.SellerChooseAdvance:
      return TIME_WINDOWS.SELLER_DECISION;
    case Action.BuyerAcknowledgesContact:
    case Action.BuyerCompensationWindowExpires:
    case Action.BuyerChooseCashCompensation:
    case Action.BuyerChooseCredit:
      return TIME_WINDOWS.BUYER_COMPENSATION;
    case Action.ProposeMeetingDate:
    case Action.ApproveMeetingDate:
    case Action.RejectMeetingDate:
    case Action.MeetingAgreementWindowExpires:
      return TIME_WINDOWS.MEETING_AGREEMENT;
    default:
      return 0;
  }
}
