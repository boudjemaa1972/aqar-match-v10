import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { encryptJSON } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/demo-activate
//
//  ⚠️  DEMO-ONLY ENDPOINT — DO NOT USE IN PRODUCTION
//
//  Transfers ownership of a random seed listing (owned by one of the
//  `*@aqarmatch.demo` accounts) to the current session user, so a
//  first-time visitor can immediately try the seller flow without
//  filling in a full listing-creation form.
//
//  In production, this endpoint should be DISABLED (route guard via
//  NODE_ENV check) and sellers should use POST /api/seller/listings
//  to create real listings with their own data.
// ──────────────────────────────────────────────────────────────────

export async function POST() {
  // Hard guard — never available in production builds.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error:
          "هذا الendpoint مخصص للتطوير فقط ولا يتوفر في الإنتاج. استخدم POST /api/seller/listings لإنشاء إعلان حقيقي.",
      },
      { status: 403 },
    );
  }

  const user = await getOrCreateSession();

  // Check if user already has listings
  const existing = await db.listing.findFirst({
    where: { ownerId: user.id },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      message: "أنت بائع بالفعل.",
      listingId: existing.id,
    });
  }

  // Pick a random seed listing (owned by one of the demo sellers)
  const candidate = await db.listing.findFirst({
    where: {
      owner: { email: { contains: "@aqarmatch.demo" } },
    },
    include: { owner: true },
  });
  if (!candidate) {
    return NextResponse.json(
      { error: "لا توجد عقارات تجريبية متاحة." },
      { status: 404 },
    );
  }

  // Re-encrypt contact info with the current encryption key + new owner
  const contactEnc = await encryptJSON({
    phone: "+2135" + Math.floor(10_000_000 + Math.random() * 89_999_999),
    whatsapp: "+2135" + Math.floor(10_000_000 + Math.random() * 89_999_999),
    email: user.email,
  });

  // Transfer ownership
  await db.listing.update({
    where: { id: candidate.id },
    data: {
      ownerId: user.id,
      contactEnc,
    },
  });

  // Update user role
  await db.user.update({
    where: { id: user.id },
    data: { role: candidate.intent === "RENT" ? "LANDLORD" : "SELLER" },
  });

  return NextResponse.json({
    ok: true,
    message: "تم تفعيل وضع البائع — يمكنك الآن استقبال طلبات الفتح والتفاوض.",
    listingId: candidate.id,
    _demo: true,
  });
}
