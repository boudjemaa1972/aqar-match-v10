import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/reviews — create a review (PENDING, needs approval)
//
//  Eligibility:
//    1. User must be logged in (session cookie).
//    2. User must be a party (buyer or seller) in the matchId provided.
//    3. The match must have reached BUYER_FEE_PAID (completed).
//    4. No existing review from this user for this matchId.
//
//  The review is created as PENDING — it does NOT appear on the
//  homepage until an admin approves it via PATCH /api/admin/reviews/[id].
// ──────────────────────────────────────────────────────────────────

const reviewSchema = z.object({
  matchId: z.string().min(1, "معرف المطابقة مطلوب"),
  rating: z.number().int().min(1, "التقييم مطلوب").max(5, "الحد الأقصى 5"),
  comment: z.string().min(10, "التعليق قصير جداً (10 أحرف على الأقل)").max(500, "الحد الأقصى 500 حرف"),
});

export async function POST(req: Request) {
  const user = await getOrCreateSession();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }

  const { matchId, rating, comment } = parsed.data;

  // ── Check match exists and user is a party ───────────────────
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { buyerId: true, sellerId: true, status: true },
  });

  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }

  const isBuyer = match.buyerId === user.id;
  const isSeller = match.sellerId === user.id;
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ error: "لست طرفاً في هذه المطابقة" }, { status: 403 });
  }

  // ── Check match is completed ─────────────────────────────────
  if (match.status !== "BUYER_FEE_PAID") {
    return NextResponse.json(
      { error: "لا يمكن التقييم إلا بعد إتمام المطابقة كاملة (دفع الطرفين)" },
      { status: 400 },
    );
  }

  // ── Check no duplicate review for this match+user ────────────
  const existing = await db.review.findFirst({
    where: { userId: user.id, matchId },
  });
  if (existing) {
    return NextResponse.json({ error: "سبق وأن أرسلت تقييماً لهذه المطابقة" }, { status: 409 });
  }

  // ── Create review (PENDING) ─────────────────────────────────
  const review = await db.review.create({
    data: {
      userId: user.id,
      matchId,
      role: isBuyer ? "BUYER" : "SELLER",
      rating,
      comment,
      status: "PENDING",
    },
  });

  return NextResponse.json({
    ok: true,
    reviewId: review.id,
    status: "PENDING",
    message: "تم استلام تقييمك بنجاح. سيظهر على المنصة بعد مراجعته من فريق الإدارة.",
  });
}

// ──────────────────────────────────────────────────────────────────
//  GET /api/reviews — public, returns APPROVED reviews only
//  GET /api/reviews?matchId=xxx — returns the current user's review
//    for that specific match (if any), for the UI to show "already
//    reviewed" state instead of the form.
//
//  Returns up to 20 approved reviews, newest first.
//  User info is masked: only first name + initial of last name.
//  No phone, email, or full name is ever returned.
// ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");

  // ── If matchId is provided, return the current user's review for it ──
  if (matchId) {
    const user = await getOrCreateSession();
    const review = await db.review.findFirst({
      where: { userId: user.id, matchId },
      select: { id: true, rating: true, comment: true, status: true, createdAt: true },
    });
    return NextResponse.json({ review });
  }

  // ── Public: return APPROVED reviews ──
  const reviews = await db.review.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: {
        select: { nameEnc: true, role: true },
      },
    },
  });

  // Decrypt + mask user names
  const { decryptJSON } = await import("@/lib/crypto");
  const maskedReviews = await Promise.all(
    reviews.map(async (r) => {
      let displayName = "مستخدم";
      try {
        const nameData = await decryptJSON<{ name?: string }>(r.user.nameEnc);
        if (nameData?.name) {
          // Mask: "أحمد بن علي" → "أحمد ب."
          const parts = nameData.name.trim().split(/\s+/);
          if (parts.length >= 2) {
            displayName = `${parts[0]} ${parts[1][0]}.`;
          } else {
            displayName = parts[0];
          }
        }
      } catch {}

      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        role: r.role,
        displayName,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );

  return NextResponse.json({ reviews: maskedReviews });
}
