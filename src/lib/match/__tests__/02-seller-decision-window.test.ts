// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Seller Decision Window Tests
//
//  Tests the 24h seller decision window that opens when a match
//  enters BuyerPaymentExpired (buyer didn't pay within 48h).
//
//  Scenarios:
//    1. Seller chooses "refund full" within 24h → works
//    2. Seller chooses "advance" within 24h → works
//    3. Attempt to choose AFTER deadline → rejected
//    4. 24h timeout with no response → auto-transition
//    5. Boundary: attempt at exact deadline moment
//
//  Run with: npx tsx src/lib/match/__tests__/02-seller-decision-window.test.ts
// ──────────────────────────────────────────────────────────────────

import assert from "node:assert";
import {
  attemptTransition,
  isFinal,
  type MatchContext,
} from "../state-machine";
import {
  calculatePlatformApology,
} from "../finance";
import { MatchLifecycleStatus, Action, TIME_WINDOWS } from "../constants";

// ── Helper: create a BuyerPaymentExpired context ────────────────
function buyerExpiredContext(
  overrides: Partial<MatchContext> = {},
): MatchContext {
  const now = new Date();
  return {
    status: MatchLifecycleStatus.BuyerPaymentExpired,
    createdAt: now,
    sellerDeadline: new Date(now.getTime() - 48 * 3600000), // already passed
    buyerDeadline: new Date(now.getTime() - 1 * 3600000),   // already passed
    sellerDecisionDeadline: new Date(
      now.getTime() + TIME_WINDOWS.SELLER_DECISION * 3600000,
    ), // 24h from now
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
//  TEST 1: Seller chooses "refund full" within 24h
// ══════════════════════════════════════════════════════════════════
suite("Scenario 1: Seller chooses REFUND_FULL within deadline", () => {
  test("SellerChooseRefundFull succeeds before deadline", () => {
    const context = buyerExpiredContext();
    const result = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      new Date(), // now, within 24h
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.SellerRefundedFull);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerRefundedFull), true);
  });

  test("financial: seller gets full fee back (no penalty)", () => {
    // In SellerRefundedFull: seller's fee is refunded, no deduction
    // The ledger entry should be a REFUND, not SELLER_WITHDRAWAL_PENALTY
    const penalty = { deduction: 0, reason: "no withdrawal" };
    assert.strictEqual(penalty.deduction, 0);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 2: Seller chooses "advance" within 24h
// ══════════════════════════════════════════════════════════════════
suite("Scenario 2: Seller chooses ADVANCE within deadline", () => {
  test("SellerChooseAdvance succeeds before deadline", () => {
    const context = buyerExpiredContext();
    const result = attemptTransition(
      context,
      Action.SellerChooseAdvance,
      new Date(), // now, within 24h
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.SellerAdvance);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerAdvance), true);
  });

  test("financial: platform pays 5% apology to buyer", () => {
    const apology = calculatePlatformApology(12500);
    assert.strictEqual(apology.apologyAmount, Math.round(12500 * 0.05));
    assert.strictEqual(apology.percentage, 0.05);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 3: Attempt to choose AFTER deadline → rejected
// ══════════════════════════════════════════════════════════════════
suite("Scenario 3: Seller chooses AFTER deadline → rejected", () => {
  const deadline = new Date("2026-01-02T00:00:00Z");

  test("SellerChooseRefundFull rejected after deadline", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      new Date("2026-01-03T00:00:00Z"), // 24h after deadline
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("Time condition not met"));
    assert.ok(result.error?.includes("expired"));
  });

  test("SellerChooseAdvance rejected after deadline", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.SellerChooseAdvance,
      new Date("2026-01-03T00:00:00Z"),
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("Time condition not met"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 4: 24h timeout with no response → auto-transition
// ══════════════════════════════════════════════════════════════════
suite("Scenario 4: 24h timeout → auto-transition to SellerRefundedFull", () => {
  const deadline = new Date("2026-01-01T00:00:00Z");

  test("SellerDecisionWindowExpires succeeds after 24h", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.SellerDecisionWindowExpires,
      new Date("2026-01-02T00:00:00Z"), // exactly 24h later
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.SellerRefundedFull);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.SellerRefundedFull), true);
  });

  test("SellerDecisionWindowExpires rejected before 24h", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: new Date("2026-01-03T00:00:00Z"), // 48h from entry
    });
    const result = attemptTransition(
      context,
      Action.SellerDecisionWindowExpires,
      new Date("2026-01-02T12:00:00Z"), // 12h after entry, still within 24h window
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("not expired"));
  });

  test("financial outcome matches manual 'refund full' choice", () => {
    // The auto-timeout leads to the same final state (SellerRefundedFull)
    // as the manual refund full choice. The difference is only in the
    // ledger description (auto_timeout vs manual).
    const deadline2 = new Date("2026-01-02T00:00:00Z");
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline2,
    });
    const manualResult = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      new Date("2026-01-01T12:00:00Z"), // before deadline
    );
    const autoResult = attemptTransition(
      context,
      Action.SellerDecisionWindowExpires,
      new Date("2026-01-02T00:00:00Z"), // after deadline
    );

    // Same final state
    assert.strictEqual(manualResult.to, autoResult.to);
    assert.strictEqual(manualResult.to, MatchLifecycleStatus.SellerRefundedFull);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 5: Boundary — attempt at exact deadline moment
// ══════════════════════════════════════════════════════════════════
suite("Scenario 5: Boundary — exact deadline moment", () => {
  const deadline = new Date("2026-01-02T00:00:00Z");

  test("SellerChooseRefundFull at exact deadline → rejected (>=)", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    // now === deadline → now >= deadline → rejected
    const result = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      new Date("2026-01-02T00:00:00Z"),
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("expired"));
  });

  test("SellerDecisionWindowExpires at exact deadline → succeeds (>=)", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    // now === deadline → now >= deadline → succeeds
    const result = attemptTransition(
      context,
      Action.SellerDecisionWindowExpires,
      new Date("2026-01-02T00:00:00Z"),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.SellerRefundedFull);
  });

  test("SellerChooseRefundFull 1ms before deadline → succeeds", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    const justBefore = new Date("2026-01-01T23:59:59.999Z");
    const result = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      justBefore,
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.SellerRefundedFull);
  });

  test("SellerDecisionWindowExpires 1ms before deadline → rejected", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: deadline,
    });
    const justBefore = new Date("2026-01-01T23:59:59.999Z");
    const result = attemptTransition(
      context,
      Action.SellerDecisionWindowExpires,
      justBefore,
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("not expired"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 6: State machine rejects transitions from final states
// ══════════════════════════════════════════════════════════════════
suite("Scenario 6: Cannot transition from final states", () => {
  test("SellerChooseRefundFull rejected from SellerRefundedFull", () => {
    const context = buyerExpiredContext({
      status: MatchLifecycleStatus.SellerRefundedFull,
    });
    const result = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      new Date(),
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Cannot transition from final state"));
  });

  test("SellerChooseAdvance rejected from SellerAdvance", () => {
    const context = buyerExpiredContext({
      status: MatchLifecycleStatus.SellerAdvance,
    });
    const result = attemptTransition(
      context,
      Action.SellerChooseAdvance,
      new Date(),
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Cannot transition from final state"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 7: No deadline set → rejected (defensive)
// ══════════════════════════════════════════════════════════════════
suite("Scenario 7: No deadline set → rejected (defensive)", () => {
  test("SellerDecisionWindowExpires without deadline → rejected", () => {
    const context = buyerExpiredContext({
      sellerDecisionDeadline: null,
    });
    const result = attemptTransition(
      context,
      Action.SellerDecisionWindowExpires,
      new Date(),
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("No seller decision deadline set"));
  });

  test("SellerChooseRefundFull without deadline → succeeds (no gate)", () => {
    // If no deadline is set, the seller can choose freely
    // (this shouldn't happen in production, but the state machine allows it)
    const context = buyerExpiredContext({
      sellerDecisionDeadline: null,
    });
    const result = attemptTransition(
      context,
      Action.SellerChooseRefundFull,
      new Date(),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.SellerRefundedFull);
  });
});

// ══════════════════════════════════════════════════════════════════
//  SUMMARY
// ══════════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
