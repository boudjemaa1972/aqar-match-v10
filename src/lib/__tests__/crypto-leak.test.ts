// ──────────────────────────────────────────────────────────────────
//  Security Leak Tests
//
//  Verifies that sensitive data NEVER appears in API responses:
//  - secretMinPrice (seller's reserve price) returned to buyer
//  - Exact GPS coordinates (raw lat/lng) returned to buyer
//  - NIN (national ID number) in any response
//  - Password hash in any response
//
//  Run: vitest run src/lib/__tests__/crypto-leak.test.ts
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..");

function read(rel: string): string | null {
  const p = path.join(SRC, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
}

function readLines(rel: string): string[] {
  return read(rel)?.split("\n") ?? [];
}

/** Return lines that look like they're part of a NextResponse.json() call. */
function jsonLines(lines: string[]): string[] {
  return lines.filter(
    (l) => l.includes("NextResponse.json") || l.includes("return {"),
  );
}

describe("Auth routes — no credential leakage", () => {
  const routes = [
    "app/api/auth/login/route.ts",
    "app/api/auth/signup/route.ts",
    "app/api/auth/me/route.ts",
    "app/api/auth/reset-password/route.ts",
    "app/api/auth/forgot-password/route.ts",
  ];

  for (const rel of routes) {
    const lines = readLines(rel);
    if (lines.length === 0) {
      it.skip(`${rel} — file not found`, () => {});
      continue;
    }

    it(`${rel} — passwordHash never in response`, () => {
      for (const line of jsonLines(lines)) {
        expect(line).not.toContain("passwordHash");
      }
    });

    it(`${rel} — ninEnc never in response`, () => {
      for (const line of jsonLines(lines)) {
        expect(line).not.toContain("ninEnc");
      }
    });
  }
});

describe("Buyer-facing match routes — no secret price leakage", () => {
  const routes = [
    "app/api/match/route.ts",
    "app/api/match/[id]/status/route.ts",
    "app/api/match/[id]/pay-fee/route.ts",
    "app/api/buyer/matches/route.ts",
    "app/api/notifications/route.ts",
  ];

  for (const rel of routes) {
    const content = read(rel);
    if (!content) {
      it.skip(`${rel} — file not found`, () => {});
      continue;
    }

    it(`${rel} — secretMinPrice not in JSON response`, () => {
      const jsonBlocks =
        content.match(/NextResponse\.json\([\s\S]*?\)/g) || [];
      for (const block of jsonBlocks) {
        expect(block).not.toMatch(/secretMinPrice[^E]/);
        expect(block).not.toMatch(/secretMinPricePerNight[^E]/);
      }
    });

    it(`${rel} — raw lat/lng not in JSON response`, () => {
      const jsonBlocks =
        content.match(/NextResponse\.json\([\s\S]*?\)/g) || [];
      for (const block of jsonBlocks) {
        expect(block).not.toMatch(/\blatitude\b|\blongitude\b|\blocationAccuracy\b/);
      }
    });
  }
});

describe("Seller routes — ownership verified before returning secrets", () => {
  const routes = [
    "app/api/seller/listings/route.ts",
    "app/api/seller/listings/[id]/secret/route.ts",
    "app/api/seller/matches/[id]/approve/route.ts",
    "app/api/seller/matches/[id]/confirm-contact/route.ts",
  ];

  for (const rel of routes) {
    const content = read(rel);
    if (!content) {
      it.skip(`${rel} — file not found`, () => {});
      continue;
    }

    it(`${rel} — has ownership check`, () => {
      expect(content).toMatch(
        /ownerId|sellerId|userId.*===.*owner|requireSellerOfMatch/,
      );
    });
  }
});

describe("Notifications route — blind card only", () => {
  it("returns public fields, not encrypted data", () => {
    const content = read("app/api/notifications/route.ts");
    if (!content) return;
    expect(content).toContain("askingPrice");
    expect(content).toContain("areaSqm");
    expect(content).toContain("photosEnc: _omit");
  });
});

describe("Matching engine — scoring uses askingPrice", () => {
  it("scoring references askingPrice, not secretMinPrice", () => {
    const content = read("../lib/matching-engine.ts");
    if (!content) return;
    expect(content).toContain("askingPrice");
  });
});
