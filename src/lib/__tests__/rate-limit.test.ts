// ──────────────────────────────────────────────────────────────────
//  Rate Limiting Tests
//
//  Tests the core rate-limit logic (checkRateLimit) and verifies:
//  1. Basic limit enforcement
//  2. Window expiry resets counter
//  3. Multiple keys are independent
//  4. Cleanup function works
//
//  NOTE: These tests use the real DB (SQLite in dev). They are
//  integration tests that verify the two-step dance in rate-limit.ts.
//  For pure unit tests, mock the DB layer.
//
//  Run: vitest run src/lib/__tests__/rate-limit.test.ts
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Import the actual rate limit function
// We need to handle the db import path alias
let checkRateLimit: typeof import("@/lib/rate-limit").checkRateLimit;
let cleanupExpiredRateLimits: typeof import("@/lib/rate-limit").cleanupExpiredRateLimits;

beforeAll(async () => {
  // Dynamically import to handle path aliases
  const mod = await import("../../lib/rate-limit");
  checkRateLimit = mod.checkRateLimit;
  cleanupExpiredRateLimits = mod.cleanupExpiredRateLimits;
});

// Clean up test entries before each test
beforeEach(async () => {
  await db.rateLimitEntry.deleteMany({
    where: { id: { startsWith: "test:" } },
  });
});

afterAll(async () => {
  await db.rateLimitEntry.deleteMany({
    where: { id: { startsWith: "test:" } },
  });
  await db.$disconnect();
});

describe("checkRateLimit — basic enforcement", () => {
  it("allows first request (count=1)", async () => {
    const result = await checkRateLimit("test:basic-1", {
      maxRequests: 3,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(1);
    expect(result.maxRequests).toBe(3);
  });

  it("allows requests up to the limit", async () => {
    const key = "test:basic-up-to";
    const config = { maxRequests: 3, windowMs: 60_000 };

    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks when limit exceeded", async () => {
    const key = "test:basic-block";
    const config = { maxRequests: 2, windowMs: 60_000 };

    // Use up the limit
    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    // Third request should be blocked
    const result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("returns correct retryAfterSec", async () => {
    const key = "test:retry-after";
    const config = { maxRequests: 1, windowMs: 60_000 };

    await checkRateLimit(key, config);
    const result = await checkRateLimit(key, config);

    expect(result.allowed).toBe(false);
    // retryAfterSec should be between 1 and 60 (window is 60s)
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSec).toBeLessThanOrEqual(60);
  });
});

describe("checkRateLimit — window expiry", () => {
  it("resets counter after window expires", async () => {
    const key = "test:expiry";
    const config = { maxRequests: 2, windowMs: 100 }; // 100ms window

    // Use up the limit
    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    // Should be blocked
    let result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));

    // Should be allowed again (new window)
    result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(1);
  });
});

describe("checkRateLimit — key isolation", () => {
  it("different keys are independent", async () => {
    const config = { maxRequests: 1, windowMs: 60_000 };

    // Key A uses its slot
    await checkRateLimit("test:key-a", config);

    // Key B should still be allowed
    const resultB = await checkRateLimit("test:key-b", config);
    expect(resultB.allowed).toBe(true);

    // Key A should be blocked
    const resultA = await checkRateLimit("test:key-a", config);
    expect(resultA.allowed).toBe(false);
  });
});

describe("checkRateLimit — concurrent requests (DOCUMENTED RACE WINDOW)", () => {
  // The two-step dance (updateMany + upsert) has a known race window
  // under high concurrency: more requests than maxRequests may be allowed.
  // This is ACCEPTABLE for rate limiting — it UNDER-counts (slightly),
  // never OVER-counts. See rate-limit.ts header comment for full rationale.
  //
  // Prisma's interactive $transaction causes SQLite contention under
  // high concurrency (serialized writes), making it worse than the
  // two-step dance for this use case.
  //
  // When stricter enforcement is needed: switch to PostgreSQL
  // (supports INSERT ... ON CONFLICT DO UPDATE WHERE ...).

  it("allows more than maxRequests under high concurrency (known race)", async () => {
    const key = "test:concurrent-known-race";
    const config = { maxRequests: 5, windowMs: 60_000 };
    const N = 20;

    const results = await Promise.all(
      Array.from({ length: N }, () => checkRateLimit(key, config)),
    );

    const allowed = results.filter((r) => r.allowed);
    // Known: under concurrency, more than 5 can get through (race window)
    // This documents the behavior — not a bug, a documented trade-off
    expect(allowed.length).toBeGreaterThanOrEqual(5);
    // But it should never allow ALL 20 (that would be a serious bug)
    expect(allowed.length).toBeLessThan(N);
  });

  it("at least 1 request always succeeds (atomic first-create)", async () => {
    const key = "test:concurrent-min";
    const config = { maxRequests: 10, windowMs: 60_000 };
    const N = 50;

    const results = await Promise.all(
      Array.from({ length: N }, () => checkRateLimit(key, config)),
    );

    const allowed = results.filter((r) => r.allowed);
    expect(allowed.length).toBeGreaterThanOrEqual(1);
  });
});

describe("cleanupExpiredRateLimits", () => {
  it("deletes expired entries", async () => {
    // Create an expired entry manually
    const pastDate = new Date(Date.now() - 1000);
    await db.rateLimitEntry.create({
      data: {
        id: "test:expired-cleanup",
        count: 5,
        resetAt: pastDate,
      },
    });

    const deleted = await cleanupExpiredRateLimits();
    expect(deleted).toBeGreaterThanOrEqual(1);

    // Verify it's gone
    const remaining = await db.rateLimitEntry.findUnique({
      where: { id: "test:expired-cleanup" },
    });
    expect(remaining).toBeNull();
  });

  it("does not delete active entries", async () => {
    const futureDate = new Date(Date.now() + 60_000);
    await db.rateLimitEntry.create({
      data: {
        id: "test:active-cleanup",
        count: 3,
        resetAt: futureDate,
      },
    });

    await cleanupExpiredRateLimits();

    const remaining = await db.rateLimitEntry.findUnique({
      where: { id: "test:active-cleanup" },
    });
    expect(remaining).not.toBeNull();
  });
});
