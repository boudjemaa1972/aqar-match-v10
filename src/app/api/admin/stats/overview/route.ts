import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// GET /api/admin/stats/overview — dashboard metrics
export async function GET() {
  try {
    const admin = await requireAdmin();
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  const [
    totalUsers, individualCount, agencyCount, developerCount,
    activeListings, totalMatches, completedMatches,
    pendingReviews, blockedMessages30d,
    closedDealsTotal, closedDealsVerified, closedDealsSelfReported,
    surveysSent, surveysResponded,
  ] = await Promise.all([
    db.user.count({ where: { isGuest: false } }),
    db.user.count({ where: { accountCategory: "INDIVIDUAL", isGuest: false } }),
    db.user.count({ where: { accountCategory: "AGENCY", isGuest: false } }),
    db.user.count({ where: { accountCategory: "DEVELOPER", isGuest: false } }),
    db.listing.count({ where: { status: { in: ["ACTIVE", "UNMODERATED"] } } }),
    db.match.count(),
    db.match.count({ where: { status: "BUYER_FEE_PAID" } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.message.count({
      where: { blocked: true, sentAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    // ── ClosedDeal metrics (for future Hedonic Model readiness) ──
    db.closedDeal.count(),
    db.closedDeal.count({ where: { confidence: "PLATFORM_VERIFIED" } }),
    db.closedDeal.count({ where: { confidence: "SELF_REPORTED" } }),
    // Survey response rate: how many surveys were sent vs responded
    db.closedDeal.count({ where: { surveySentAt: { not: null } } }),
    db.closedDeal.count({ where: { surveyRespondedAt: { not: null } } }),
  ]);

  const matchSuccessRate = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;
  const surveyResponseRate = surveysSent > 0 ? Math.round((surveysResponded / surveysSent) * 100) : 0;

  return NextResponse.json({
    users: { total: totalUsers, individual: individualCount, agency: agencyCount, developer: developerCount },
    listings: { active: activeListings },
    matches: { total: totalMatches, completed: completedMatches, successRate: matchSuccessRate },
    reviews: { pending: pendingReviews },
    security: { blockedMessages30d },
    // ── Data quality for Hedonic Model ──
    closedDeals: {
      total: closedDealsTotal,
      platformVerified: closedDealsVerified,
      selfReported: closedDealsSelfReported,
    },
    survey: {
      sent: surveysSent,
      responded: surveysResponded,
      responseRate: surveyResponseRate,
    },
  });
}
