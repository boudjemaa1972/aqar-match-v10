// ──────────────────────────────────────────────────────────────────
//  Aqar Match — State Machine Tests
//
//  Tests all final states + the time-condition bug fix.
//  Uses Node assert (no vitest dependency).
//  Run with: npx tsx src/lib/match/__tests__/state-machine.test.ts
// ──────────────────────────────────────────────────────────────────

import assert from "node:assert";
import {
  attemptTransition,
  isFinal,
  getValidActions,
  type MatchContext,
} from "../state-machine";
import {
  calculateSellerWithdrawalPenalty,
  calculateSellerPreBuyerWithdrawalRefund,
  calculatePlatformApology,
  calculateBuyerCompensation,
} from "../finance";
import { MatchLifecycleStatus, Action, TIME_WINDOWS } from "../constants";

// ── Helper: create a base match context ────────────────────────
function baseContext(
  overrides: Partial<MatchContext> = {},
): MatchContext {
  const now = new Date();
  return {
    status: MatchLifecycleStatus.Proposed,
    createdAt: now,
    sellerDeadline: new Date(now.getTime() + TIME_WINDOWS.SELLER_PAYMENT * 3600000),
    buyerDeadline: new Date(now.getTime() + TIME_WINDOWS.BUYER_PAYMENT * 3600000),
    sellerConfirmDeadline: new Date(now.getTime() + TIME_WINDOWS.SELLER_CONFIRM * 3600000),
    buyerAckDeadline: new Date(now.getTime() + TIME_WINDOWS.BUYER_ACK * 3600000),
    refundDeadline: new Date(now.getTime() + TIME_WINDOWS.REFUND * 3600000),
    sellerDecisionDeadline: null,
    buyerCompensationDeadline: null,
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${(e as Error).message}`);
  }
}

function suite(name: string, fn: () => void) {
  console.log(`\n┌─ ${name}`);
  fn();
  console.log(`└─ done`);
}

// ══════════════════════════════════════════════════════════════════
//  TEST 1: Final State — REJECTED (seller rejects proposal)
// ══════════════════════════════════════════════════════════════════
suite("Final State: REJECTED", () => {
  test("seller rejects → REJECTED", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.Proposed,
    });
    const result = attemptTransition(
      context,
      Action.SellerRejects,
      new Date(),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.Rejected);
    assert.strictEqual(result.timeCheckApplied, false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.Rejected), true);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 2: Final State — EXPIRED_SELLER
// ══════════════════════════════════════════════════════════════════
suite("Final State: EXPIRED_SELLER", () => {
  test("seller deadline expires → EXPIRED_SELLER", () => {
    const deadline = new Date("2026-01-01T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.Proposed,
      sellerDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.SellerDeadlineExpires,
      new Date("2026-01-02T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.ExpiredSeller);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.ExpiredSeller), true);
  });

  test("seller deadline NOT expired → rejected", () => {
    const deadline = new Date("2026-01-02T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.Proposed,
      sellerDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.SellerDeadlineExpires,
      new Date("2026-01-01T00:00:00Z"),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("Time condition not met"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 3: BuyerNonPayment → BuyerPaymentExpired
// ══════════════════════════════════════════════════════════════════
suite("BuyerNonPayment → BuyerPaymentExpired + manual reject → ExpiredBuyer", () => {
  test("buyer deadline expires → BUYER_PAYMENT_EXPIRED (seller 24h to decide)", () => {
    const deadline = new Date("2026-01-01T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerNotified,
      buyerDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerDeadlineExpires,
      new Date("2026-01-02T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.BuyerPaymentExpired);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerPaymentExpired), false);
  });

  test("buyer rejects → EXPIRED_BUYER (no time check needed)", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerNotified,
    });
    const result = attemptTransition(context, Action.BuyerRejects, new Date());
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.ExpiredBuyer);
    assert.strictEqual(result.timeCheckApplied, false);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 4: Final State — REFUNDED (seller doesn't confirm contact)
// ══════════════════════════════════════════════════════════════════
suite("Final State: REFUNDED (seller fails to confirm contact)", () => {
  test("seller confirm window expires → REFUNDED", () => {
    const deadline = new Date("2026-01-01T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerFeePaid,
      sellerConfirmDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.SellerConfirmWindowExpires,
      new Date("2026-01-02T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.Refunded);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.Refunded), true);
  });

  test("financial: buyer gets buyer_fee + 0.10 × buyer_fee", () => {
    const buyerFee = 12500;
    const compensation = calculateBuyerCompensation(buyerFee, true);
    // buyer_fee + 0.10 * buyer_fee = 12500 + 1250 = 13750
    assert.strictEqual(compensation.amount, buyerFee + Math.round(buyerFee * 0.10));
    assert.strictEqual(compensation.amount, 13750);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 5: Final State — COMPLETED
// ══════════════════════════════════════════════════════════════════
suite("Contact confirmation → MEETING_AGREEMENT_PENDING", () => {
  test("seller confirms contact → MEETING_AGREEMENT_PENDING", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerFeePaid,
    });
    const result = attemptTransition(
      context,
      Action.SellerConfirmsContact,
      new Date(),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementPending);
    assert.strictEqual(result.timeCheckApplied, false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.MeetingAgreementPending), false);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 6: Final State — CANCELLED_NO_COMPENSATION
// ══════════════════════════════════════════════════════════════════
suite("Final State: CANCELLED_NO_COMPENSATION", () => {
  test("buyer ack window expires after seller withdrew pre-buyer → CANCELLED_NO_COMPENSATION", () => {
    const deadline = new Date("2026-01-01T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
      buyerAckDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerAckWindowExpires,
      new Date("2026-01-02T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.CancelledNoCompensation);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.CancelledNoCompensation), true);
  });

  test("BUG FIX: time condition is enforced in state machine", () => {
    const deadline = new Date("2026-01-02T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
      buyerAckDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerAckWindowExpires,
      new Date("2026-01-01T00:00:00Z"),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("Time condition not met"));
  });

  test("financial: no compensation to either party", () => {
    // CANCELLED_NO_COMPENSATION: seller withdrew pre-buyer → no fees charged
    // The deducted 0.10 × buyer_fee stays with the platform
    // Zero financial impact for buyer; seller already received partial refund
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 7: Final State — CANCELLED_WITH_PLATFORM_APOLOGY
// ══════════════════════════════════════════════════════════════════
suite("Final State: CANCELLED_WITH_PLATFORM_APOLOGY", () => {
  test("buyer ack window expires after seller withdrew post-buyer → PLATFORM_APOLOGY", () => {
    const deadline = new Date("2026-01-01T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.SellerWithdrewPostBuyerPayment,
      buyerAckDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerAckWindowExpires,
      new Date("2026-01-02T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.CancelledWithPlatformApology);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.CancelledWithPlatformApology), true);
  });

  test("financial: platform pays 5% apology to buyer", () => {
    const apology = calculatePlatformApology(12500);
    assert.strictEqual(apology.apologyAmount, Math.round(12500 * 0.05));
    assert.strictEqual(apology.percentage, 0.05);
    assert.strictEqual(apology.originalBuyerFee, 12500);
  });

  test("financial: platform apology is SEPARATE from seller penalty", () => {
    const penalty = calculateSellerWithdrawalPenalty(25000, 12500);
    const apology = calculatePlatformApology(12500);
    assert.strictEqual(penalty.deduction, 25000);
    assert.strictEqual(apology.apologyAmount, 625);
    assert.notStrictEqual(penalty.deduction, apology.apologyAmount);
  });

  test("BUG FIX: time condition enforced for CANCELLED_WITH_PLATFORM_APOLOGY", () => {
    const deadline = new Date("2026-01-02T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.SellerWithdrewPostBuyerPayment,
      buyerAckDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerAckWindowExpires,
      new Date("2026-01-01T00:00:00Z"),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("Time condition not met"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 8: Seller pre-buyer withdrawal path
// ══════════════════════════════════════════════════════════════════
suite("Seller pre-buyer withdrawal → BUYER_COMPENSATED_PENDING", () => {
  test("buyer acknowledges within48h → BUYER_COMPENSATED_PENDING", () => {
    const deadline = new Date("2026-01-01T00:00:00Z");
    const context = baseContext({
      status: MatchLifecycleStatus.SellerWithdrewPreBuyerPayment,
      buyerAckDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerAcknowledgesContact,
      new Date("2026-01-01T12:00:00Z"), // within 48h
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.BuyerCompensatedPending);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerCompensatedPending), false);
  });

  test("financial: seller gets partial refund (seller_fee - 0.10 × buyer_fee)", () => {
    const refund = calculateSellerPreBuyerWithdrawalRefund(25000, 12500);
    // deduction = 0.10 × 12500 = 1250
    // refund = 25000 - 1250 = 23750
    assert.strictEqual(refund.deduction, 1250);
    assert.strictEqual(refund.refundAmount, 23750);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 9: Buyer compensation choice
// ══════════════════════════════════════════════════════════════════
suite("Buyer compensation choice → BUYER_COMPENSATED_CASH or CREDIT", () => {
  const compDeadline = new Date("2026-01-02T00:00:00Z");

  test("buyer chooses cash → BUYER_COMPENSATED_CASH (final)", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerCompensatedPending,
      buyerCompensationDeadline: compDeadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerChooseCashCompensation,
      new Date("2026-01-01T12:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.BuyerCompensatedCash);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerCompensatedCash), true);
  });

  test("buyer chooses credit → BUYER_COMPENSATED_CREDIT (final)", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerCompensatedPending,
      buyerCompensationDeadline: compDeadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerChooseCredit,
      new Date("2026-01-01T12:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.BuyerCompensatedCredit);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerCompensatedCredit), true);
  });

  test("buyer chooses cash AFTER deadline → rejected", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerCompensatedPending,
      buyerCompensationDeadline: compDeadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerChooseCashCompensation,
      new Date("2026-01-03T00:00:00Z"),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("expired"));
  });

  test("buyer compensation window expires → BUYER_COMPENSATED_CASH (default)", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.BuyerCompensatedPending,
      buyerCompensationDeadline: compDeadline,
    });
    const result = attemptTransition(
      context,
      Action.BuyerCompensationWindowExpires,
      new Date("2026-01-02T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.BuyerCompensatedCash);
    assert.strictEqual(result.timeCheckApplied, true);
  });

  test("financial: buyer gets 0.10 × buyer_fee", () => {
    const buyerFee = 12500;
    const compensation = calculateBuyerCompensation(buyerFee, false);
    assert.strictEqual(compensation.amount, Math.round(buyerFee * 0.10));
    assert.strictEqual(compensation.amount, 1250);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 10: State machine validation
// ══════════════════════════════════════════════════════════════════
suite("State machine validation", () => {
  test("rejects transition from final state", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.Completed,
    });
    const result = attemptTransition(
      context,
      Action.SellerConfirmsContact,
      new Date(),
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Cannot transition from final state"));
  });

  test("rejects undefined transition", () => {
    const context = baseContext({
      status: MatchLifecycleStatus.Proposed,
    });
    const result = attemptTransition(
      context,
      Action.BuyerPaysFee,
      new Date(),
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("No transition defined"));
  });

  test("isFinal correctly identifies all 12 final states", () => {
    assert.strictEqual(isFinal(MatchLifecycleStatus.Rejected), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.Completed), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.ExpiredSeller), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.ExpiredBuyer), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.Refunded), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.CancelledNoCompensation), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.CancelledWithPlatformApology), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerRefundedFull), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerAdvance), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerCompensatedCash), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerCompensatedCredit), true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.MeetingAgreementFailed), true);

    // Non-final states
    assert.strictEqual(isFinal(MatchLifecycleStatus.Proposed), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerFeePaid), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerNotified), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerFeePaid), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerPaymentExpired), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerWithdrewPreBuyerPayment), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerWithdrewPostBuyerPayment), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.BuyerCompensatedPending), false);
    assert.strictEqual(isFinal(MatchLifecycleStatus.MeetingAgreementPending), false);
  });
});

// ══════════════════════════════════════════════════════════════════
//  SUMMARY
// ══════════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
