-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('INDIVIDUAL', 'AGENCY', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuditEvent" AS ENUM ('SIGNUP_EMAIL', 'SIGNUP_PHONE', 'LOGIN_EMAIL', 'LOGIN_PHONE', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_USED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED', 'ACCOUNT_LOCKED', 'SESSION_ROTATED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BUYER', 'SELLER', 'LANDLORD', 'TENANT', 'AGENT');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'AGENCY', 'BROKER');

-- CreateEnum
CREATE TYPE "PropertyIntent" AS ENUM ('SELL', 'RENT', 'SEASONAL_RENT');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'INDIVIDUAL_HOUSE', 'COMMERCIAL', 'BUILDABLE_LAND', 'AGRICULTURAL_LAND');

-- CreateEnum
CREATE TYPE "LegalStatus" AS ENUM ('LIVRET_FONCIER', 'NOTARIZED_ACT', 'REGISTERED_UNNOTARIZED', 'ADMIN_DECISION', 'PRIVATE_ACT', 'NO_DOCS');

-- CreateEnum
CREATE TYPE "UrbanPermitStatus" AS ENUM ('BUILDING_PERMIT', 'NO_BUILDING_PERMIT', 'CONFORMITY_CERTIFICATE', 'BUILDING_IN_TITLE_DEED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('UNMODERATED', 'ACTIVE', 'MATCHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'ACTIVE', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PROPOSED', 'SELLER_FEE_PAID', 'BUYER_NOTIFIED', 'BUYER_FEE_PAID', 'REJECTED', 'EXPIRED', 'REFUNDED', 'EXPIRED_SELLER', 'EXPIRED_BUYER', 'SELLER_WITHDREW_PRE_BUYER_PAYMENT', 'SELLER_WITHDREW_POST_BUYER_PAYMENT', 'BUYER_ACK_WINDOW_OPEN', 'CANCELLED_NO_COMPENSATION', 'CANCELLED_WITH_SELLER_PENALTY', 'CANCELLED_WITH_PLATFORM_APOLOGY', 'COMPLETED', 'BUYER_PAYMENT_EXPIRED', 'SELLER_REFUNDED_FULL', 'SELLER_ADVANCE', 'BUYER_COMPENSATED_PENDING', 'BUYER_COMPENSATED_CASH', 'BUYER_COMPENSATED_CREDIT', 'MEETING_AGREEMENT_PENDING', 'MEETING_AGREEMENT_FAILED');

-- CreateEnum
CREATE TYPE "MeetingAgreementStatus" AS ENUM ('NotStarted', 'SellerProposed', 'BuyerProposed', 'ConflictingProposals', 'Agreed', 'Cancelled');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('Proposed', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('PRICE_TOO_HIGH', 'LOCATION_NOT_IDEAL', 'TOO_FEW_ROOMS', 'TOO_MANY_ROOMS', 'AREA_TOO_SMALL', 'AREA_TOO_LARGE', 'LEGAL_STATUS_WEAK', 'DATES_NOT_AVAILABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "DealReporter" AS ENUM ('BUYER', 'SELLER', 'BOTH', 'PLATFORM');

-- CreateEnum
CREATE TYPE "DealConfidence" AS ENUM ('PLATFORM_VERIFIED', 'SELF_REPORTED');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('SUMMER', 'WINTER', 'EID', 'HOLIDAY', 'OFF_SEASON');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneEnc" TEXT NOT NULL,
    "nameEnc" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ninEnc" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "accountCategory" "AccountCategory" NOT NULL DEFAULT 'INDIVIDUAL',
    "agencyRegistryNumber" TEXT,
    "developerLicenseNumber" TEXT,
    "categoryVerified" BOOLEAN NOT NULL DEFAULT false,
    "categoryVerifiedAt" TIMESTAMP(3),
    "categoryVerifiedBy" TEXT,
    "sessionToken" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "systemRole" "SystemRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedIp" TEXT,
    "requestedUa" TEXT,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "event" "AuditEvent" NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "intent" "PropertyIntent" NOT NULL,
    "type" "PropertyType" NOT NULL,
    "city" TEXT NOT NULL,
    "commune" TEXT,
    "district" TEXT,
    "askingPrice" INTEGER NOT NULL,
    "areaSqm" INTEGER NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "floor" INTEGER,
    "facades" INTEGER,
    "buildingAge" INTEGER,
    "hasElevator" BOOLEAN NOT NULL DEFAULT false,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "seasonalSeason" "Season",
    "legalStatus" "LegalStatus",
    "urbanPermitStatus" "UrbanPermitStatus",
    "offerTitle" TEXT NOT NULL,
    "description" TEXT,
    "features" TEXT NOT NULL DEFAULT '[]',
    "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "secretMinPriceEnc" TEXT NOT NULL,
    "locationEnc" TEXT NOT NULL,
    "contactEnc" TEXT NOT NULL,
    "photosEnc" TEXT NOT NULL,
    "geoLocationEnc" TEXT,
    "pricePerNight" INTEGER,
    "secretMinPricePerNightEnc" TEXT,
    "minStayNights" INTEGER DEFAULT 1,
    "availableFrom" TIMESTAMP(3),
    "availableTo" TIMESTAMP(3),
    "sellerFee" INTEGER NOT NULL DEFAULT 0,
    "status" "ListingStatus" NOT NULL DEFAULT 'UNMODERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intent" "PropertyIntent" NOT NULL,
    "type" "PropertyType" NOT NULL,
    "city" TEXT NOT NULL,
    "commune" TEXT,
    "district" TEXT,
    "maxBudgetEnc" TEXT,
    "fullNameEnc" TEXT,
    "phoneEnc" TEXT,
    "criteriaHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "MatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchNotification" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "matchId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchQueue" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "queueRank" INTEGER NOT NULL DEFAULT 1,
    "buyerFee" INTEGER NOT NULL DEFAULT 0,
    "sellerFee" INTEGER NOT NULL DEFAULT 0,
    "sellerFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "sellerFeePaidAt" TIMESTAMP(3),
    "sellerConsented" BOOLEAN NOT NULL DEFAULT false,
    "sellerConsentedAt" TIMESTAMP(3),
    "sellerConfirmContact" BOOLEAN NOT NULL DEFAULT false,
    "sellerConfirmAt" TIMESTAMP(3),
    "buyerFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "buyerFeePaidAt" TIMESTAMP(3),
    "sellerDeadline" TIMESTAMP(3),
    "buyerDeadline" TIMESTAMP(3),
    "refundEligibleAt" TIMESTAMP(3),
    "sellerDecisionDeadlineAt" TIMESTAMP(3),
    "sellerDecisionMadeAt" TIMESTAMP(3),
    "buyerCompensationDeadlineAt" TIMESTAMP(3),
    "meetingAgreementDeadlineAt" TIMESTAMP(3),
    "meetingAgreementStatus" "MeetingAgreementStatus",
    "agreedMeetingDate" TIMESTAMP(3),
    "agreementConfirmedAt" TIMESTAMP(3),
    "status" "MatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "buyerConsent" BOOLEAN NOT NULL DEFAULT false,
    "dealClosedAt" TIMESTAMP(3),
    "finalDealValue" INTEGER,
    "commissionDue" DOUBLE PRECISION,
    "commissionSettled" BOOLEAN NOT NULL DEFAULT false,
    "disputeFlag" BOOLEAN NOT NULL DEFAULT false,
    "disputeReason" TEXT,
    "disputeReportedAt" TIMESTAMP(3),
    "disputeReportedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerMeetingConsent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "proposedDate" TIMESTAMP(3) NOT NULL,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'Proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerMeetingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerMeetingConsent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "proposedDate" TIMESTAMP(3) NOT NULL,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'Proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerMeetingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "buyerOffer" INTEGER,
    "sellerOffer" INTEGER,
    "buyerNoteEnc" TEXT,
    "sellerNoteEnc" TEXT,
    "buyerTurn" BOOLEAN NOT NULL DEFAULT true,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "sellerHandled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRejection" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "intent" "PropertyIntent" NOT NULL,
    "type" "PropertyType" NOT NULL,
    "city" TEXT NOT NULL,
    "commune" TEXT,
    "askingPrice" INTEGER NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "reason" "RejectionReason" NOT NULL,
    "customNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRejection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWeightProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priceWeight" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "locationWeight" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "featuresWeight" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "totalRejections" INTEGER NOT NULL DEFAULT 0,
    "priceRejections" INTEGER NOT NULL DEFAULT 0,
    "locationRejections" INTEGER NOT NULL DEFAULT 0,
    "featuresRejections" INTEGER NOT NULL DEFAULT 0,
    "learningRate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWeightProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "role" "Role" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencySubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "listingsLimit" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperPartnership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractRef" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperPartnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "representativeId" TEXT,
    "representativeName" TEXT,
    "status" "ViewingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "buyerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sellerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosedDeal" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "finalPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "reportedBy" "DealReporter" NOT NULL,
    "confidence" "DealConfidence" NOT NULL,
    "surveySentAt" TIMESTAMP(3),
    "surveyRespondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionalOffer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "maxRedemptions" INTEGER,
    "redemptionsUsed" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionalOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferRedemption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConversationParticipants" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ConversationParticipants_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_sessionToken_key" ON "User"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerification_userId_idx" ON "EmailVerification"("userId");

-- CreateIndex
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_event_idx" ON "AuditLog"("event");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_ip_idx" ON "AuditLog"("ip");

-- CreateIndex
CREATE INDEX "OtpCode_phoneHash_idx" ON "OtpCode"("phoneHash");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchNotification_matchId_key" ON "MatchNotification"("matchId");

-- CreateIndex
CREATE INDEX "MatchNotification_userId_read_idx" ON "MatchNotification"("userId", "read");

-- CreateIndex
CREATE INDEX "MatchNotification_sentAt_idx" ON "MatchNotification"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchNotification_requestId_listingId_key" ON "MatchNotification"("requestId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerMeetingConsent_matchId_key" ON "BuyerMeetingConsent"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerMeetingConsent_matchId_key" ON "SellerMeetingConsent"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Negotiation_matchId_key" ON "Negotiation"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRejection_matchId_key" ON "MatchRejection"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWeightProfile_userId_key" ON "UserWeightProfile"("userId");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgencySubscription_userId_key" ON "AgencySubscription"("userId");

-- CreateIndex
CREATE INDEX "AgencySubscription_userId_idx" ON "AgencySubscription"("userId");

-- CreateIndex
CREATE INDEX "AgencySubscription_status_idx" ON "AgencySubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperPartnership_userId_key" ON "DeveloperPartnership"("userId");

-- CreateIndex
CREATE INDEX "DeveloperPartnership_userId_idx" ON "DeveloperPartnership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_matchId_key" ON "Conversation"("matchId");

-- CreateIndex
CREATE INDEX "Conversation_matchId_idx" ON "Conversation"("matchId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_blocked_idx" ON "Message"("blocked");

-- CreateIndex
CREATE INDEX "Viewing_matchId_idx" ON "Viewing"("matchId");

-- CreateIndex
CREATE INDEX "Viewing_status_idx" ON "Viewing"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClosedDeal_matchId_key" ON "ClosedDeal"("matchId");

-- CreateIndex
CREATE INDEX "ClosedDeal_confidence_idx" ON "ClosedDeal"("confidence");

-- CreateIndex
CREATE INDEX "ClosedDeal_closedAt_idx" ON "ClosedDeal"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionalOffer_code_key" ON "PromotionalOffer"("code");

-- CreateIndex
CREATE INDEX "OfferRedemption_offerId_idx" ON "OfferRedemption"("offerId");

-- CreateIndex
CREATE INDEX "OfferRedemption_userId_idx" ON "OfferRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRedemption_offerId_userId_matchId_key" ON "OfferRedemption"("offerId", "userId", "matchId");

-- CreateIndex
CREATE INDEX "_ConversationParticipants_B_index" ON "_ConversationParticipants"("B");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchNotification" ADD CONSTRAINT "MatchNotification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MatchRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchNotification" ADD CONSTRAINT "MatchNotification_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchNotification" ADD CONSTRAINT "MatchNotification_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchNotification" ADD CONSTRAINT "MatchNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchQueue" ADD CONSTRAINT "MatchQueue_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MatchRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchQueue" ADD CONSTRAINT "MatchQueue_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MatchRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerMeetingConsent" ADD CONSTRAINT "BuyerMeetingConsent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerMeetingConsent" ADD CONSTRAINT "SellerMeetingConsent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRejection" ADD CONSTRAINT "MatchRejection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRejection" ADD CONSTRAINT "MatchRejection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWeightProfile" ADD CONSTRAINT "UserWeightProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencySubscription" ADD CONSTRAINT "AgencySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperPartnership" ADD CONSTRAINT "DeveloperPartnership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedDeal" ADD CONSTRAINT "ClosedDeal_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemption" ADD CONSTRAINT "OfferRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PromotionalOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversationParticipants" ADD CONSTRAINT "_ConversationParticipants_A_fkey" FOREIGN KEY ("A") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversationParticipants" ADD CONSTRAINT "_ConversationParticipants_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

