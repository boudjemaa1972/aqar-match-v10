import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  GET /api/buyer/stats
//
//  Aggregated stats for the Buyer Dashboard overview.
//  IDOR protection: all counts filter by buyerId = session.user.id
// ──────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getOrCreateSession();

  const [
    activeRequests,
    fulfilledRequests,
    closedRequests,
    totalRequests,
    pendingBuyerAction, // matches waiting for buyer to pay fee
    pendingNegotiation, // matches where buyer needs to respond
    completedDeals,     // BUYER_FEE_PAID (contact revealed = deal done)
    rejectedMatches,
    expiredMatches,
    refundedMatches,
    totalFeesPaid,
  ] = await Promise.all([
    db.matchRequest.count({ where: { userId: user.id, status: "OPEN" } }),
    db.matchRequest.count({ where: { userId: user.id, status: "FULFILLED" } }),
    db.matchRequest.count({ where: { userId: user.id, status: "CLOSED" } }),
    db.matchRequest.count({ where: { userId: user.id } }),
    // Pending buyer action = BUYER_NOTIFIED (seller paid+consented, buyer must pay)
    db.match.count({
      where: { buyerId: user.id, status: "BUYER_NOTIFIED" },
    }),
    // Pending negotiation = matches with negotiation where it's buyer's turn
    db.match.count({
      where: {
        buyerId: user.id,
        status: { in: ["PROPOSED", "SELLER_FEE_PAID", "BUYER_NOTIFIED"] },
        negotiation: { buyerTurn: true, sellerHandled: true },
      },
    }),
    db.match.count({ where: { buyerId: user.id, status: "BUYER_FEE_PAID" } }),
    db.match.count({ where: { buyerId: user.id, status: "REJECTED" } }),
    db.match.count({ where: { buyerId: user.id, status: "EXPIRED" } }),
    db.match.count({ where: { buyerId: user.id, status: "REFUNDED" } }),
    // Sum of buyer fees actually paid
    db.match.aggregate({
      where: { buyerId: user.id, buyerFeePaid: true },
      _sum: { buyerFee: true },
    }),
  ]);

  return NextResponse.json({
    activeRequests,
    fulfilledRequests,
    closedRequests,
    totalRequests,
    pendingBuyerAction,
    pendingNegotiation,
    completedDeals,
    rejectedMatches,
    expiredMatches,
    refundedMatches,
    totalFeesPaid: totalFeesPaid._sum.buyerFee ?? 0,
    // Total actions requiring immediate buyer attention
    pendingActions: pendingBuyerAction + pendingNegotiation,
  });
}
