// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Match Lifecycle Constants
//
//  Defines the complete state machine for match lifecycle:
//    • MatchStatus — all possible states
//    • Action — all possible transitions
//    • TRANSITION_MAP — explicit state→action→state table
//    • FINAL_STATES — the terminal states
//    • TIME_WINDOWS — all deadline durations
//
//  Legal basis: Algerian Civil Code, Article 207 (resolutory condition).
//  Fee payment is a resolutory obligation — if the match fails for
//  reasons not attributable to the platform, the aggrieved party's
//  fee is refunded.
//
//  Financial rules:
//    • seller_fee = transparent fee paid by seller on acceptance
//    • buyer_fee = seller_fee / 2
//    • All percentage-based penalties (10%, 5%) are calculated on
//      buyer_fee as the reference unit:
//      - 0.10 * buyer_fee = 10% of buyer fee = 5% of seller fee
// ──────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
//  MATCH STATUS — all possible lifecycle states
// ══════════════════════════════════════════════════════════════════
export enum MatchLifecycleStatus {
  // ── Active states (match is in progress) ──
  Proposed = "PROPOSED",
  SellerFeePaid = "SELLER_FEE_PAID",
  BuyerNotified = "BUYER_NOTIFIED",
  BuyerFeePaid = "BUYER_FEE_PAID",
  SellerWithdrewPreBuyerPayment = "SELLER_WITHDREW_PRE_BUYER_PAYMENT",
  SellerWithdrewPostBuyerPayment = "SELLER_WITHDREW_POST_BUYER_PAYMENT",
  BuyerPaymentExpired = "BUYER_PAYMENT_EXPIRED",
  BuyerCompensatedPending = "BUYER_COMPENSATED_PENDING",
  MeetingAgreementPending = "MEETING_AGREEMENT_PENDING",

  // ── Final states ──
  Rejected = "REJECTED",
  ExpiredSeller = "EXPIRED_SELLER",
  ExpiredBuyer = "EXPIRED_BUYER",
  Refunded = "REFUNDED",
  Completed = "COMPLETED",
  CancelledNoCompensation = "CANCELLED_NO_COMPENSATION",
  CancelledWithPlatformApology = "CANCELLED_WITH_PLATFORM_APOLOGY",
  SellerRefundedFull = "SELLER_REFUNDED_FULL",
  SellerAdvance = "SELLER_ADVANCE",
  BuyerCompensatedCash = "BUYER_COMPENSATED_CASH",
  BuyerCompensatedCredit = "BUYER_COMPENSATED_CREDIT",
  MeetingAgreementFailed = "MEETING_AGREEMENT_FAILED",
}

// ══════════════════════════════════════════════════════════════════
//  ACTIONS — all possible transition triggers
// ══════════════════════════════════════════════════════════════════
export enum Action {
  // Seller actions
  SellerPaysFee = "SELLER_PAYS_FEE",
  SellerRejects = "SELLER_REJECTS",
  SellerConsents = "SELLER_CONSENTS",
  SellerConfirmsContact = "SELLER_CONFIRMS_CONTACT",
  SellerWithdrawsPreBuyerPayment = "SELLER_WITHDRAWS_PRE_BUYER_PAYMENT",
  SellerWithdrawsPostBuyerPayment = "SELLER_WITHDRAWS_POST_BUYER_PAYMENT",
  SellerChooseRefundFull = "SELLER_CHOOSE_REFUND_FULL",
  SellerChooseAdvance = "SELLER_CHOOSE_ADVANCE",

  // Buyer actions
  BuyerPaysFee = "BUYER_PAYS_FEE",
  BuyerAcknowledgesContact = "BUYER_ACKNOWLEDGES_CONTACT",
  BuyerRejects = "BUYER_REJECTS",
  BuyerChooseCashCompensation = "BUYER_CHOOSE_CASH_COMPENSATION",
  BuyerChooseCredit = "BUYER_CHOOSE_CREDIT",

