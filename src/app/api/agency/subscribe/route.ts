import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireVerifiedUser, SessionError, sessionErrorResponse } from "@/lib/session";
import { SUBSCRIPTION_PLANS, subscriptionPlanSchema, type SubscriptionPlan } from "@/lib/schemas";

// ──────────────────────────────────────────────────────────────────
//  POST /api/agency/subscribe
//  Creates an AgencySubscription for the current user.
//  Only users with accountCategory = AGENCY can subscribe.
//  In production, this would integrate with a payment gateway (CCP,
//  BaridiMob, Edahabia). For now, it's a stub that marks the
//  subscription as ACTIVE immediately (demo mode).
//
//  Body: { plan: "BASIC" | "PRO" | "ENTERPRISE" }
// ──────────────────────────────────────────────────────────────────

const subscribeSchema = z.object({
  plan: subscriptionPlanSchema,
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "الباقة المختارة غير صالحة" }, { status: 422 });
  }

  const plan = parsed.data.plan as SubscriptionPlan;
  const planConfig = SUBSCRIPTION_PLANS[plan];

  // Verify user is an AGENCY
  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    select: { accountCategory: true, categoryVerified: true },
  });
  if (!fullUser || fullUser.accountCategory !== "AGENCY") {
    return NextResponse.json(
      { error: "هذا المسار مخصص للوكالات العقارية فقط" },
      { status: 403 },
    );
  }
  if (!fullUser.categoryVerified) {
    return NextResponse.json(
      { error: "لم يتم التحقق من فئة الوكالة بعد. تواصل مع الإدارة." },
      { status: 403 },
    );
  }

  // Check for existing active subscription
  const existing = await db.agencySubscription.findUnique({
    where: { userId: user.id },
  });
  if (existing && existing.status === "ACTIVE" && existing.endDate > new Date()) {
    return NextResponse.json({
      ok: false,
      error: "لديك اشتراك نشط بالفعل",
      subscription: {
        plan: existing.plan,
        endDate: existing.endDate,
        listingsLimit: existing.listingsLimit,
      },
    }, { status: 409 });
  }

  // Create subscription (demo: immediate activation, no payment gateway)
  // In production: create payment intent → redirect to gateway → webhook
  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const subscription = await db.agencySubscription.create({
    data: {
      userId: user.id,
      plan,
      amount: planConfig.price,
      listingsLimit: planConfig.listingsLimit,
      startDate: now,
      endDate,
      status: "ACTIVE",
    },
  });

  return NextResponse.json({
    ok: true,
    subscription: {
      id: subscription.id,
      plan: subscription.plan,
      amount: subscription.amount,
      listingsLimit: subscription.listingsLimit,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      status: subscription.status,
    },
  });
}

// GET — returns the current user's subscription status
export async function GET() {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  const subscription = await db.agencySubscription.findUnique({
    where: { userId: user.id },
  });

  if (!subscription) {
    return NextResponse.json({ subscription: null });
  }

  // Count listings created this month
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const listingsThisMonth = await db.listing.count({
    where: { ownerId: user.id, createdAt: { gte: monthAgo } },
  });

  return NextResponse.json({
    subscription: {
      id: subscription.id,
      plan: subscription.plan,
      amount: subscription.amount,
      listingsLimit: subscription.listingsLimit,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      status: subscription.status,
      listingsUsed: listingsThisMonth,
      listingsRemaining: Math.max(0, subscription.listingsLimit - listingsThisMonth),
    },
  });
}
