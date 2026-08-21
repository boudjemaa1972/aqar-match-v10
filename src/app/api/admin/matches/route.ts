import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// GET /api/admin/matches — all matches with filters
export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [matches, total] = await Promise.all([
    db.match.findMany({
      where,
      select: {
        id: true, status: true, score: true, createdAt: true,
        disputeFlag: true, queueRank: true,
        buyer: { select: { id: true, accountCategory: true } },
        seller: { select: { id: true, accountCategory: true } },
        listing: { select: { id: true, intent: true, type: true, city: true, askingPrice: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.match.count({ where }),
  ]);

  return NextResponse.json({ matches, total, page, limit });
}
