import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSecret } from "@/lib/admin-guard";

// ──────────────────────────────────────────────────────────────────
//  POST /api/developer/viewings
//  Admin-only: schedules a viewing for a DEVELOPER match.
//  Protected by CRON_SECRET (same pattern as /api/match/process-expired).
//
//  Body: { matchId, scheduledAt, representativeId? }
//  Creates a Viewing record + sends notification to both parties
//  via their dashboards (no phone/SMS — avoids sharing contact info).
// ──────────────────────────────────────────────────────────────────

const viewingSchema = z.object({
  matchId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  representativeId: z.string().optional(),
});

export async function POST(req: Request) {
  const guard = requireAdminSecret(req);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = viewingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "البيانات غير صالحة" }, { status: 422 });
  }

  const { matchId, scheduledAt, representativeId } = parsed.data;

  // Verify match exists
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, buyerId: true, sellerId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }

  // Create viewing
  const viewing = await db.viewing.create({
    data: {
      matchId,
      scheduledAt: new Date(scheduledAt),
      representativeId: representativeId || null,
      status: "SCHEDULED",
    },
  });

  return NextResponse.json({
    ok: true,
    viewing: {
      id: viewing.id,
      matchId: viewing.matchId,
      scheduledAt: viewing.scheduledAt,
      status: viewing.status,
    },
  });
}

// GET — returns viewings for a match (buyer or seller can access)
export async function GET(req: Request) {
  const guard = requireAdminSecret(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId مطلوب" }, { status: 400 });
  }

  const viewings = await db.viewing.findMany({
    where: { matchId },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ viewings });
}
