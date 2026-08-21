import { NextResponse } from "next/server";
import { findNewMatchesForPendingRequests } from "@/lib/cron/find-new-matches";
import { requireAdminSecret } from "@/lib/admin-guard";

// ──────────────────────────────────────────────────────────────────
//  POST /api/cron/find-new-matches
//
//  SECURED — requires CRON_SECRET header (fail-closed).
//  See `requireAdminSecret` in `src/lib/admin-guard.ts`.
//
//  Scans all OPEN MatchRequests and tries to match them against
//  listings published AFTER each request was created. For each new
//  (request, listing) pair that matches stage-2 criteria, creates:
//    • a Match row (status=PROPOSED, same lifecycle as a normal match)
//    • a MatchNotification row (IN_APP channel only)
//
//  Recommended cadence: every 10–30 minutes.
//
//  Usage from an external cron service:
//    curl -X POST https://aqarmatch.dz/api/cron/find-new-matches \
//      -H "x-cron-secret: $CRON_SECRET"
//
//  Vercel Cron example (vercel.json):
//    {
//      "crons": [{
//        "path": "/api/cron/find-new-matches",
//        "schedule": "*/15 * * * *"
//      }]
//    }
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const guard = requireAdminSecret(req);
  if (guard) return guard;

  const result = await findNewMatchesForPendingRequests();
  return NextResponse.json({
    ok: true,
    summary: result,
  });
}