  // Time-based actions (triggered by scheduler)
  SellerDeadlineExpires = "SELLER_DEADLINE_EXPIRES",
  BuyerDeadlineExpires = "BUYER_DEADLINE_EXPIRES",
  SellerConfirmWindowExpires = "SELLER_CONFIRM_WINDOW_EXPIRES",
  BuyerAckWindowExpires = "BUYER_ACK_WINDOW_EXPIRES",
  RefundWindowExpires = "REFUND_WINDOW_EXPIRES",
  SellerDecisionWindowExpires = "SELLER_DECISION_WINDOW_EXPIRES",
  BuyerCompensationWindowExpires = "BUYER_COMPENSATION_WINDOW_EXPIRES",

  // Meeting agreement actions
  ProposeMeetingDate = "PROPOSE_MEETING_DATE",
  ApproveMeetingDate = "APPROVE_MEETING_DATE",
  RejectMeetingDate = "REJECT_MEETING_DATE",
  MeetingAgreementWindowExpires = "MEETING_AGREEMENT_WINDOW_EXPIRES",
}

// ══════════════════════════════════════════════════════════════════
//  TRANSITION MAP — explicit state→action→state table
// ══════════════════════════════════════════════════════════════════
//  The state machine is a TABLE, not branching conditions.
//  Each entry: { from, action, to, timed?, description }
//
//  timed: if true, the scheduler must verify the time condition
//  BEFORE calling attemptTransition. The state machine itself
//  does NOT enforce time — it only validates the (state, action)
//  pair is valid. This separation means:
//    • The state machine is pure logic (no clock dependency)
//    • The scheduler handles all time-based enforcement
//    • API endpoints that call attemptTransition directly are
//      FORBIDDEN from using timed actions
// ────────────────────────────────────────────────────────────────
export interface Transition {
  from: MatchLifecycleStatus;
  action: Action;
  to: MatchLifecycleStatus;
  /** If true, this action requires a time window check before execution */
  timed?: boolean;
  /** Description for audit logging */
  description: string;
}

