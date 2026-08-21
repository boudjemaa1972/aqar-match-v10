import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/setup
// Creates all database tables by executing raw SQL via Prisma.
// Works in serverless (Netlify Functions) without needing prisma CLI.
//
// Usage: visit https://your-site.netlify.app/api/setup (once)

const SQL_STATEMENTS = [
  // Enums
  `CREATE TYPE IF NOT EXISTS "AccountCategory" AS ENUM ('INDIVIDUAL', 'AGENCY', 'DEVELOPER')`,
  `CREATE TYPE IF NOT EXISTS "SystemRole" AS ENUM ('USER', 'ADMIN')`,
  `CREATE TYPE IF NOT EXISTS "AuditEvent" AS ENUM ('SIGNUP_EMAIL', 'SIGNUP_PHONE', 'LOGIN_EMAIL', 'LOGIN_PHONE', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_USED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED', 'ACCOUNT_LOCKED', 'SESSION_ROTATED')`,
  `CREATE TYPE IF NOT EXISTS "Role" AS ENUM ('BUYER', 'SELLER', 'LANDLORD', 'TENANT', 'AGENT')`,
  `CREATE TYPE IF NOT EXISTS "AccountType" AS ENUM ('INDIVIDUAL', 'AGENCY', 'BROKER')`,
  `CREATE TYPE IF NOT EXISTS "PropertyIntent" AS ENUM ('SELL', 'RENT', 'SEASONAL_RENT')`,
  `CREATE TYPE IF NOT EXISTS "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'INDIVIDUAL_HOUSE', 'COMMERCIAL', 'BUILDABLE_LAND', 'AGRICULTURAL_LAND')`,
  `CREATE TYPE IF NOT EXISTS "LegalStatus" AS ENUM ('LIVRET_FONCIER', 'NOTARIZED_ACT', 'REGISTERED_UNNOTARIZED', 'ADMIN_DECISION', 'PRIVATE_ACT', 'NO_DOCS')`,
  `CREATE TYPE IF NOT EXISTS "UrbanPermitStatus" AS ENUM ('BUILDING_PERMIT', 'NO_BUILDING_PERMIT', 'CONFORMITY_CERTIFICATE', 'BUILDING_IN_TITLE_DEED')`,
  `CREATE TYPE IF NOT EXISTS "ListingStatus" AS ENUM ('UNMODERATED', 'ACTIVE', 'MATCHED', 'CLOSED')`,
  `CREATE TYPE IF NOT EXISTS "RequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'CLOSED')`,
  `CREATE TYPE IF NOT EXISTS "QueueStatus" AS ENUM ('PENDING', 'ACTIVE', 'CONSUMED', 'EXPIRED')`,
  `CREATE TYPE IF NOT EXISTS "MatchStatus" AS ENUM ('PROPOSED', 'SELLER_FEE_PAID', 'BUYER_NOTIFIED', 'BUYER_FEE_PAID', 'REJECTED', 'EXPIRED', 'REFUNDED', 'EXPIRED_SELLER', 'EXPIRED_BUYER', 'SELLER_WITHDREW_PRE_BUYER_PAYMENT', 'SELLER_WITHDREW_POST_BUYER_PAYMENT', 'BUYER_ACK_WINDOW_OPEN', 'CANCELLED_NO_COMPENSATION', 'CANCELLED_WITH_SELLER_PENALTY', 'CANCELLED_WITH_PLATFORM_APOLOGY', 'COMPLETED', 'BUYER_PAYMENT_EXPIRED', 'SELLER_REFUNDED_FULL', 'SELLER_ADVANCE', 'BUYER_COMPENSATED_PENDING', 'BUYER_COMPENSATED_CASH', 'BUYER_COMPENSATED_CREDIT', 'MEETING_AGREEMENT_PENDING', 'MEETING_AGREEMENT_FAILED')`,
  `CREATE TYPE IF NOT EXISTS "MeetingAgreementStatus" AS ENUM ('NotStarted', 'SellerProposed', 'BuyerProposed', 'ConflictingProposals', 'Agreed', 'Cancelled')`,
  `CREATE TYPE IF NOT EXISTS "ConsentStatus" AS ENUM ('Proposed', 'Approved', 'Rejected')`,
  `CREATE TYPE IF NOT EXISTS "RejectionReason" AS ENUM ('PRICE_TOO_HIGH', 'LOCATION_NOT_IDEAL', 'TOO_FEW_ROOMS', 'TOO_MANY_ROOMS', 'AREA_TOO_SMALL', 'AREA_TOO_LARGE', 'LEGAL_STATUS_WEAK', 'DATES_NOT_AVAILABLE', 'OTHER')`,
  `CREATE TYPE IF NOT EXISTS "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED')`,
  `CREATE TYPE IF NOT EXISTS "SubscriptionPlan" AS ENUM ('BASIC', 'PRO', 'ENTERPRISE')`,
  `CREATE TYPE IF NOT EXISTS "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED')`,
  `CREATE TYPE IF NOT EXISTS "PartnershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED')`,
  `CREATE TYPE IF NOT EXISTS "ViewingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')`,
  `CREATE TYPE IF NOT EXISTS "DealReporter" AS ENUM ('BUYER', 'SELLER', 'BOTH', 'PLATFORM')`,
  `CREATE TYPE IF NOT EXISTS "DealConfidence" AS ENUM ('PLATFORM_VERIFIED', 'SELF_REPORTED')`,
  `CREATE TYPE IF NOT EXISTS "Season" AS ENUM ('SUMMER', 'WINTER', 'EID', 'HOLIDAY', 'OFF_SEASON')`,

  // Core tables for auth
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
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

  `CREATE TABLE IF NOT EXISTS "OtpCode" (
    "id" TEXT NOT NULL, "phoneHash" TEXT NOT NULL, "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL, "consumed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
  )`,

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
    "codeHash" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")`,

  `CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
    "id" TEXT NOT NULL, "key" TEXT NOT NULL, "window" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "RateLimitEntry_key_window_idx" ON "RateLimitEntry"("key", "window")`,

  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL, "userId" TEXT, "event" "AuditEvent" NOT NULL,
    "success" BOOLEAN NOT NULL, "ip" TEXT, "userAgent" TEXT, "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId")`,
  `CREATE INDEX IF NOT EXISTS "AuditLog_event_idx" ON "AuditLog"("event")`,
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
        // Ignore "already exists" errors
        if (!msg.includes("already exists")) {
          errors.push(msg.slice(0, 100));
        }
        executed++;
      }
    }

    // Verify
    const userCount = await db.user.count();

    return NextResponse.json({
      ok: true,
      message: `تم إنشاء الجداول! (${executed} أوامر SQL)`,
      userCount,
      errors: errors.length > 0 ? errors : undefined,
    });
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
