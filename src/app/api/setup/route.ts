import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/setup
// Creates all database tables by executing raw SQL via Prisma.
// Works in serverless (Netlify Functions) without needing prisma CLI.
//
// Usage: visit https://your-site.netlify.app/api/setup (once)

// Helper: wrap ENUM creation in DO block (PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE)
const enumType = (name: string, values: string[]) =>
  `DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${values.map(v => `'${v}'`).join(', ')}); EXCEPTION WHEN duplicate_object THEN null; END $$;`;

const SQL_STATEMENTS = [
  // ── Enums ──
  enumType("AccountCategory", ["INDIVIDUAL", "AGENCY", "DEVELOPER"]),
  enumType("SystemRole", ["USER", "ADMIN"]),
  enumType("AuditEvent", [
    "SIGNUP_EMAIL", "SIGNUP_PHONE", "LOGIN_EMAIL", "LOGIN_PHONE",
    "LOGIN_FAILED", "LOGOUT", "PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_USED",
    "EMAIL_VERIFIED", "PHONE_VERIFIED", "ACCOUNT_LOCKED", "SESSION_ROTATED",
  ]),
  enumType("Role", ["BUYER", "SELLER", "LANDLORD", "TENANT", "AGENT"]),
  enumType("AccountType", ["INDIVIDUAL", "AGENCY", "BROKER"]),
  enumType("PropertyIntent", ["SELL", "RENT", "SEASONAL_RENT"]),
  enumType("PropertyType", [
    "APARTMENT", "VILLA", "INDIVIDUAL_HOUSE", "COMMERCIAL", "BUILDABLE_LAND", "AGRICULTURAL_LAND",
  ]),
  enumType("LegalStatus", [
    "LIVRET_FONCIER", "NOTARIZED_ACT", "REGISTERED_UNNOTARIZED",
    "ADMIN_DECISION", "PRIVATE_ACT", "NO_DOCS",
  ]),
  enumType("UrbanPermitStatus", [
    "BUILDING_PERMIT", "NO_BUILDING_PERMIT", "CONFORMITY_CERTIFICATE", "BUILDING_IN_TITLE_DEED",
  ]),
  enumType("ListingStatus", ["UNMODERATED", "ACTIVE", "MATCHED", "CLOSED"]),
  enumType("RequestStatus", ["OPEN", "FULFILLED", "CLOSED"]),
  enumType("QueueStatus", ["PENDING", "ACTIVE", "CONSUMED", "EXPIRED"]),
  enumType("MatchStatus", [
    "PROPOSED", "SELLER_FEE_PAID", "BUYER_NOTIFIED", "BUYER_FEE_PAID",
    "REJECTED", "EXPIRED", "REFUNDED", "EXPIRED_SELLER", "EXPIRED_BUYER",
    "SELLER_WITHDREW_PRE_BUYER_PAYMENT", "SELLER_WITHDREW_POST_BUYER_PAYMENT",
    "BUYER_ACK_WINDOW_OPEN", "CANCELLED_NO_COMPENSATION",
    "CANCELLED_WITH_SELLER_PENALTY", "CANCELLED_WITH_PLATFORM_APOLOGY",
    "COMPLETED", "BUYER_PAYMENT_EXPIRED", "SELLER_REFUNDED_FULL",
    "SELLER_ADVANCE", "BUYER_COMPENSATED_PENDING", "BUYER_COMPENSATED_CASH",
    "BUYER_COMPENSATED_CREDIT", "MEETING_AGREEMENT_PENDING", "MEETING_AGREEMENT_FAILED",
  ]),
  enumType("MeetingAgreementStatus", [
    "NotStarted", "SellerProposed", "BuyerProposed", "ConflictingProposals", "Agreed", "Cancelled",
  ]),
  enumType("ConsentStatus", ["Proposed", "Approved", "Rejected"]),
  enumType("RejectionReason", [
    "PRICE_TOO_HIGH", "LOCATION_NOT_IDEAL", "TOO_FEW_ROOMS", "TOO_MANY_ROOMS",
    "AREA_TOO_SMALL", "AREA_TOO_LARGE", "LEGAL_STATUS_WEAK", "DATES_NOT_AVAILABLE", "OTHER",
  ]),
  enumType("ReviewStatus", ["PENDING", "APPROVED", "REJECTED"]),
  enumType("SubscriptionPlan", ["BASIC", "PRO", "ENTERPRISE"]),
  enumType("SubscriptionStatus", ["ACTIVE", "EXPIRED", "CANCELLED"]),
  enumType("PartnershipStatus", ["ACTIVE", "SUSPENDED", "TERMINATED"]),
  enumType("ViewingStatus", ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  enumType("DealReporter", ["BUYER", "SELLER", "BOTH", "PLATFORM"]),
  enumType("DealConfidence", ["PLATFORM_VERIFIED", "SELF_REPORTED"]),
  enumType("Season", ["SUMMER", "WINTER", "EID", "HOLIDAY", "OFF_SEASON"]),

  // ── Core Auth Tables ──
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL, "email" TEXT NOT NULL, "phoneEnc" TEXT NOT NULL,
    "nameEnc" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'BUYER',
    "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "verified" BOOLEAN NOT NULL DEFAULT false, "ninEnc" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT, "emailVerifiedAt" TIMESTAMP(3), "phoneVerifiedAt" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3), "lastLoginIp" TEXT,
    "accountCategory" "AccountCategory" NOT NULL DEFAULT 'INDIVIDUAL',
    "agencyRegistryNumber" TEXT, "developerLicenseNumber" TEXT,
    "categoryVerified" BOOLEAN NOT NULL DEFAULT false, "categoryVerifiedAt" TIMESTAMP(3),
    "categoryVerifiedBy" TEXT, "sessionToken" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT true, "systemRole" "SystemRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

  `CREATE TABLE IF NOT EXISTS "OtpCode" (
    "id" TEXT NOT NULL, "phoneHash" TEXT NOT NULL, "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL, "consumed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0, "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "OtpCode_phoneHash_idx" ON "OtpCode"("phoneHash")`,
  `CREATE INDEX IF NOT EXISTS "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt")`,

  `CREATE TABLE IF NOT EXISTS "PasswordReset" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT, "requestedUa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId")`,

  `CREATE TABLE IF NOT EXISTS "EmailVerification" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")`,

  `CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL, "userId" TEXT, "event" "AuditEvent" NOT NULL,
    "success" BOOLEAN NOT NULL, "ip" TEXT, "userAgent" TEXT, "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_event_idx" ON "AuditLog"("event")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt")`,

  // ── Listings & Matches ──
  `CREATE TABLE IF NOT EXISTS "Listing" (
    "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
    "intent" "PropertyIntent" NOT NULL, "type" "PropertyType" NOT NULL,
    "city" TEXT NOT NULL, "commune" TEXT, "district" TEXT,
    "askingPrice" INTEGER NOT NULL, "areaSqm" INTEGER NOT NULL,
    "bedrooms" INTEGER, "bathrooms" INTEGER, "floor" INTEGER, "facades" INTEGER,
    "buildingAge" INTEGER, "hasElevator" BOOLEAN NOT NULL DEFAULT false,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "seasonalSeason" "Season",
    "legalStatus" "LegalStatus", "urbanPermitStatus" "UrbanPermitStatus",
    "offerTitle" TEXT NOT NULL, "description" TEXT,
    "features" TEXT NOT NULL DEFAULT '[]',
    "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "secretMinPriceEnc" TEXT NOT NULL, "locationEnc" TEXT NOT NULL,
    "contactEnc" TEXT NOT NULL, "photosEnc" TEXT NOT NULL,
    "geoLocationEnc" TEXT,
    "pricePerNight" INTEGER, "secretMinPricePerNightEnc" TEXT,
    "minStayNights" INTEGER DEFAULT 1,
    "availableFrom" TIMESTAMP(3), "availableTo" TIMESTAMP(3),
    "sellerFee" INTEGER NOT NULL DEFAULT 0,
    "status" "ListingStatus" NOT NULL DEFAULT 'UNMODERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "MatchRequest" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "intent" "PropertyIntent" NOT NULL, "type" "PropertyType" NOT NULL,
    "city" TEXT NOT NULL, "commune" TEXT, "district" TEXT,
    "maxBudgetEnc" TEXT, "fullNameEnc" TEXT, "phoneEnc" TEXT,
    "criteriaHash" TEXT NOT NULL DEFAULT '',
    "notifiedAt" TIMESTAMP(3),
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchRequest_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "Match" (
    "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL, "sellerId" TEXT NOT NULL,
    "score" FLOAT NOT NULL, "queueRank" INTEGER NOT NULL DEFAULT 1,
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
    "commissionDue" FLOAT, "commissionSettled" BOOLEAN NOT NULL DEFAULT false,
    "disputeFlag" BOOLEAN NOT NULL DEFAULT false, "disputeReason" TEXT,
    "disputeReportedAt" TIMESTAMP(3), "disputeReportedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3),
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "MatchNotification" (
    "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "listingId" TEXT NOT NULL,
    "matchId" TEXT, "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "read" BOOLEAN NOT NULL DEFAULT false, "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchNotification_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MatchNotification_requestId_listingId_key" ON "MatchNotification"("requestId", "listingId")`,

  `CREATE TABLE IF NOT EXISTS "MatchQueue" (
    "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "listingId" TEXT NOT NULL,
    "score" FLOAT NOT NULL, "rank" INTEGER NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchQueue_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "MatchRejection" (
    "id" TEXT NOT NULL, "matchId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "score" FLOAT NOT NULL, "intent" "PropertyIntent" NOT NULL,
    "type" "PropertyType" NOT NULL, "city" TEXT NOT NULL, "commune" TEXT,
    "askingPrice" INTEGER NOT NULL, "bedrooms" INTEGER, "bathrooms" INTEGER,
    "reason" "RejectionReason" NOT NULL, "customNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchRejection_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MatchRejection_matchId_key" ON "MatchRejection"("matchId")`,

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

  `CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "matchId" TEXT,
    "role" "Role" NOT NULL, "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL, "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "UserWeightProfile" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "priceWeight" FLOAT NOT NULL DEFAULT 40, "locationWeight" FLOAT NOT NULL DEFAULT 40,
    "featuresWeight" FLOAT NOT NULL DEFAULT 20,
    "totalRejections" INTEGER NOT NULL DEFAULT 0,
    "priceRejections" INTEGER NOT NULL DEFAULT 0,
    "locationRejections" INTEGER NOT NULL DEFAULT 0,
    "featuresRejections" INTEGER NOT NULL DEFAULT 0,
    "learningRate" FLOAT NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserWeightProfile_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserWeightProfile_userId_key" ON "UserWeightProfile"("userId")`,

  `CREATE TABLE IF NOT EXISTS "AgencySubscription" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL, "amount" INTEGER NOT NULL,
    "listingsLimit" INTEGER NOT NULL, "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL, "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencySubscription_pkey" PRIMARY KEY ("id")
  )`,

  `CREATE TABLE IF NOT EXISTS "DeveloperPartnership" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "contractRef" TEXT NOT NULL, "commissionRate" FLOAT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeveloperPartnership_pkey" PRIMARY KEY ("id")
  )`,

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

  `CREATE TABLE IF NOT EXISTS "PromotionalOffer" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "discountType" TEXT NOT NULL, "discountValue" FLOAT NOT NULL,
    "maxRedemptions" INTEGER, "redemptionsUsed" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionalOffer_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PromotionalOffer_code_key" ON "PromotionalOffer"("code")`,

  `CREATE TABLE IF NOT EXISTS "OfferRedemption" (
    "id" TEXT NOT NULL, "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL, "matchId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferRedemption_pkey" PRIMARY KEY ("id")
  )`,
];

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL غير مُعرّف." },
      { status: 500 },
    );
  }

  try {
    // Quick check: do tables already exist?
    try {
      const userCount = await db.user.count();
      return NextResponse.json({
        ok: true,
        message: "الجداول موجودة بالفعل!",
        userCount,
      });
    } catch {
      // Tables don't exist — proceed to create
    }

    console.log("[setup] Creating tables via raw SQL...");
    let executed = 0;
    const errors: string[] = [];

    for (const sql of SQL_STATEMENTS) {
      try {
        await db.$executeRawUnsafe(sql);
        executed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Log ALL errors for debugging
        if (!msg.includes("already exists") && !msg.includes("duplicate_object")) {
          errors.push(msg.slice(0, 200));
        }
        executed++;
      }
    }

    // Verify
    try {
      const userCount = await db.user.count();
      return NextResponse.json({
        ok: true,
        message: `تم إنشاء الجداول! (${executed} أوامر SQL)`,
        userCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (verifyErr) {
      return NextResponse.json({
        ok: false,
        error: "تم تنفيذ SQL لكن التحقق فشل",
        details: verifyErr instanceof Error ? verifyErr.message.slice(0, 300) : String(verifyErr).slice(0, 300),
        executed,
        errors: errors.length > 0 ? errors : undefined,
      }, { status: 500 });
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[setup] FATAL:", errMsg);

    let userMessage = "فشل إنشاء الجداول.";
    if (errMsg.includes("DATABASE_URL") || errMsg.includes("P1001")) {
      userMessage = "تعذّر الاتصال بقاعدة DATABASE_URL.";
    }

    return NextResponse.json(
      { ok: false, error: userMessage, details: errMsg.slice(0, 500) },
      { status: 500 },
    );
  }
}
