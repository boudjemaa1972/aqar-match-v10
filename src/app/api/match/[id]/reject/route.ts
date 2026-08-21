import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireBuyerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";
import {
  adjustWeightsFromRejection,
  DEFAULT_WEIGHTS,
  type RejectionReasonType,
  type UserWeights,
} from "@/lib/matching-engine";

// ──────────────────────────────────────────────────────────────────
//  POST /api/match/[id]/reject
//
//  Buyer sees a match but refuses to pay the fee — clicks
//  "هذا لا يناسبني" with a reason. This endpoint:
//
//    1. Records the rejection (MatchRejection) with the reason.
//    2. Loads (or creates) the user's UserWeightProfile.
//    3. Calls adjustWeightsFromRejection() to shift the weights.
//    4. Persists the new weights.
//    5. Marks the match as REJECTED (so the queue can advance).
//
//  The rejection data is the "fuel" that makes the platform
//  smarter. Each rejection teaches the algorithm what the user
//  actually cares about — not what they SAID they cared about
//  when filling the search form.
// ──────────────────────────────────────────────────────────────────

const rejectSchema = z.object({
  reason: z.enum([
    "PRICE_TOO_HIGH",
    "LOCATION_NOT_IDEAL",
    "TOO_FEW_ROOMS",
    "TOO_MANY_ROOMS",
    "AREA_TOO_SMALL",
    "AREA_TOO_LARGE",
    "LEGAL_STATUS_WEAK",
    "DATES_NOT_AVAILABLE",
    "OTHER",
  ]),
  customNote: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "سبب الرفض غير صالح" },
      { status: 422 },
    );
  }

  const { reason, customNote } = parsed.data;

  let ctx;
  try {
    ctx = await requireBuyerOfMatch(id);
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  const { match, user } = ctx;

  // ── 1. Record the rejection ──────────────────────────────────
  await db.matchRejection.create({
    data: {
      matchId: match.id,
      userId: user.id,
      score: match.score,
      intent: match.listing.intent,
      type: match.listing.type,
      city: match.listing.city,
      commune: match.listing.commune,
      askingPrice: match.listing.askingPrice,
      bedrooms: match.listing.bedrooms,
      bathrooms: match.listing.bathrooms,
      reason,
      customNote: customNote || null,
    },
  });

  // ── 2. Mark match as REJECTED (queue will advance) ───────────
  await db.match.update({
    where: { id: match.id },
    data: { status: "REJECTED" },
  });
  await db.matchQueue.updateMany({
    where: { matchId: match.id },
    data: { status: "CONSUMED" },
  });

  // ── 3. Load or create user weight profile ────────────────────
  let profile = await db.userWeightProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    profile = await db.userWeightProfile.create({
      data: {
        userId: user.id,
        priceWeight: DEFAULT_WEIGHTS.price,
        locationWeight: DEFAULT_WEIGHTS.location,
        featuresWeight: DEFAULT_WEIGHTS.features,
      },
    });
  }

  // ── 4. Adjust weights ────────────────────────────────────────
  const currentWeights: UserWeights = {
    price: profile.priceWeight,
    location: profile.locationWeight,
    features: profile.featuresWeight,
  };

  const newWeights = adjustWeightsFromRejection(
    currentWeights,
    reason as RejectionReasonType,
    profile.learningRate,
  );

  // ── 5. Update stats + persist new weights ────────────────────
  const categoryMap: Record<string, "priceRejections" | "locationRejections" | "featuresRejections"> = {
    PRICE_TOO_HIGH: "priceRejections",
    LOCATION_NOT_IDEAL: "locationRejections",
    DATES_NOT_AVAILABLE: "locationRejections",
    TOO_FEW_ROOMS: "featuresRejections",
    TOO_MANY_ROOMS: "featuresRejections",
    AREA_TOO_SMALL: "featuresRejections",
    AREA_TOO_LARGE: "featuresRejections",
    LEGAL_STATUS_WEAK: "featuresRejections",
    OTHER: "featuresRejections", // default
  };

  const rejectionField = categoryMap[reason] || "featuresRejections";

  await db.userWeightProfile.update({
    where: { userId: user.id },
    data: {
      priceWeight: newWeights.price,
      locationWeight: newWeights.location,
      featuresWeight: newWeights.features,
      totalRejections: { increment: 1 },
      [rejectionField]: { increment: 1 },
    },
  });

  return NextResponse.json({
    ok: true,
    message: "تم تسجيل ملاحظتك. سنحسّن نتائجك القادمة بناءً عليها.",
    weights: newWeights,
    weightShift: {
      before: currentWeights,
      after: newWeights,
      reason,
    },
  });
}
