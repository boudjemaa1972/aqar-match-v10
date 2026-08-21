import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────────
//  requireAdminSecret — fail-closed guard for admin/cron endpoints.
//
//  Pattern:
//    1. If CRON_SECRET env var is unset OR shorter than 16 chars
//       → return 503 (server misconfigured — refuses to run).
//    2. If incoming request has no x-cron-secret header AND no
//       Authorization: Bearer header → return 401.
//    3. If header value doesn't match CRON_SECRET → return 401.
//    4. Else: pass through (caller is authorized system).
//
//  Usage:
//    const guard = requireAdminSecret(req);
//    if (guard) return guard; // returns NextResponse on failure
//
//  This is intentionally synchronous — env + header reads are sync.
// ──────────────────────────────────────────────────────────────────

export function requireAdminSecret(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    return NextResponse.json(
      { error: "Admin secret not configured — endpoint disabled" },
      { status: 503 },
    );
  }
  const headerSecret =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!headerSecret || headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null; // pass-through
}

// Convenience: same logic, returns true/false for inline use
export function hasAdminSecret(req: Request): boolean {
  return requireAdminSecret(req) === null;
}
