import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ──────────────────────────────────────────────────────────────────
//  GET /api/stats — public platform statistics for homepage display.
//  Returns: { active, sale, rent, seasonal }
// ──────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [active, sale, rent, seasonal] = await Promise.all([
      db.listing.count({ where: { status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { intent: "SELL", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { intent: "RENT", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { intent: "SEASONAL_RENT", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
    ]);
    return NextResponse.json({ active, sale, rent, seasonal });
  } catch {
    return NextResponse.json({ active: 0, sale: 0, rent: 0, seasonal: 0 });
  }
}