export const TRANSITION_MAP: Transition[] = [
  // ══════════════════════════════════════════════════════════════
  //  PATH 1: Seller initial decision
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.Proposed,
    action: Action.SellerRejects,
    to: MatchLifecycleStatus.Rejected,
    description: "Seller rejected the match proposal",
  },
  {
    from: MatchLifecycleStatus.Proposed,
    action: Action.SellerPaysFee,
    to: MatchLifecycleStatus.SellerFeePaid,
    description: "Seller paid fee, pending consent",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 2: Seller consent + buyer notification
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.SellerFeePaid,
    action: Action.SellerConsents,
    to: MatchLifecycleStatus.BuyerNotified,
    description: "Seller consented, buyer notified to pay within 48h",
  },
  // Seller withdraws before buyer pays (from SellerFeePaid):
  //   refund = seller_fee - 0.10 * buyer_fee
  {
    from: MatchLifecycleStatus.SellerFeePaid,
    action: Action.SellerWithdrawsPreBuyerPayment,
    to: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
    description:
      "Seller withdrew after paying but before buyer paid — partial refund, buyer notified",
  },
  // Seller withdraws after consenting but before buyer pays:
  //   same financial outcome as above
  {
    from: MatchLifecycleStatus.BuyerNotified,
    action: Action.SellerWithdrawsPreBuyerPayment,
    to: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
    description:
      "Seller withdrew after consent but before buyer paid — partial refund, buyer notified",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 2 (continued): Buyer ack after seller pre-buyer withdrawal
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
    action: Action.BuyerAcknowledgesContact,
    to: MatchLifecycleStatus.BuyerCompensatedPending,
    timed: true, // 48h ack window
    description:
      "Buyer acknowledged seller withdrawal — buyer now chooses compensation",
  },
  {
    from: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
    action: Action.BuyerAckWindowExpires,
    to: MatchLifecycleStatus.CancelledNoCompensation,
    timed: true, // 48h ack window
    description:
      "Buyer didn't acknowledge seller withdrawal in 48h — deducted amount stays with platform",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 2 (continued): Buyer compensation choice
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.BuyerCompensatedPending,
    action: Action.BuyerChooseCashCompensation,
    to: MatchLifecycleStatus.BuyerCompensatedCash,
    description: "Buyer chose cash refund — 0.10 × buyer_fee paid immediately",
  },
  {
    from: MatchLifecycleStatus.BuyerCompensatedPending,
    action: Action.BuyerChooseCredit,
    to: MatchLifecycleStatus.BuyerCompensatedCredit,
    description:
      "Buyer chose 30-day credit — 0.10 × buyer_fee as platform credit",
  },
  {
    from: MatchLifecycleStatus.BuyerCompensatedPending,
    action: Action.BuyerCompensationWindowExpires,
    to: MatchLifecycleStatus.BuyerCompensatedCash,
    timed: true, // 24h to choose, default: cash refund
    description:
      "Buyer didn't choose in 24h — default to cash refund (safe default)",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 3: Buyer payment flow
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.BuyerNotified,
    action: Action.BuyerPaysFee,
    to: MatchLifecycleStatus.BuyerFeePaid,
    description: "Buyer paid fee — info revealed, seller has 48h to confirm contact",
  },
  {
    from: MatchLifecycleStatus.BuyerNotified,
    action: Action.BuyerRejects,
    to: MatchLifecycleStatus.ExpiredBuyer,
    description: "Buyer rejected the match — advance queue",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 4: Contact confirmation flow
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.BuyerFeePaid,
    action: Action.SellerConfirmsContact,
    to: MatchLifecycleStatus.MeetingAgreementPending,
    description: "Seller confirmed contact — meeting agreement phase begins",
  },
  // Seller didn't confirm contact in 48h → buyer refund + 10% bonus
  {
    from: MatchLifecycleStatus.BuyerFeePaid,
    action: Action.SellerConfirmWindowExpires,
    to: MatchLifecycleStatus.Refunded,
    timed: true, // 48h after buyer payment
    description:
      "Seller didn't confirm contact in 48h — buyer refund + 10% bonus",
  },

  // ══════════════════════════════════════════════════════════════
  //  Seller withdrawal AFTER buyer paid (post-buyer-payment)
  //  → triggers 48h buyer ack window + platform 5% apology
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.BuyerFeePaid,
    action: Action.SellerWithdrawsPostBuyerPayment,
    to: MatchLifecycleStatus.SellerWithdrewPostBuyerPayment,
    timed: true,
    description:
      "Seller withdrew after buyer paid — 48h buyer ack window opens",
  },
  {
    from: MatchLifecycleStatus.SellerWithdrewPostBuyerPayment,
    action: Action.BuyerAcknowledgesContact,
    to: MatchLifecycleStatus.MeetingAgreementPending,
    description:
      "Buyer acknowledged despite seller withdrawal — meeting agreement phase begins",
  },
  {
    from: MatchLifecycleStatus.SellerWithdrewPostBuyerPayment,
    action: Action.BuyerAckWindowExpires,
    to: MatchLifecycleStatus.CancelledWithPlatformApology,
    timed: true,
    description:
      "Buyer ack window expired — platform issues 5% apology to buyer",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 3 (continued): Buyer payment expiry → seller decision
  // ══════════════════════════════════════════════════════════════
  // Buyer didn't pay in 48h → seller has 24h to decide
  {
    from: MatchLifecycleStatus.BuyerNotified,
    action: Action.BuyerDeadlineExpires,
    to: MatchLifecycleStatus.BuyerPaymentExpired,
    timed: true,
    description:
      "Buyer didn't pay in 48h — seller has 24h to choose refund or advance",
  },
  // Seller chooses full refund (within 24h)
  {
    from: MatchLifecycleStatus.BuyerPaymentExpired,
    action: Action.SellerChooseRefundFull,
    to: MatchLifecycleStatus.SellerRefundedFull,
    description: "Seller chose full refund after buyer default",
  },
  // Seller chooses to keep fee as advance (within 24h)
  {
    from: MatchLifecycleStatus.BuyerPaymentExpired,
    action: Action.SellerChooseAdvance,
    to: MatchLifecycleStatus.SellerAdvance,
    description:
      "Seller chose to keep fee as advance — platform issues 5% apology",
  },
  // 24h timeout → auto-refund (safe default)
  {
    from: MatchLifecycleStatus.BuyerPaymentExpired,
    action: Action.SellerDecisionWindowExpires,
    to: MatchLifecycleStatus.SellerRefundedFull,
    timed: true,
    description:
      "Seller didn't decide in 24h — auto-refund (safe default)",
  },

  // ══════════════════════════════════════════════════════════════
  //  Time-based transitions (scheduler only — seller deadlines)
  // ══════════════════════════════════════════════════════════════
  {
    from: MatchLifecycleStatus.Proposed,
    action: Action.SellerDeadlineExpires,
    to: MatchLifecycleStatus.ExpiredSeller,
    timed: true,
    description: "Seller didn't pay+consent in 48h",
  },
  {
    from: MatchLifecycleStatus.SellerFeePaid,
    action: Action.SellerDeadlineExpires,
    to: MatchLifecycleStatus.ExpiredSeller,
    timed: true,
    description:
      "Seller paid but didn't consent in 48h — full refund, advance queue",
  },

  // ══════════════════════════════════════════════════════════════
  //  PATH 5: Meeting agreement flow
  // ══════════════════════════════════════════════════════════════
  // From MEETING_AGREEMENT_PENDING:
  {
    from: MatchLifecycleStatus.MeetingAgreementPending,
    action: Action.ProposeMeetingDate,
    to: MatchLifecycleStatus.MeetingAgreementPending,
    description: "Party proposed a meeting date",
  },
  {
    from: MatchLifecycleStatus.MeetingAgreementPending,
    action: Action.ApproveMeetingDate,
    to: MatchLifecycleStatus.Completed,
    description: "Both parties agreed on meeting date — match completed",
  },
  {
    from: MatchLifecycleStatus.MeetingAgreementPending,
    action: Action.RejectMeetingDate,
    to: MatchLifecycleStatus.MeetingAgreementFailed,
    description: "Party rejected the proposed meeting date",
  },
  {
    from: MatchLifecycleStatus.MeetingAgreementPending,
    action: Action.MeetingAgreementWindowExpires,
    to: MatchLifecycleStatus.MeetingAgreementFailed,
    timed: true,
    description: "7 days passed without meeting agreement",
  },
];

