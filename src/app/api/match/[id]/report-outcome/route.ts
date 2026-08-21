import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match/[id]/report-outcome
//
//  Post-deal survey: "Did the deal close?"
//  Sent to both parties 10-14 days after contact reveal (BUYER_FEE_PAID).
//  Configurable via OUTCOME_SURVEY_DELAY_DAYS env var (default 12).
//
//  Body: { outcome: "completed" | "completed_different_price" | "not_completed", finalPrice?: number }
//
//  CONFIDENCE: always SELF_REPORTED (user-filled, not verified).
//  For DEVELOPER matches, the platform rep fills it via a different
//  route with confidence = PLATFORM_VERIFIED.
//
//  This is VOLUNTARY — no penalty for skipping. Future incentive:
//  trustPoints field on User (reserved, not implemented yet).
// ──────────────────────────────────────────────────────────────────

const outcomeSchema = z.object({
  outcome: z.enum(["completed", "completed_different_price", "not_completed"]),
  finalPrice: z.number().int().min(0).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await params;
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Verify user is a participant
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: {
      buyerId: true,
      sellerId: true,
      status: true,
      listing: { select: { askingPrice: true, intent: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }
  if (match.buyerId !== user.id && match.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = outcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "النتيجة غير صالحة" }, { status: 422 });
  }

  const { outcome, finalPrice } = parsed.data;
  const isBuyer = match.buyerId === user.id;

  // If "not_completed", we don't create a ClosedDeal — just mark survey as responded
  if (outcome === "not_completed") {
    // If a ClosedDeal already exists (from the other party), update surveyRespondedAt
    const existing = await db.closedDeal.findUnique({ where: { matchId } });
    if (existing) {
      await db.closedDeal.update({
        where: { matchId },
        data: { surveyRespondedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true, outcome: "not_completed" });
  }

  // "completed" or "completed_different_price"
  const actualPrice = outcome === "completed_different_price" && finalPrice
    ? finalPrice
    : match.listing.askingPrice;

  // Check if a ClosedDeal already exists (from the other party or platform)
  const existing = await db.closedDeal.findUnique({ where: { matchId } });
  if (existing) {
    // Update: mark that this party also responded
    await db.closedDeal.update({
      where: { matchId },
      data: {
        surveyRespondedAt: new Date(),
        // If both parties report, upgrade to BOTH
        reportedBy: existing.reportedBy === "BUYER" && isBuyer ? "BUYER"
                   : existing.reportedBy === "SELLER" && !isBuyer ? "SELLER"
                   : "BOTH",
        // If the other party already reported a price, keep the first one
        // (or average them — but for now, first-report wins)
      },
    });
    return NextResponse.json({ ok: true, alreadyExists: true });
  }

  // Create new ClosedDeal with SELF_REPORTED confidence
  await db.closedDeal.create({
    data: {
      matchId,
      finalPrice: actualPrice,
      reportedBy: isBuyer ? "BUYER" : "SELLER",
      confidence: "SELF_REPORTED",
      surveyRespondedAt: new Date(),
      closedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, outcome, finalPrice: actualPrice });
}

// ──────────────────────────────────────────────────────────────────
//  GET /api/match/[id]/report-outcome
//  Returns whether a survey is pending for this match (for UI display)
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await params;
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const match = await db.match.findUnique({
    where: { id: matchId },
    select: {
      buyerId: true,
      sellerId: true,
      status: true,
      buyerFeePaidAt: true,
      closedDeal: { select: { confidence: true, surveyRespondedAt: true, finalPrice: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }
  if (match.buyerId !== user.id && match.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  // Survey is eligible only after BUYER_FEE_PAID + delay period
  const SURVEY_DELAY_DAYS = parseInt(process.env.OUTCOME_SURVEY_DELAY_DAYS || "12");
  const eligible = match.status === "BUYER_FEE_PAID" && match.buyerFeePaidAt
    ? new Date() > new Date(match.buyerFeePaidAt.getTime() + SURVEY_DELAY_DAYS * 24 * 60 * 60 * 1000)
    : false;

  return NextResponse.json({
    surveyEligible: eligible,
    alreadyResponded: !!match.closedDeal?.surveyRespondedAt,
    closedDeal: match.closedDeal
      ? { confidence: match.closedDeal.confidence, finalPrice: match.closedDeal.finalPrice }
      : null,
  });
}
