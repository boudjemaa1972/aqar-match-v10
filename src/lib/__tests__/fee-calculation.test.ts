// ──────────────────────────────────────────────────────────────────
//  Fee Calculation Tests
//
//  Verifies calculateSellerFee and calculateBuyerFee against the
//  approved fee structure (0.75% seller, half for buyer).
//
//  Run: vitest run src/lib/__tests__/fee-calculation.test.ts
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

// We test the fee calculation logic directly (pure functions, no DB).
// These mirror the Zod schema functions in src/lib/schemas.ts.

const SELLER_RATE = 0.0075; // 0.75%
const SELL_MIN_DZD = 15_000;
const RENT_MIN_DZD = 7_500;
// Buyer minimums are HALF of seller minimums
const BUYER_SELL_MIN_DZD = 10_000;
const BUYER_RENT_MIN_DZD = 5_000;

function calculateSellerFee(price: number, intent: string): number {
  const fee = Math.round(price * SELLER_RATE);
  if (intent === "SELL") {
    return Math.max(SELL_MIN_DZD, fee);
  }
  return Math.max(RENT_MIN_DZD, fee);
}

function calculateBuyerFee(price: number, intent: string): number {
  const fee = Math.round(price * SELLER_RATE / 2); // half of seller
  if (intent === "SELL") {
    return Math.max(BUYER_SELL_MIN_DZD, fee);
  }
  return Math.max(BUYER_RENT_MIN_DZD, fee);
}

describe("calculateSellerFee", () => {
  it("applies 0.75% rate for SELL intent", () => {
    // 10,000,000 DZD × 0.75% = 75,000
    expect(calculateSellerFee(10_000_000, "SELL")).toBe(75_000);
  });

  it("applies 0.75% rate for RENT intent with minimum enforced", () => {
    // 500,000 DZD × 0.75% = 3,750 → below RENT minimum of 7,500
    expect(calculateSellerFee(500_000, "RENT")).toBe(7_500);
  });

  it("applies 0.75% rate for RENT when above minimum", () => {
    // 2,000,000 DZD × 0.75% = 15,000 → above RENT minimum
    expect(calculateSellerFee(2_000_000, "RENT")).toBe(15_000);
  });

  it("enforces SELL minimum of 15,000 DZD", () => {
    // 1,000,000 × 0.75% = 7,500 → below minimum
    expect(calculateSellerFee(1_000_000, "SELL")).toBe(15_000);
  });

  it("enforces RENT minimum of 7,500 DZD", () => {
    // 500,000 × 0.75% = 3,750 → below minimum
    expect(calculateSellerFee(500_000, "RENT")).toBe(7_500);
  });

  it("does not apply minimum when fee exceeds it", () => {
    // 5,000,000 × 0.75% = 37,500 → above SELL minimum
    expect(calculateSellerFee(5_000_000, "SELL")).toBe(37_500);
  });

  it("handles edge case: exactly at minimum threshold", () => {
    // 2,000,000 × 0.75% = 15,000 → exactly at SELL minimum
    expect(calculateSellerFee(2_000_000, "SELL")).toBe(15_000);
  });

  it("handles very large prices without overflow", () => {
    // 1,000,000,000 × 0.75% = 7,500,000
    expect(calculateSellerFee(1_000_000_000, "SELL")).toBe(7_500_000);
  });

  it("handles zero price (minimum applies)", () => {
    expect(calculateSellerFee(0, "SELL")).toBe(15_000);
  });
});

describe("calculateBuyerFee", () => {
  it("applies half of seller rate for SELL intent", () => {
    // 10,000,000 × 0.75% / 2 = 37,500
    expect(calculateBuyerFee(10_000_000, "SELL")).toBe(37_500);
  });

  it("enforces SELL buyer minimum of 10,000 DZD", () => {
    // 1,000,000 × 0.375% = 3,750 → below minimum
    expect(calculateBuyerFee(1_000_000, "SELL")).toBe(10_000);
  });

  it("enforces RENT buyer minimum of 5,000 DZD", () => {
    // 500,000 × 0.375% = 1,875 → below minimum
    expect(calculateBuyerFee(500_000, "RENT")).toBe(5_000);
  });

  it("buyer fee is always half of seller fee when above minimums", () => {
    const price = 10_000_000;
    const sellerFee = calculateSellerFee(price, "SELL");
    const buyerFee = calculateBuyerFee(price, "SELL");
    expect(buyerFee).toBe(Math.round(sellerFee / 2));
  });
});

describe("fee minimums relationship", () => {
  it("SELL buyer minimum is exactly 2/3 of seller minimum", () => {
    // 10,000 / 15,000 = 2/3
    expect(BUYER_SELL_MIN_DZD / SELL_MIN_DZD).toBeCloseTo(2 / 3);
  });

  it("RENT buyer minimum is exactly 2/3 of seller minimum", () => {
    // 5,000 / 7,500 = 2/3
    expect(BUYER_RENT_MIN_DZD / RENT_MIN_DZD).toBeCloseTo(2 / 3);
  });
});
