import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  GET /api/admin/reviews?status=PENDING
//
//  Returns reviews filtered by status (default: PENDING).
//  Ordered oldest-first (FIFO) so old reviews don't get buried.
//  Protected by requireAdmin() — session-based admin role.
//
//  For each review, returns: id, rating, comment, role, createdAt,
//  matchId, and masked user display name (no phone/email).
// ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "PENDING";

  // Validate status — cast to the Prisma enum type
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 422 });
  }
  const statusFilter = status as "PENDING" | "APPROVED" | "REJECTED";

  const reviews = await db.review.findMany({
    where: { status: statusFilter },
    orderBy: { createdAt: "asc" }, // FIFO — oldest first
    take: 100,
    include: {
      user: {
        select: { nameEnc: true, accountCategory: true },
      },
    },
  });

  // Decrypt + mask user names (no phone/email exposed)
  const { decryptJSON } = await import("@/lib/crypto");
  const maskedReviews = await Promise.all(
    reviews.map(async (r) => {
      let displayName = "مستخدم";
      try {
        const nameData = await decryptJSON<{ name?: string }>(r.user.nameEnc);
        if (nameData?.name) {
          const parts = nameData.name.trim().split(/\s+/);
          displayName = parts.length >= 2
            ? `${parts[0]} ${parts[1][0]}.`
            : parts[0];
        }
      } catch {
        // Name encrypted with old key — show fallback
        displayName = "مستخدم (بيانات قديمة)";
      }

      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        role: r.role,
        status: r.status,
        matchId: r.matchId,
        createdAt: r.createdAt.toISOString(),
        displayName,
        accountCategory: r.user.accountCategory,
      };
    }),
  );

  return NextResponse.json({ reviews: maskedReviews, count: maskedReviews.length });
}
