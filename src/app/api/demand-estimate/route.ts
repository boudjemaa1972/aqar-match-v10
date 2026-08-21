import { NextResponse } from "next/server";
import { estimateDemandForListing } from "@/lib/demand-estimate";
import { checkRateLimit } from "@/lib/rate-limit";
import type { PropertyIntent, PropertyType } from "@/lib/schemas";

// ──────────────────────────────────────────────────────────────────
//  GET /api/demand-estimate
//
//  Public endpoint (no auth required) — returns the count of active
//  buyer requests matching the given criteria. Used by PublishFlow to
//  show sellers the size of their potential buyer pool BEFORE they
//  publish, motivating them to complete the listing.
//
//  SECURITY & PRIVACY:
//  ──────────────────
//  • Returns an AGGREGATE COUNT only — never any buyer PII.
//  • If count < 3, returns count=null (qualitative "low" instead).
//    This prevents competitors from querying narrow criteria to
//    infer the existence of a single specific buyer.
//  • Rate-limited per IP via DB-backed counter (see below).
//
//  RATE LIMITING (DB-BACKED, MULTI-INSTANCE SAFE):
//  ────────────────────────────────────────────
//  • 20 requests per IP per 15 minutes (generous for a normal publish
//    flow that may re-query as the seller edits fields, but blocks
//    bulk market-intel scraping).
//  • Returns 429 with Retry-After header when exceeded.
//  • Backed by the RateLimitEntry Prisma model — counters are shared
//    across ALL server instances (works in serverless / multi-replica
//    deployments like Vercel Functions). See src/lib/rate-limit.ts.
//  • Stale entries are cleaned up by the process-expired cron and via
//    lazy cleanup on read.
//
//  QUERY PARAMS:
//  ────────────
//  • intent       — SELL | RENT | SEASONAL_RENT  (required)
//  • propertyType — APARTMENT | VILLA | ...        (required)
//  • wilaya       — string (Arabic name)            (required)
//  • commune      — string (Arabic name)            (optional)
//  • askingPrice  — integer DZD                     (optional, but
//                     strongly recommended for budget filter)
// ──────────────────────────────────────────────────────────────────

// ── Rate limit config (DB-backed, shared across instances) ──────
const RATE_LIMIT_CONFIG = {
  maxRequests: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
} as const;

// Prefix for the rate-limit key — combining route name + IP lets
// multiple rate-limited routes share the same RateLimitEntry table.
const RATE_LIMIT_KEY_PREFIX = "demand-estimate:";

// ── Allowed enum values (mirror Prisma enum, kept in sync manually) ──
const ALLOWED_INTENTS = new Set(["SELL", "RENT", "SEASONAL_RENT"]);
const ALLOWED_TYPES = new Set([
  "APARTMENT", "VILLA", "STUDIO", "DUPLEX", "INDIVIDUAL_HOUSE",
  "COMMERCIAL", "BUILDABLE_LAND", "AGRICULTURAL_LAND",
]);

function getClientIp(req: Request): string {
  // Caddy/gateway sets X-Forwarded-For; fall back to "unknown" if missing.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    return parts[0]?.trim() || "unknown";
  }
  return "unknown";
}

export async function GET(req: Request) {
  // ── Rate limit (DB-backed, multi-instance safe) ───────────────
  const clientIp = getClientIp(req);
  const rl = await checkRateLimit(
    `${RATE_LIMIT_KEY_PREFIX}${clientIp}`,
    RATE_LIMIT_CONFIG,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تم تجاوز حد الطلبات. حاول بعد قليل." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          "X-RateLimit-Limit": String(rl.maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // ── Parse + validate query params ─────────────────────────────
  const url = new URL(req.url);
  const intent = url.searchParams.get("intent");
  const propertyType = url.searchParams.get("propertyType");
  const wilaya = url.searchParams.get("wilaya");
  const commune = url.searchParams.get("commune");
  const askingPriceRaw = url.searchParams.get("askingPrice");

  if (!intent || !ALLOWED_INTENTS.has(intent)) {
    return NextResponse.json(
      { error: "intent مطلوب ويجب أن يكون SELL أو RENT أو SEASONAL_RENT" },
      { status: 400 },
    );
  }
  if (!propertyType || !ALLOWED_TYPES.has(propertyType)) {
    return NextResponse.json(
      { error: "propertyType مطلوب وغير صالح" },
      { status: 400 },
    );
  }
  if (!wilaya || wilaya.length < 2) {
    return NextResponse.json(
      { error: "wilaya مطلوبة" },
      { status: 400 },
    );
  }

  // askingPrice is optional but if provided, must be a positive integer.
  let askingPrice: number | undefined;
  if (askingPriceRaw !== null && askingPriceRaw !== "") {
    const parsed = Number(askingPriceRaw);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      return NextResponse.json(
        { error: "askingPrice يجب أن يكون عدداً صحيحاً موجباً" },
        { status: 400 },
      );
    }
    askingPrice = parsed;
  }

  // ── Compute demand estimate ──────────────────────────────────
  try {
    const result = await estimateDemandForListing({
      intent: intent as PropertyIntent,
      propertyType: propertyType as PropertyType,
      wilaya,
      commune: commune || null,
      askingPrice,
    });

    return NextResponse.json({
      count: result.count, // null if below threshold
      bucket: result.bucket,
      isBelowThreshold: result.isBelowThreshold,
      scopedToCommune: result.scopedToCommune,
    });
  } catch (e) {
    console.error("[demand-estimate] error:", e);
    return NextResponse.json(
      { error: "فشل تقدير الطلب. حاول لاحقاً." },
      { status: 500 },
    );
  }
}
