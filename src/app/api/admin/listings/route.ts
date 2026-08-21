import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// GET /api/admin/listings — all listings with filters
export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }
  const url = new URL(req.url);
  const intent = url.searchParams.get("intent");
  const city = url.searchParams.get("city");
  const status = url.searchParams.get("status");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  const where: Record<string, unknown> = {};
  if (intent) where.intent = intent;
  if (city) where.city = city;
  if (status) where.status = status;

  const [listings, total] = await Promise.all([
    db.listing.findMany({
      where,
      select: {
        id: true, intent: true, type: true, city: true, commune: true,
        askingPrice: true, status: true, createdAt: true,
        owner: { select: { id: true, accountCategory: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.listing.count({ where }),
  ]);

  return NextResponse.json({ listings, total, page, limit });
}
