// ──────────────────────────────────────────────────────────────────
//  Seed script for Aqar Match — Algeria edition (new schema).
//  25 listings across Alger, Blida, Médéa in DZD.
// ──────────────────────────────────────────────────────────────────

import { db } from "../src/lib/db";
import { encryptJSON } from "../src/lib/crypto";
import { calculateSellerFee, type PropertyType, type PropertyIntent, type LegalStatus } from "../src/lib/schemas";

interface SeedListing {
  intent: PropertyIntent;
  type: PropertyType;
  city: string;
  commune: string;
  district?: string | null;
  askingPrice: number;
  secretMinPrice: number;
  // GPS
  latitude?: number;
  longitude?: number;
  // SEASONAL_RENT only
  pricePerNight?: number;
  secretMinPricePerNight?: number;
  minStayNights?: number;
  availableFrom?: string; // ISO date
  availableTo?: string;
  areaSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  facades: number | null;
  legalStatus: LegalStatus;
  offerTitle: string;
  description?: string | null;
  ownerEmail: string;
}

const LISTINGS: SeedListing[] = [
  // ─── Wilaya Alger ───
  {
    intent: "SELL", type: "APARTMENT", city: "الجزائر", commune: "حيدرة", district: "حيدرة العليا",
    latitude: 36.7538, longitude: 3.0588, // Hydra, Alger
    askingPrice: 18_000_000, secretMinPrice: 16_000_000, areaSqm: 130,
    bedrooms: 3, bathrooms: 2, floor: 4, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة F3 في حيدرة — إطلالة بانورامية",
    description: "شقة عصرية في الطابق الرابع، مع شرفة واسعة ومصعد",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "APARTMENT", city: "الجزائر", commune: "المرادية",
    latitude: 36.7431, longitude: 3.0505, // El Mouradia, Alger
    askingPrice: 22_500_000, secretMinPrice: 20_000_000, areaSqm: 155,
    bedrooms: 4, bathrooms: 3, floor: 6, facades: 2,
    legalStatus: "NOTARIZED_ACT",
    offerTitle: "شقة F4 فاخرة في المرادية",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "APARTMENT", city: "الجزائر", commune: "باب الزوار",
    askingPrice: 8_500_000, secretMinPrice: 7_500_000, areaSqm: 95,
    bedrooms: 3, bathrooms: 2, floor: 3, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة F3 باب الزوار قرب المحطة",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "VILLA", city: "الجزائر", commune: "الأبيار", district: "الأبيار العلوي",
    askingPrice: 65_000_000, secretMinPrice: 60_000_000, areaSqm: 420,
    bedrooms: 6, bathrooms: 5, floor: 3, facades: 4,
    legalStatus: "NOTARIZED_ACT",
    offerTitle: "فيلا فاخرة في الأبيار مع حديقة",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "INDIVIDUAL_HOUSE", city: "الجزائر", commune: "حسين داي",
    askingPrice: 28_000_000, secretMinPrice: 25_000_000, areaSqm: 220,
    bedrooms: 4, bathrooms: 3, floor: 2, facades: 2,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "منزل فردي في حسين داي",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },
  {
    intent: "RENT", type: "APARTMENT", city: "الجزائر", commune: "حيدرة",
    askingPrice: 120_000, secretMinPrice: 110_000, areaSqm: 130,
    bedrooms: 3, bathrooms: 2, floor: 3, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة للإيجار في حيدرة — أثاث كامل",
    ownerEmail: "landlord.alger@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "COMMERCIAL", city: "الجزائر", commune: "سيدي امحمد",
    askingPrice: 45_000_000, secretMinPrice: 40_000_000, areaSqm: 220,
    bedrooms: null, bathrooms: 2, floor: 0, facades: 2,
    legalStatus: "NOTARIZED_ACT",
    offerTitle: "محل تجاري في وسط العاصمة",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "BUILDABLE_LAND", city: "الجزائر", commune: "الشراقة",
    askingPrice: 12_000_000, secretMinPrice: 10_000_000, areaSqm: 400,
    bedrooms: null, bathrooms: null, floor: null, facades: 2,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "أرض صالحة للبناء في الشراقة",
    ownerEmail: "seller.alger@aqarmatch.demo",
  },

  // ─── Wilaya Blida ───
  {
    intent: "SELL", type: "APARTMENT", city: "البليدة", commune: "البليدة", district: "وسط المدينة",
    askingPrice: 9_500_000, secretMinPrice: 8_500_000, areaSqm: 110,
    bedrooms: 3, bathrooms: 2, floor: 3, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة F3 في وسط البليدة",
    ownerEmail: "seller.blida@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "APARTMENT", city: "البليدة", commune: "بوفاريك",
    askingPrice: 6_800_000, secretMinPrice: 6_000_000, areaSqm: 95,
    bedrooms: 3, bathrooms: 2, floor: 2, facades: 1,
    legalStatus: "REGISTERED_UNNOTARIZED",
    offerTitle: "شقة في بوفاريك قرب الطريق السيار",
    ownerEmail: "seller.blida@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "VILLA", city: "البليدة", commune: "الشفة",
    askingPrice: 32_000_000, secretMinPrice: 28_000_000, areaSqm: 350,
    bedrooms: 5, bathrooms: 4, floor: 2, facades: 3,
    legalStatus: "NOTARIZED_ACT",
    offerTitle: "فيلا في الشفة مع مسبح وحديقة",
    ownerEmail: "seller.blida@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "AGRICULTURAL_LAND", city: "البليدة", commune: "موزاية",
    askingPrice: 4_200_000, secretMinPrice: 3_800_000, areaSqm: 3500,
    bedrooms: null, bathrooms: null, floor: null, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "أرض فلاحية في موزاية — 35 هكتار",
    ownerEmail: "seller.blida@aqarmatch.demo",
  },
  {
    intent: "RENT", type: "APARTMENT", city: "البليدة", commune: "البليدة",
    askingPrice: 55_000, secretMinPrice: 50_000, areaSqm: 105,
    bedrooms: 3, bathrooms: 2, floor: 4, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة للإيجار في البليدة",
    ownerEmail: "landlord.blida@aqarmatch.demo",
  },

  // ─── Wilaya Médéa ───
  {
    intent: "SELL", type: "APARTMENT", city: "المدية", commune: "المدية", district: "وسط المدينة",
    askingPrice: 6_500_000, secretMinPrice: 5_800_000, areaSqm: 100,
    bedrooms: 3, bathrooms: 2, floor: 2, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة F3 في وسط المدية",
    ownerEmail: "seller.medea@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "APARTMENT", city: "المدية", commune: "قصر البخاري",
    askingPrice: 4_200_000, secretMinPrice: 3_800_000, areaSqm: 85,
    bedrooms: 2, bathrooms: 1, floor: 1, facades: 1,
    legalStatus: "PRIVATE_ACT",
    offerTitle: "شقة F2 في قصر البخاري",
    ownerEmail: "seller.medea@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "INDIVIDUAL_HOUSE", city: "المدية", commune: "تابلاط",
    askingPrice: 18_000_000, secretMinPrice: 16_000_000, areaSqm: 280,
    bedrooms: 4, bathrooms: 3, floor: 2, facades: 2,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "منزل فردي في تابلاط مع حديقة",
    ownerEmail: "seller.medea@aqarmatch.demo",
  },
  {
    intent: "SELL", type: "BUILDABLE_LAND", city: "المدية", commune: "أولاد هلال",
    askingPrice: 2_800_000, secretMinPrice: 2_500_000, areaSqm: 500,
    bedrooms: null, bathrooms: null, floor: null, facades: 1,
    legalStatus: "ADMIN_DECISION",
    offerTitle: "أرض صالحة للبناء في أولاد هلال",
    ownerEmail: "seller.medea@aqarmatch.demo",
  },
  {
    intent: "RENT", type: "APARTMENT", city: "المدية", commune: "المدية",
    askingPrice: 38_000, secretMinPrice: 35_000, areaSqm: 95,
    bedrooms: 3, bathrooms: 2, floor: 2, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة للإيجار في المدية",
    ownerEmail: "landlord.medea@aqarmatch.demo",
  },

  // ─── SEASONAL_RENT listings (إيجار موسمي) ───────────────────
  {
    intent: "SEASONAL_RENT", type: "APARTMENT", city: "الجزائر", commune: "المرادية",
    askingPrice: 0, secretMinPrice: 0, // unused for seasonal
    pricePerNight: 12_000, secretMinPricePerNight: 9_000,
    minStayNights: 2,
    availableFrom: "2026-07-01", availableTo: "2026-08-31",
    areaSqm: 130, bedrooms: 3, bathrooms: 2, floor: 5, facades: 1,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "شقة فاخرة للإيجار الموسمي في المرادية — إطلالة بحرية",
    description: "شقة مفروشة بالكامل قرب البحر، مثالية للعطلات الصيفية",
    ownerEmail: "landlord.alger@aqarmatch.demo",
  },
  {
    intent: "SEASONAL_RENT", type: "VILLA", city: "الجزائر", commune: "الأبيار",
    askingPrice: 0, secretMinPrice: 0,
    pricePerNight: 35_000, secretMinPricePerNight: 28_000,
    minStayNights: 3,
    availableFrom: "2026-06-15", availableTo: "2026-09-15",
    areaSqm: 420, bedrooms: 6, bathrooms: 5, floor: 2, facades: 4,
    legalStatus: "NOTARIZED_ACT",
    offerTitle: "فيلا مع مسبح للإيجار الموسمي في الأبيار",
    description: "فيلا فاخرة مع مسبح وحديقة، تتسع لـ 12 شخص",
    ownerEmail: "landlord.alger@aqarmatch.demo",
  },
  {
    intent: "SEASONAL_RENT", type: "INDIVIDUAL_HOUSE", city: "البليدة", commune: "الشفة",
    askingPrice: 0, secretMinPrice: 0,
    pricePerNight: 18_000, secretMinPricePerNight: 14_000,
    minStayNights: 2,
    availableFrom: "2026-07-01", availableTo: "2026-08-15",
    areaSqm: 280, bedrooms: 4, bathrooms: 3, floor: 2, facades: 2,
    legalStatus: "LIVRET_FONCIER",
    offerTitle: "منزل فردي للإيجار الموسمي في الشفة — قرب الجبل",
    description: "منزل بارد صيفاً قرب جبل الشفافة، مناسب للعائلات",
    ownerEmail: "landlord.blida@aqarmatch.demo",
  },
];

