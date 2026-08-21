// ──────────────────────────────────────────────────────────────────
//  Request helpers — IP extraction + user agent parsing.
//  Used by auth endpoints for rate limiting + audit logging.
// ──────────────────────────────────────────────────────────────────

/**
 * Extract the client IP from a Request, accounting for proxies.
 *
 * Hierarchy:
 *  1. X-Forwarded-For (first IP — the original client)
 *  2. X-Real-IP (some proxies like Nginx set this)
 *  3. CF-Connecting-IP (Cloudflare)
 *  4. "unknown" (fallback — rate limiter treats all unknowns as one bucket)
 *
 * SECURITY NOTE: X-Forwarded-For can be spoofed if the app is directly
 * exposed without a trusted proxy. In production, ensure the gateway
 * (Caddy/Nginx/Cloudflare) overwrites X-Forwarded-For before forwarding.
 */
import type { NextRequest } from "next/server";

export function getClientIp(req: Request | NextRequest): string {
  const headers = req.headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    return parts[0]?.trim() || "unknown";
  }
  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

/**
 * Get the User-Agent string (for audit logging + device fingerprinting).
 * Returns null if missing (rare but valid for some API clients).
 */
export function getUserAgent(req: Request | NextRequest): string | null {
  return req.headers.get("user-agent");
}
