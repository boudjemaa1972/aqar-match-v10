// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Meeting Agreement Tests
//
//  Tests the meeting agreement flow:
//    1. Propose → approve → completed
//    2. Conflicting proposals
//    3. 7-day timeout → MEETING_AGREEMENT_FAILED
//    4. Reject meeting date
//    5. Boundary: attempt after deadline
//
//  Run with: npx tsx src/lib/match/__tests__/03-meeting-agreement.test.ts
// ──────────────────────────────────────────────────────────────────

import assert from "node:assert";
import {
  attemptTransition,
  isFinal,
  type MatchContext,
} from "../state-machine";
import { MatchLifecycleStatus, Action, TIME_WINDOWS } from "../constants";

// ── Helper: create a MeetingAgreementPending context ────────────
function meetingPendingContext(
  overrides: Partial<MatchContext> = {},
): MatchContext {
  const now = new Date();
  return {
    status: MatchLifecycleStatus.MeetingAgreementPending,
    createdAt: now,
    sellerDeadline: null,
    buyerDeadline: null,
    sellerConfirmDeadline: null,
    buyerAckDeadline: null,
    refundDeadline: null,
    sellerDecisionDeadline: null,
    buyerCompensationDeadline: null,
    meetingAgreementDeadline: new Date(
      now.getTime() + TIME_WINDOWS.MEETING_AGREEMENT * 3600000,
    ),
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
//  TEST 1: Happy path — propose → approve → completed
// ══════════════════════════════════════════════════════════════════
suite("Scenario 1: Happy path — propose → approve → COMPLETED", () => {
  test("ProposeMeetingDate from MEETING_AGREEMENT_PENDING → stays in same state", () => {
    const context = meetingPendingContext();
    const result = attemptTransition(
      context,
      Action.ProposeMeetingDate,
      new Date(),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementPending);
    assert.strictEqual(result.timeCheckApplied, true);
  });

  test("ApproveMeetingDate from MEETING_AGREEMENT_PENDING → COMPLETED", () => {
    const context = meetingPendingContext();
    const result = attemptTransition(
      context,
      Action.ApproveMeetingDate,
      new Date(),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.Completed);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.Completed), true);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 2: Reject meeting date
// ══════════════════════════════════════════════════════════════════
suite("Scenario 2: Reject meeting date → MEETING_AGREEMENT_FAILED", () => {
  test("RejectMeetingDate from MEETING_AGREEMENT_PENDING → MEETING_AGREEMENT_FAILED", () => {
    const context = meetingPendingContext();
    const result = attemptTransition(
      context,
      Action.RejectMeetingDate,
      new Date(),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementFailed);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.strictEqual(isFinal(MatchLifecycleStatus.MeetingAgreementFailed), true);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 3: 7-day timeout → MEETING_AGREEMENT_FAILED
// ══════════════════════════════════════════════════════════════════
suite("Scenario 3: 7-day timeout → MEETING_AGREEMENT_FAILED", () => {
  const deadline = new Date("2026-01-08T00:00:00Z");

  test("MeetingAgreementWindowExpires succeeds after 7 days", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.MeetingAgreementWindowExpires,
      new Date("2026-01-08T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementFailed);
    assert.strictEqual(result.timeCheckApplied, true);
  });

  test("MeetingAgreementWindowExpires rejected before 7 days", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.MeetingAgreementWindowExpires,
      new Date("2026-01-05T00:00:00Z"), // 3 days after start, still within 7 days
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("not expired"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 4: Boundary — attempt at exact deadline moment
// ══════════════════════════════════════════════════════════════════
suite("Scenario 4: Boundary — exact deadline moment", () => {
  const deadline = new Date("2026-01-08T00:00:00Z");

  test("ProposeMeetingDate at exact deadline → rejected (>=)", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.ProposeMeetingDate,
      new Date("2026-01-08T00:00:00Z"),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("expired"));
  });

  test("ApproveMeetingDate at exact deadline → rejected (>=)", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.ApproveMeetingDate,
      new Date("2026-01-08T00:00:00Z"),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("expired"));
  });

  test("MeetingAgreementWindowExpires at exact deadline → succeeds (>=)", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const result = attemptTransition(
      context,
      Action.MeetingAgreementWindowExpires,
      new Date("2026-01-08T00:00:00Z"),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementFailed);
  });

  test("ProposeMeetingDate 1ms before deadline → succeeds", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const justBefore = new Date("2026-01-07T23:59:59.999Z");
    const result = attemptTransition(
      context,
      Action.ProposeMeetingDate,
      justBefore,
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementPending);
  });

  test("MeetingAgreementWindowExpires 1ms before deadline → rejected", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: deadline,
    });
    const justBefore = new Date("2026-01-07T23:59:59.999Z");
    const result = attemptTransition(
      context,
      Action.MeetingAgreementWindowExpires,
      justBefore,
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("not expired"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 5: No deadline set → rejected (defensive)
// ══════════════════════════════════════════════════════════════════
suite("Scenario 5: No deadline set → rejected (defensive)", () => {
  test("MeetingAgreementWindowExpires without deadline → rejected", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: null,
    });
    const result = attemptTransition(
      context,
      Action.MeetingAgreementWindowExpires,
      new Date(),
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.timeCheckApplied, true);
    assert.ok(result.error?.includes("No meeting agreement deadline set"));
  });

  test("ProposeMeetingDate without deadline → succeeds (no gate)", () => {
    const context = meetingPendingContext({
      meetingAgreementDeadline: null,
    });
    const result = attemptTransition(
      context,
      Action.ProposeMeetingDate,
      new Date(),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.to, MatchLifecycleStatus.MeetingAgreementPending);
  });
});

// ══════════════════════════════════════════════════════════════════
//  TEST 6: Cannot transition from final states
// ══════════════════════════════════════════════════════════════════
suite("Scenario 6: Cannot transition from final states", () => {
  test("ProposeMeetingDate rejected from Completed", () => {
    const context = meetingPendingContext({
      status: MatchLifecycleStatus.Completed,
    });
    const result = attemptTransition(
      context,
      Action.ProposeMeetingDate,
      new Date(),
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Cannot transition from final state"));
  });

  test("ApproveMeetingDate rejected from MeetingAgreementFailed", () => {
    const context = meetingPendingContext({
      status: MatchLifecycleStatus.MeetingAgreementFailed,
    });
    const result = attemptTransition(
      context,
      Action.ApproveMeetingDate,
      new Date(),
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Cannot transition from final state"));
  });
});

// ══════════════════════════════════════════════════════════════════
//  SUMMARY
// ══════════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════════════`);
if (failed > 0) process.exit(1);
