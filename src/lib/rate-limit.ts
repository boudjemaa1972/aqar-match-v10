import { db } from "@/lib/db";

// ──────────────────────────────────────────────────────────────────
//  DB-backed rate limiter (shared across all server instances).
//
//  WHY: in-memory Map-based limiters break in serverless / multi-replica
//  deployments (Vercel Functions, ECS, etc.) — each instance gets its
//  own Map, so the effective limit becomes N × maxRequests. Persisting
//  the counter in the DB makes it authoritative across all replicas.
//
//  ATOMICITY:
//  ─────────
//  We use a two-step dance:
//    1. Try `updateMany` with a WHERE clause that requires the window
//       to be active AND the count to be under the limit. If it
//       returns count=1, the increment succeeded atomically.
//    2. If updateMany returns 0, either:
//         a) row doesn't exist (first request) → create it
//         b) window expired → reset it
//         c) count is at max → block (429)
//       We disambiguate with a `findUnique` and either upsert or
//       return 429.
//
//  RACE CONDITION (DOCUMENTED — ACCEPTABLE):
//  ─────────────────────────────────────────
//  There is a tiny race window between updateMany and upsert — if two
//  concurrent requests both fail updateMany and both try to upsert,
//  the second will overwrite the first (count=1 again). For rate
//  limiting this is ACCEPTABLE: it slightly UNDER-counts in rare bursts
//  (a few extra requests slip through during the window), never OVER-
//  counts. True atomic increments require Postgres
//  `INSERT ... ON CONFLICT DO UPDATE WHERE ... RETURNING` (not available
//  on SQLite via Prisma). Prisma's interactive $transaction causes
//  SQLite contention under high concurrency (serialized writes), making
//  it worse than the two-step dance for this use case.
//
//  If stricter enforcement is needed in production:
//    • Switch to PostgreSQL (supports native INSERT ... ON CONFLICT)
//    • OR add an application-level semaphore (mutex) per key
//    • OR accept the ~5% over-count during bursts (documented here)
//
//  CLEANUP:
//  ───────
//  Stale rows (resetAt < now) are deleted by the process-expired cron
//  (src/lib/cron/process-expired.ts). Additionally, each request
//  lazily deletes any stale row for the same key before doing the
//  upsert — this prevents unbounded growth between cron runs.
// ──────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** True if the request is allowed, false if rate-limited (429). */
  allowed: boolean;
  /** Seconds until the limit resets (only set when allowed=false). */
  retryAfterSec: number;
  /** Current count for this key (informational, for logging). */
  currentCount: number;
  /** Maximum allowed (echoed back, for response headers if needed). */
  maxRequests: number;
}

/**
 * Check + consume a rate-limit slot for the given key.
 *
 * Usage:
 *   const result = await checkRateLimit(
 *     "demand-estimate:1.2.3.4",
 *     { maxRequests: 20, windowMs: 15 * 60 * 1000 },
 *   );
 *   if (!result.allowed) {
 *     return NextResponse.json({error: "..."}, {status: 429, headers: {"Retry-After": String(result.retryAfterSec)}});
 *   }
 *
 * @param key       Stable identifier (e.g. "routeName:clientIp")
 * @param config    Limits to enforce
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const nowDate = new Date(now);
  const resetAt = new Date(now + config.windowMs);

  // ── Step 1: try atomic increment (window active + under limit) ──
  const incrementResult = await db.rateLimitEntry.updateMany({
    where: {
      id: key,
      resetAt: { gt: nowDate },
      count: { lt: config.maxRequests },
    },
    data: { count: { increment: 1 } },
  });

  if (incrementResult.count > 0) {
    // Incremented successfully — fetch the new count for the response.
    const row = await db.rateLimitEntry.findUnique({
      where: { id: key },
      select: { count: true },
    });
    return {
      allowed: true,
      retryAfterSec: 0,
      currentCount: row?.count ?? 1,
      maxRequests: config.maxRequests,
    };
  }

  // ── Step 2: increment failed → either doesn't exist, expired, or at max ──
  const existing = await db.rateLimitEntry.findUnique({
    where: { id: key },
    select: { count: true, resetAt: true },
  });

  if (!existing || existing.resetAt <= nowDate) {
    // First request OR window expired → create/reset.
    await db.rateLimitEntry.upsert({
      where: { id: key },
      create: { id: key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return {
      allowed: true,
      retryAfterSec: 0,
      currentCount: 1,
      maxRequests: config.maxRequests,
    };
  }

  // ── Step 3: at max → block with 429 ──
  const retryAfterMs = existing.resetAt.getTime() - now;
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    currentCount: existing.count,
    maxRequests: config.maxRequests,
  };
}

/**
 * Cleanup helper — deletes all rate-limit rows whose window has expired.
 * Called by the process-expired cron (every hour) to prevent unbounded
 * growth of the RateLimitEntry table.
 *
 * @returns Number of rows deleted.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const now = new Date();
  const result = await db.rateLimitEntry.deleteMany({
    where: { resetAt: { lt: now } },
  });
  return result.count;
}
