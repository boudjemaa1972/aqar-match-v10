import { NextResponse } from "next/server";
import { processExpiredMatches } from "@/lib/cron/process-expired";
import { requireAdminSecret } from "@/lib/admin-guard";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match/process-expired
//
//  SECURED — requires a CRON_SECRET header (fail-closed).
//  See `requireAdminSecret` in `src/lib/admin-guard.ts`.
//
//  Usage from an external cron service (Vercel Cron, GitHub Actions,
//  systemd timer, etc.):
//
//    curl -X POST https://aqarmatch.dz/api/match/process-expired \
//      -H "x-cron-secret: $CRON_SECRET"
//
//  Vercel Cron example (vercel.json):
//    {
//      "crons": [{
//        "path": "/api/match/process-expired",
//        "schedule": "0 * * * *"
//      }]
//    }
//  Vercel automatically sends the `x-cron-secret` header if set in
//  the project's environment variables (CRON_SECRET).
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const guard = requireAdminSecret(req);
  if (guard) return guard;

  const result = await processExpiredMatches();
  return NextResponse.json({
    ok: true,
    summary: result,
  });
}
