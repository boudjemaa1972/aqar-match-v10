import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/setup-match
// One-time endpoint to create the missing Match table + related tables

const SQL = [
  `CREATE TABLE IF NOT EXISTS "Match" (
    "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL, "sellerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL, "queueRank" INTEGER NOT NULL DEFAULT 1,
    "buyerFee" INTEGER NOT NULL DEFAULT 0, "sellerFee" INTEGER NOT NULL DEFAULT 0,
    "sellerFeePaid" BOOLEAN NOT NULL DEFAULT false, "sellerFeePaidAt" TIMESTAMP(3),
    "sellerConsented" BOOLEAN NOT NULL DEFAULT false, "sellerConsentedAt" TIMESTAMP(3),
    "sellerConfirmContact" BOOLEAN NOT NULL DEFAULT false, "sellerConfirmAt" TIMESTAMP(3),
    "buyerFeePaid" BOOLEAN NOT NULL DEFAULT false, "buyerFeePaidAt" TIMESTAMP(3),
    "sellerDeadline" TIMESTAMP(3), "buyerDeadline" TIMESTAMP(3),
    "refundEligibleAt" TIMESTAMP(3),
    "sellerDecisionDeadlineAt" TIMESTAMP(3), "sellerDecisionMadeAt" TIMESTAMP(3),
    "buyerCompensationDeadlineAt" TIMESTAMP(3),
    "meetingAgreementDeadlineAt" TIMESTAMP(3),
    "meetingAgreementStatus" "MeetingAgreementStatus",
    "agreedMeetingDate" TIMESTAMP(3), "agreementConfirmedAt" TIMESTAMP(3),
    "status" "MatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "buyerConsent" BOOLEAN NOT NULL DEFAULT false,
    "dealClosedAt" TIMESTAMP(3), "finalDealValue" INTEGER,
    "commissionDue" DOUBLE PRECISION, "commissionSettled" BOOLEAN NOT NULL DEFAULT false,
    "disputeFlag" BOOLEAN NOT NULL DEFAULT false, "disputeReason" TEXT,
    "disputeReportedAt" TIMESTAMP(3), "disputeReportedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3),
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Negotiation" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL,
    "buyerOffer" INTEGER, "sellerOffer" INTEGER,
    "buyerNoteEnc" TEXT, "sellerNoteEnc" TEXT,
    "buyerTurn" BOOLEAN NOT NULL DEFAULT true, "rounds" INTEGER NOT NULL DEFAULT 0,
    "revealed" BOOLEAN NOT NULL DEFAULT false, "sellerHandled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Negotiation_matchId_key" ON "Negotiation"("matchId")`,
  `CREATE TABLE IF NOT EXISTS "MatchRejection" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL, "intent" "PropertyIntent" NOT NULL,
    "type" "PropertyType" NOT NULL, "city" TEXT NOT NULL, "commune" TEXT,
    "askingPrice" INTEGER NOT NULL, "bedrooms" INTEGER, "bathrooms" INTEGER,
    "reason" "RejectionReason" NOT NULL, "customNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchRejection_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MatchRejection_matchId_key" ON "MatchRejection"("matchId")`,
  `CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "matchId" TEXT,
    "role" "Role" NOT NULL, "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL, "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ClosedDeal" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL,
    "finalPrice" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'DZD',
    "reportedBy" "DealReporter" NOT NULL, "confidence" "DealConfidence" NOT NULL,
    "surveySentAt" TIMESTAMP(3), "surveyRespondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClosedDeal_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ClosedDeal_matchId_key" ON "ClosedDeal"("matchId")`,
  `CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_matchId_key" ON "Conversation"("matchId")`,
  `CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL, "content" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Viewing" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "representativeId" TEXT, "representativeName" TEXT,
    "status" "ViewingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "buyerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sellerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT, "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "BuyerMeetingConsent" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL,
    "proposedDate" TIMESTAMP(3) NOT NULL,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'Proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuyerMeetingConsent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BuyerMeetingConsent_matchId_key" ON "BuyerMeetingConsent"("matchId")`,
  `CREATE TABLE IF NOT EXISTS "SellerMeetingConsent" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL,
    "proposedDate" TIMESTAMP(3) NOT NULL,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'Proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SellerMeetingConsent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SellerMeetingConsent_matchId_key" ON "SellerMeetingConsent"("matchId")`,
];

export async function GET() {
  try {
    let executed = 0;
    const errors: string[] = [];

    for (const sql of SQL) {
      try {
        await db.$executeRawUnsafe(sql);
        executed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("already exists") && !msg.includes("duplicate_object")) {
          errors.push(msg.slice(0, 200));
        }
        executed++;
      }
    }

    // Verify Match table exists
    try {
      const count = await db.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "Match"`);
      return NextResponse.json({
        ok: true,
        message: `تم إنشاء الجداول! (${executed} أوامر)`,
        matchCount: (count as any[])[0]?.count,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: "تم التنفيذ لكن التحقق فشل",
        details: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        executed,
        errors: errors.length > 0 ? errors : undefined,
      }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