// ══════════════════════════════════════════════════════════════════
//  FINAL STATES — the terminal states
// ══════════════════════════════════════════════════════════════════
export const FINAL_STATES: ReadonlySet<MatchLifecycleStatus> = new Set([
  MatchLifecycleStatus.Rejected,
  MatchLifecycleStatus.ExpiredSeller,
  MatchLifecycleStatus.ExpiredBuyer,
  MatchLifecycleStatus.Refunded,
  MatchLifecycleStatus.Completed,
  MatchLifecycleStatus.CancelledNoCompensation,
  MatchLifecycleStatus.CancelledWithPlatformApology,
  MatchLifecycleStatus.SellerRefundedFull,
  MatchLifecycleStatus.SellerAdvance,
  MatchLifecycleStatus.BuyerCompensatedCash,
  MatchLifecycleStatus.BuyerCompensatedCredit,
  MatchLifecycleStatus.MeetingAgreementFailed,
]);

// ══════════════════════════════════════════════════════════════════
//  TIME WINDOWS (in hours) — scheduler enforcement
// ══════════════════════════════════════════════════════════════════
export const TIME_WINDOWS = {
  /** 48h for seller to pay fee + consent */
  SELLER_PAYMENT: 48,
  /** 48h for buyer to pay fee after notification */
  BUYER_PAYMENT: 48,
  /** 48h for seller to confirm contact after buyer pays */
  SELLER_CONFIRM: 48,
  /** 48h for buyer to acknowledge after seller withdrawal */
  BUYER_ACK: 48,
  /** 48h for buyer refund (legacy, kept for backward compatibility) */
  REFUND: 48,
  /** 24h for seller to choose refund or advance after buyer payment expired */
  SELLER_DECISION: 24,
  /** 24h for buyer to choose cash or credit after seller pre-buyer withdrawal */
  BUYER_COMPENSATION: 24,
  /** 7 days for parties to agree on a meeting date */
  MEETING_AGREEMENT: 168,
} as const;
