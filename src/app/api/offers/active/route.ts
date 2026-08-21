import { NextResponse } from "next/server";
import { getActiveOffer } from "@/lib/fees";

// GET /api/offers/active?category=INDIVIDUAL
// Returns the active promotional offer for the given category (or null).
// Public endpoint — no auth required (used on homepage banner + fee display).

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") as "INDIVIDUAL" | "AGENCY" | "DEVELOPER" | null;
  if (!category || !["INDIVIDUAL", "AGENCY", "DEVELOPER"].includes(category)) {
    return NextResponse.json({ offer: null });
  }
  const offer = await getActiveOffer(category);
  return NextResponse.json({ offer });
}
