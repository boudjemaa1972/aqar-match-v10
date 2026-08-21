import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// GET /api/admin/searches — all match requests
export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  const [requests, total] = await Promise.all([
    db.matchRequest.findMany({
      select: {
        id: true, intent: true, type: true, city: true, commune: true,
        status: true, createdAt: true,
        user: { select: { id: true, accountCategory: true } },
        _count: { select: { matches: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.matchRequest.count(),
  ]);

  return NextResponse.json({
    requests: requests.map((r) => ({
      ...r,
      hasMatches: r._count.matches > 0,
      matchesCount: r._count.matches,
    })),
    total, page, limit,
  });
}