async function ensureUser(email: string, role: "SELLER" | "LANDLORD") {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  return db.user.create({
    data: {
      email,
      nameEnc: await encryptJSON({
        name: email.includes("alger") ? "وكالة الجزائر العقارية"
          : email.includes("blida") ? "وكالة البليدة العقارية"
          : "وكالة المدية العقارية",
      }),
      phoneEnc: await encryptJSON({ phone: "+2135" + Math.floor(10_000_000 + Math.random() * 89_999_999) }),
      role,
      accountType: "AGENCY",
      verified: true,
    },
  });
}

async function main() {
  console.log("🌱 Seeding Aqar Match (Algeria — new schema)...");

  const ownerMap = new Map<string, "SELLER" | "LANDLORD">();
  for (const l of LISTINGS) {
    ownerMap.set(l.ownerEmail, l.intent === "RENT" ? "LANDLORD" : "SELLER");
  }
  const userCache = new Map<string, Awaited<ReturnType<typeof ensureUser>>>();
  for (const [email, role] of ownerMap.entries()) {
    userCache.set(email, await ensureUser(email, role));
    console.log(`  ✓ user: ${email} (${role})`);
  }

  await db.match.deleteMany();
  await db.negotiation.deleteMany();
  await db.listing.deleteMany();
  await db.matchRequest.deleteMany();

  for (const l of LISTINGS) {
    const owner = userCache.get(l.ownerEmail)!;
    const locationEnc = await encryptJSON({
      city: l.city, commune: l.commune, district: l.district || null,
      street: `شارع ${l.commune} - رقم ${Math.floor(Math.random() * 80) + 1}`,
    });
    const contactEnc = await encryptJSON({
      phone: "+2135" + Math.floor(10_000_000 + Math.random() * 89_999_999),
      whatsapp: "+2135" + Math.floor(10_000_000 + Math.random() * 89_999_999),
      email: l.ownerEmail,
      fullName: "الوكالة العقارية",
    });
    // Diverse exterior photos based on property type
    const coverPhotos: Record<string, string> = {
      APARTMENT: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80",
      VILLA: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80",
      INDIVIDUAL_HOUSE: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=80",
      COMMERCIAL: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
      BUILDABLE_LAND: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80",
      AGRICULTURAL_LAND: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80",
    };
    const interiorPhotos = [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
      "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1200&q=80",
    ];
    const coverUrl = coverPhotos[l.type] || coverPhotos.APARTMENT;
    const photosEnc = await encryptJSON([coverUrl, ...interiorPhotos]);

    const isSeasonal = l.intent === "SEASONAL_RENT";

    // Encrypt secret reserve (per-night for seasonal, total for others)
    const secretMinPriceEnc = isSeasonal
      ? ""
      : await encryptJSON({ secretMinPrice: l.secretMinPrice });
    const secretMinPricePerNightEnc = isSeasonal
      ? await encryptJSON({ secretMinPricePerNight: l.secretMinPricePerNight! })
      : null;

    // Encrypt GPS coordinates into single AES-256-GCM field
    const geoLocationEnc = (l.latitude != null && l.longitude != null)
      ? await encryptJSON({ lat: l.latitude, lng: l.longitude, accuracy: null })
      : null;

    // Compute seller fee
    let sellerFee: number;
    if (isSeasonal) {
      const nights = l.minStayNights ?? 1;
      sellerFee = calculateSellerFee(l.pricePerNight! * nights, "SEASONAL_RENT");
    } else {
      sellerFee = calculateSellerFee(l.askingPrice, l.intent);
    }

    await db.listing.create({
      data: {
        ownerId: owner.id,
        intent: l.intent, type: l.type,
        city: l.city, commune: l.commune, district: l.district || null,
        askingPrice: isSeasonal ? 0 : l.askingPrice,
        // SEASONAL_RENT fields:
        pricePerNight: isSeasonal ? l.pricePerNight : null,
        secretMinPricePerNightEnc,
        minStayNights: isSeasonal ? (l.minStayNights ?? 1) : null,
        availableFrom: isSeasonal && l.availableFrom ? new Date(l.availableFrom) : null,
        availableTo: isSeasonal && l.availableTo ? new Date(l.availableTo) : null,
        // GPS coordinates — encrypted single field
        geoLocationEnc,
        areaSqm: l.areaSqm,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        floor: l.floor,
        facades: l.facades,
        legalStatus: l.legalStatus,
        offerTitle: l.offerTitle,
        description: l.description || null,
        features: "[]",
        accountType: "AGENCY",
        secretMinPriceEnc,
        locationEnc, contactEnc, photosEnc,
        sellerFee,
        status: "ACTIVE",
      },
    });
    const priceLabel = isSeasonal
      ? `${l.pricePerNight?.toLocaleString("en-US")} دج/ليلة`
      : `${l.askingPrice.toLocaleString("en-US")} دج`;
    console.log(`  ✓ listing: ${l.intent} ${l.type} ${l.city}/${l.commune} — ${priceLabel} (fee: ${sellerFee.toLocaleString("en-US")})`);
  }

  console.log(`\n✅ Seeded ${LISTINGS.length} listings.`);
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
