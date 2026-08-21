import { z } from "zod";

// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Algeria
//  Schemas, enums, constants, and helpers (bilingual labels).
// ──────────────────────────────────────────────────────────────────

// ─── Enums ────────────────────────────────────────────────────────
export const propertyIntentSchema = z.enum(["SELL", "RENT", "SEASONAL_RENT"]);
export const propertyTypeSchema = z.enum([
  "APARTMENT",          // شقة
  "VILLA",              // فيلا
  "INDIVIDUAL_HOUSE",   // منزل فردي
  "COMMERCIAL",         // محل تجاري
  "BUILDABLE_LAND",     // أرض صالحة للبناء
  "AGRICULTURAL_LAND",  // أرض فلاحية
]);

// Property types allowed for SEASONAL_RENT (per spec — only 3).
export const SEASONAL_RENT_ALLOWED_TYPES: PropertyType[] = [
  "APARTMENT",
  "VILLA",
  "INDIVIDUAL_HOUSE",
];

// ─── Arabic-only fallback labels (for legacy components not yet migrated to i18n) ──
export const INTENT_LABELS: Record<string, string> = {
  SELL: "شراء",
  RENT: "إيجار",
  SEASONAL_RENT: "إيجار موسمي",
};

export const TYPE_LABELS: Record<string, string> = {
  APARTMENT: "شقة",
  VILLA: "فيلا",
  INDIVIDUAL_HOUSE: "منزل فردي",
  COMMERCIAL: "محل تجاري",
  BUILDABLE_LAND: "أرض صالحة للبناء",
  AGRICULTURAL_LAND: "أرض فلاحية",
};

export const legalStatusSchema = z.enum([
  "LIVRET_FONCIER",            // دفتر عقاري
  "NOTARIZED_ACT",             // عقد مشهر
  "REGISTERED_UNNOTARIZED",    // عقد مسجل وغير مشهر
  "ADMIN_DECISION",            // قرار إداري
  "PRIVATE_ACT",               // عقد عرفي
  "NO_DOCS",                   // بدون وثائق
]);

export const accountTypeSchema = z.enum([
  "INDIVIDUAL",  // فرد
  "AGENCY",      // وكالة عقارية
  "BROKER",      // مرقي عقاري
]);

// ─── Wilayas + communes (Algeria) ────────────────────────────────
export const WILAYAS = ["الجزائر", "البليدة", "المدية"] as const;
export type WilayaName = (typeof WILAYAS)[number];

// ── Normalize wilaya from Google Reverse Geocoding ────────────────
// Google may return "الجزائر العاصمة", "ولاية الجزائر", "Alger", "Blida",
// "Médéa" etc. — we need to match these to our WILAYAS array entries.
//
// Returns the matched WILAYAS entry, or null if no match (caller should
// leave the city field unchanged so the user picks from the dropdown).
//
// The matching is intentionally loose — we check if any WILAYAS entry
// is contained in the Google string OR vice-versa, to handle variants
// like "الجزائر العاصمة" containing "الجزائر".
export function normalizeWilaya(input: string): WilayaName | null {
  if (!input) return null;
  const normalized = input.trim();

  // Direct match
  for (const w of WILAYAS) {
    if (normalized === w) return w;
  }

  // Contains match (e.g., "الجزائر العاصمة" contains "الجزائر")
  for (const w of WILAYAS) {
    if (normalized.includes(w)) return w;
  }

  // English / French transliterations
  const lower = normalized.toLowerCase();
  const englishMap: Record<string, WilayaName> = {
    "alger": "الجزائر",
    "algiers": "الجزائر",
    "blida": "البليدة",
    "boufarik": "البليدة", // sometimes Google returns the commune
    "medea": "المدية",
    "médéa": "المدية",
  };
  for (const [key, value] of Object.entries(englishMap)) {
    if (lower.includes(key)) return value;
  }

  return null;
}

export const COMMUNES_BY_WILAYA: Record<WilayaName, string[]> = {
  الجزائر: [
    "الجزائر الوسطى","سيدي امحمد","المدنية","بلوزداد","باب الواد","بولوغين","القصبة",
    "واد قريش","بئر مراد رايس","الأبيار","بوزريعة","بئر خادم","الحراش","براقي","وادي السمار",
    "باش جراح","حسين داي","القبة","بوروبة","الدار البيضاء","باب الزوار","بن عكنون","دالي إبراهيم",
    "الحمامات","رايس حميدو","جسر قسنطينة","المرادية","حيدرة","المحمدية","برج الكيفان","المقارية",
    "بني مسوس","الكاليتوس","بئر توتة","تسالة المرجة","أولاد شبل","سيدي موسى","عين طاية","برج البحري",
    "المرسى","هراوة","الرويبة","الرغاية","عين البنيان","سطاوالي","زرالدة","المحالمة","الرحمانية",
    "السويدانية","الشراقة","أولاد فايت","العاشور","الدرارية","دويرة","بابا حسن","خرايسية","سحاولة",
  ],
  البليدة: [
    "البليدة","الشبلي","بوينان","وادي العلايق","أولاد يعيش","الشريعة","العفرون","الشفة","حمام ملوان",
    "بن خليل","الصومعة","موزاية","صوحان","مفتاح","أولاد سلامة","بوفاريك","الأربعاء","واد جر","بني تامو",
    "بوعرفة","بني مراد","بوقرة","قرواو","عين الرمانة","الجبابرة",
  ],
  المدية: [
    "المدية","ذراع السمار","تيزي المهدي","وزرة","الحمدانية","بن شكاو","وامري","وادي حربيل","حناشة",
    "تمزقيدة","سي المحجوب","بوعيشون","أولاد بوعشرة","قصر البخاري","سانق","المفاتحة","أولاد عنتر",
    "أولاد هلال","الشهبونية","بواعيش","بوغزول","عزيز","أم الجليل","دراق","بوغار","البرواقية","الربعية",
    "أولاد دايد","سغوان","مجبر","الزبيرية","ثلاثة الدوائر","العمرية","أولاد إبراهيم","بعطة","سيدي نعمان",
    "بوشراحيل","خمس جوامع","شلالة العذاورة","تافراوت","شنيقل","عين القصير","عين بوسيف","سيدي دامد",
    "العوينات","الكاف الأخضر","أولاد معرف","السواقي","سيدي زهار","سيدي زيان","جواب","بني سليمان",
    "بوسكن","سيدي الربيع","تابلاط","العيساوية","مزغنة","الحوضان","العزيزية","مغراوة","ميهوب","القلب الكبير",
    "سدراية","بئر بن عابد",
  ],
};

export function getCommunesForWilaya(wilaya: string): string[] {
  return COMMUNES_BY_WILAYA[wilaya as WilayaName] || [];
}

// ─── Land types (special handling) ───────────────────────────────
export const LAND_TYPES: PropertyType[] = ["BUILDABLE_LAND", "AGRICULTURAL_LAND"];
export function isLandType(t: string): boolean {
  return LAND_TYPES.includes(t as PropertyType);
}

// ─── Currency ────────────────────────────────────────────────────
export const CURRENCY = "دج";

// ─── Property features (Algeria) ─────────────────────────────────
export const PROPERTY_FEATURES = [
  "مصعد",
  "موقف سيارة",
  "تدفئة مركزية",
  "تكييف",
  "حديقة",
  "شرفة",
  "مخزن",
  "غرفة خدمة",
  "أرضية رخامية",
  "نظام أمان",
] as const;

// ─── Type aliases ────────────────────────────────────────────────
export type PropertyIntent = z.infer<typeof propertyIntentSchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type LegalStatus = z.infer<typeof legalStatusSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;

// ─── Account Category (3-tier business model) ────────────────────
export const accountCategorySchema = z.enum(["INDIVIDUAL", "AGENCY", "DEVELOPER"]);
export type AccountCategory = z.infer<typeof accountCategorySchema>;

// Algerian trade register number: typically RC/AAAA/XXXXXXX or numeric
// We accept alphanumeric + slash, 5-20 chars
export const agencyRegistryNumberSchema = z
  .string()
  .min(5, "رقم السجل التجاري مطلوب (5 أحرف على الأقل)")
  .max(30, "رقم السجل التجاري طويل جداً")
  .regex(/^[A-Za-z0-9\/\-]+$/, "صيغة رقم السجل التجاري غير صحيحة");

// Developer license number: similar format
export const developerLicenseNumberSchema = z
  .string()
  .min(5, "رقم اعتماد الترقية العقارية مطلوب (5 أحرف على الأقل)")
  .max(30, "رقم الاعتماد طويل جداً")
  .regex(/^[A-Za-z0-9\/\-]+$/, "صيغة رقم الاعتماد غير صحيحة");

// ─── Subscription plans (AGENCY) ──────────────────────────────────
export const subscriptionPlanSchema = z.enum(["BASIC", "PRO", "ENTERPRISE"]);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, { price: number; listingsLimit: number; label: string }> = {
  BASIC:      { price: 15_000,  listingsLimit: 10,  label: "BASIC" },
  PRO:        { price: 50_000,  listingsLimit: 50,  label: "PRO" },
  ENTERPRISE: { price: 150_000, listingsLimit: 9999, label: "ENTERPRISE" },
};

// ─── Urban Permit Status (عقود التعمير) ──────────────────────────
// SEPARATE from LegalStatus (ownership docs). This covers the building
// permits / urban planning status of the property.
//
// APPLICABILITY RULES:
//   • AGRICULTURAL_LAND → field must be null (not applicable).
//   • BUILDABLE_LAND    → only BUILDING_PERMIT / NO_BUILDING_PERMIT
//     (the other two require an existing building, which buildable
//     land by definition does not have yet).
//   • All other types   → all four options allowed.
export const urbanPermitStatusSchema = z.enum([
  "BUILDING_PERMIT",
  "NO_BUILDING_PERMIT",
  "CONFORMITY_CERTIFICATE",
  "BUILDING_IN_TITLE_DEED",
]);
export type UrbanPermitStatus = z.infer<typeof urbanPermitStatusSchema>;

// Property types where this field is NOT shown at all
export const URBAN_PERMIT_EXCLUDED_TYPES: PropertyType[] = ["AGRICULTURAL_LAND"];

export function isUrbanPermitApplicable(type: PropertyType | ""): boolean {
  return !!type && !URBAN_PERMIT_EXCLUDED_TYPES.includes(type as PropertyType);
}

// Options excluded specifically for BUILDABLE_LAND (they assume an
// existing building, which a buildable land doesn't have yet).
const BUILDABLE_LAND_EXCLUDED_OPTIONS: UrbanPermitStatus[] = [
  "CONFORMITY_CERTIFICATE",
  "BUILDING_IN_TITLE_DEED",
];

// Returns the list of valid options for a given property type.
// Empty array for AGRICULTURAL_LAND (field not shown).
// Two options for BUILDABLE_LAND (no building-yet options).
// Four options for everything else.
export function getUrbanPermitOptions(type: PropertyType | ""): UrbanPermitStatus[] {
  if (!type || !isUrbanPermitApplicable(type)) return [];
  const all: UrbanPermitStatus[] = [
    "BUILDING_PERMIT",
    "NO_BUILDING_PERMIT",
    "CONFORMITY_CERTIFICATE",
    "BUILDING_IN_TITLE_DEED",
  ];
  if (type === "BUILDABLE_LAND") {
    return all.filter((opt) => !BUILDABLE_LAND_EXCLUDED_OPTIONS.includes(opt));
  }
  return all;
}

// Returns true if the given (type, urbanPermitStatus) combination is valid.
// Used by server-side Zod refines to reject bypass attempts.
export function isUrbanPermitValidForType(
  type: PropertyType,
  urbanPermitStatus: UrbanPermitStatus | null | undefined,
): boolean {
  // AGRICULTURAL_LAND → must be null/undefined
  if (type === "AGRICULTURAL_LAND") {
    return urbanPermitStatus === null || urbanPermitStatus === undefined;
  }
  // Empty value is always valid (field is optional)
  if (urbanPermitStatus === null || urbanPermitStatus === undefined) return true;
  // Otherwise must be in the allowed options for this type
  return getUrbanPermitOptions(type).includes(urbanPermitStatus);
}

// ─── Pricing floors (server-side validation — source of truth) ───
//
// TWO KINDS OF FLOORS:
//
// 1) ASKING PRICE FLOOR — the publicly-visible asking price.
//    SELL: ≥ 1,000,000 DZD  (no sub-million listings on the platform)
//    RENT: ≥ 3,000 DZD/month  (filters out joke/test listings)
//    SEASONAL_RENT: handled via pricePerNight (separate field).
//
// 2) RESERVE (SECRET) PRICE FLOOR — the seller's hidden minimum.
//    SELL: ≥ 1,000,000 DZD  (ABSOLUTE — regardless of askingPrice)
//    RENT: ≥ 3,000 DZD/month (matches asking floor — prevents 1-DZD
//          secrets that would match every buyer and defeat the gate)
//    SEASONAL_RENT: ≥ 2,000 DZD/night
//
// INVARIANTS ENFORCED IN SCHEMAS + SERVER:
//    • askingPrice ≥ getAskingPriceFloor(intent)
//    • secretMinPrice ≥ getReservePriceFloor(intent)
//    • secretMinPrice ≤ askingPrice
//
// SECURITY: secretMinPrice floor is ABSOLUTE for SELL — even if
// askingPrice is 50M DZD, secretMinPrice cannot be 999,999 DZD.
// This prevents a seller from setting a near-zero secret to match
// every buyer and harvest their contact data.
export const ASKING_PRICE_FLOOR_SELL = 1_000_000;   // 1,000,000 DZD
export const ASKING_PRICE_FLOOR_RENT = 3_000;        // 3,000 DZD/month
// (SEASONAL_RENT uses RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT for pricePerNight)

export const RESERVE_PRICE_FLOOR_SELL = 1_000_000;             // 1,000,000 DZD (ABSOLUTE for SELL)
export const RESERVE_PRICE_FLOOR_RENT = 3_000;                 // 3,000 DZD/month (matches asking floor)
export const RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT = 2_000;   // 2,000 DZD/night

// ── Asking price floor (intent-based) ──────────────────────────
export function getAskingPriceFloor(intent: PropertyIntent): number {
  if (intent === "RENT") return ASKING_PRICE_FLOOR_RENT;
  if (intent === "SEASONAL_RENT") return RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT;
  return ASKING_PRICE_FLOOR_SELL; // SELL
}

export function getAskingPriceFloorMessage(intent: PropertyIntent): string {
  if (intent === "RENT") {
    return `السعر المطلوب في الإيجار يجب ألا يقل عن ${ASKING_PRICE_FLOOR_RENT.toLocaleString("en-US")} دج`;
  }
  if (intent === "SEASONAL_RENT") {
    return `السعر لليلة يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT.toLocaleString("en-US")} دج للإيجار الموسمي`;
  }
  return `السعر المطلوب في البيع يجب أن يكون ${ASKING_PRICE_FLOOR_SELL.toLocaleString("en-US")} دج أو أكثر`;
}

// ── Reserve (secret) price floor (intent-based) ────────────────
export function getReservePriceFloor(intent: PropertyIntent): number {
  if (intent === "RENT") return RESERVE_PRICE_FLOOR_RENT;
  if (intent === "SEASONAL_RENT") return RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT;
  return RESERVE_PRICE_FLOOR_SELL; // SELL
}

export function getReservePriceFloorMessage(intent: PropertyIntent): string {
  if (intent === "RENT") {
    return `الحد الأدنى السري يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_RENT.toLocaleString("en-US")} دج للإيجار`;
  }
  if (intent === "SEASONAL_RENT") {
    return `الحد الأدنى السري لليلة يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT.toLocaleString("en-US")} دج للإيجار الموسمي`;
  }
  return `الحد الأدنى السري في البيع لا يمكن أن يقل عن ${RESERVE_PRICE_FLOOR_SELL.toLocaleString("en-US")} دج بأي حال`;
}

// ─── Transparent fee calculation (v2 — percentage-based) ─────────
//
// Legal basis: Algerian Civil Code, Article 207 (resolutory condition).
// Fee payment is a resolutory obligation — if the match fails for
// reasons not attributable to the platform, the aggrieved party's
// fee is refunded.
//
// SALE:
//   Seller fee = 0.75% of Asking Price, minimum 15,000 DZD
//   Buyer fee  = half of seller fee, minimum 10,000 DZD
//
// RENT:
//   Landlord fee = 0.75% of monthly asking rent, minimum 7,500 DZD
//   Tenant fee   = half of landlord fee, minimum 5,000 DZD
//
// SEASONAL_RENT:
//   Landlord fee = 0.75% of total stay value (pricePerNight × nights),
//                  minimum 7,500 DZD
//   Tenant fee   = half of landlord fee, minimum 5,000 DZD
export function calculateSellerFee(
  askingPrice: number,
  intent: PropertyIntent,
): number {
  const fee = Math.round(askingPrice * 0.0075); // 0.75%
  if (intent === "SELL") {
    return Math.max(15_000, fee);
  }
  // RENT or SEASONAL_RENT
  return Math.max(7_500, fee);
}

// Helper: compute SEASONAL_RENT seller fee from per-night asking price + nights.
export function calculateSeasonalRentSellerFee(
  pricePerNight: number,
  nights: number,
): number {
  return calculateSellerFee(pricePerNight * nights, "SEASONAL_RENT");
}

// Buyer fee = half of seller fee, with per-intent minimum.
// Per spec: buyer minimum is 10,000 DZD (SELL) / 5,000 DZD (RENT).
export function calculateBuyerFee(
  askingPrice: number,
  intent: PropertyIntent,
): number {
  const sellerFee = calculateSellerFee(askingPrice, intent);
  const half = Math.round(sellerFee / 2);
  if (intent === "SELL") {
    return Math.max(10_000, half);
  }
  // RENT or SEASONAL_RENT
  return Math.max(5_000, half);
}

// ─── Schemas: publish flow (5 steps) ─────────────────────────────

// Step 1 — transaction type + property type
// SEASONAL_RENT is restricted to APARTMENT / VILLA / INDIVIDUAL_HOUSE.
export const publishStep1Schema = z
  .object({
    intent: propertyIntentSchema,
    type: propertyTypeSchema,
  })
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      return SEASONAL_RENT_ALLOWED_TYPES.includes(d.type);
    },
    {
      message: "الإيجار الموسمي متاح فقط للشقق والفلل والمنازل الفردية",
      path: ["type"],
    },
  );

// ── SEASONAL_RENT pricing schema ────────────────────────────────
// Used instead of publishStep3Schema when intent = SEASONAL_RENT.
// Validates: pricePerNight (public), secretMinPricePerNight (encrypted
// server-side), minStayNights, availability window.
export const seasonalRentPricingSchema = z
  .object({
    pricePerNight: z
      .number({ message: "السعر لليلة مطلوب" })
      .int()
      .min(RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT, `الحد الأدنى للسعر لليلة ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT} دج`),
    secretMinPricePerNight: z
      .number({ message: "الحد الأدنى السري لليلة مطلوب" })
      .int()
      .min(1, "الحد الأدنى السري لليلة مطلوب"),
    minStayNights: z
      .number({ message: "الحد الأدنى لعدد الليالي مطلوب" })
      .int()
      .min(1, "الحد الأدنى لعدد الليالي هو 1")
      .max(90, "الحد الأقصى 90 ليلة"),
    availableFrom: z.string().min(1, "تاريخ بداية التوفر مطلوب"),
    availableTo: z.string().min(1, "تاريخ نهاية التوفر مطلوب"),
  })
  .refine((d) => d.secretMinPricePerNight <= d.pricePerNight, {
    path: ["secretMinPricePerNight"],
    message: "الحد الأدنى السري لليلة يجب أن يكون أقل من أو يساوي السعر المعلن لليلة",
  })
  .refine(
    (d) => new Date(d.availableTo) > new Date(d.availableFrom),
    {
      path: ["availableTo"],
      message: "تاريخ نهاية التوفر يجب أن يكون بعد تاريخ البداية",
    },
  )
  .refine(
    (d) => d.secretMinPricePerNight >= RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT,
    {
      path: ["secretMinPricePerNight"],
      message: `الحد الأدنى السري لليلة يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT.toLocaleString("en-US")} دج للإيجار الموسمي`,
    },
  );

export type SeasonalRentPricing = z.infer<typeof seasonalRentPricingSchema>;

// Step 2 — location + property details (conditional for land)
export const publishStep2Schema = z
  .object({
    // location
    city: z.enum(WILAYAS),
    commune: z.string().min(2, "البلدية مطلوبة"),
    district: z.string().max(60).optional().or(z.literal("")),
    // details
    areaSqm: z.number().int().min(1, "المساحة مطلوبة"),
    bedrooms: z.number().int().min(0).max(20).optional().nullable(),
    floor: z.number().int().min(-5).max(200).optional().nullable(),
    bathrooms: z.number().int().min(0).max(15).optional().nullable(),
    facades: z.number().int().min(0).max(10).optional().nullable(),
    legalStatus: legalStatusSchema,
    // عقود التعمير — optional, but conditional validation below.
    // Need `type` for the refine — it comes from step 1, passed here as optional.
    type: propertyTypeSchema.optional(),
    urbanPermitStatus: urbanPermitStatusSchema.optional().nullable(),
    offerTitle: z.string().min(5, "عنوان العرض مطلوب (5 أحرف على الأقل)").max(120),
    description: z.string().max(2000).optional().or(z.literal("")),
  })
  // ── AGRICULTURAL_LAND: urbanPermitStatus must be null ──
  .refine(
    (d) => !(d.type === "AGRICULTURAL_LAND" && d.urbanPermitStatus != null),
    {
      path: ["urbanPermitStatus"],
      message: "عقود التعمير غير قابلة للتطبيق على الأرض الفلاحية",
    },
  )
  // ── Value must be in the allowed options for this type ──
  // (rejects CONFORMITY_CERTIFICATE / BUILDING_IN_TITLE_DEED on BUILDABLE_LAND)
  .refine(
    (d) => {
      if (!d.type) return true;
      return isUrbanPermitValidForType(d.type, d.urbanPermitStatus);
    },
    {
      path: ["urbanPermitStatus"],
      message: "قيمة عقود التعمير غير متاحة لهذا النوع من العقار",
    },
  );

// Step 3 — pricing (asking + secret minimum)
// NOTE: reserve price floor is enforced BOTH here (client-side) AND in
// the server route handler. Server enforcement is the source of truth.
//
// RULES (SELL/RENT — SEASONAL_RENT is handled in publishListingSchema):
//   • askingPrice ≥ getAskingPriceFloor(intent)
//       SELL: ≥ 1,000,000 DZD
//       RENT: ≥ 3,000 DZD
//   • secretMinPrice ≤ askingPrice
//   • secretMinPrice ≥ getReservePriceFloor(intent)
//       SELL: ≥ 1,000,000 DZD (ABSOLUTE — even if askingPrice is higher)
//       RENT: ≥ 3,000 DZD
//
// Zod v4 note: message must be a static string (not a function).
// We split intent-specific checks into separate refines so each can
// have its own static message.
export const publishStep3Schema = z
  .object({
    intent: propertyIntentSchema, // required — determines which floor applies
    askingPrice: z
      .number({ message: "السعر المطلوب مطلوب" })
      .int(),
    secretMinPrice: z
      .number({ message: "الحد الأدنى السري مطلوب" })
      .int(),
  })
  // ── askingPrice floor — SELL ──
  .refine(
    (d) => d.intent !== "SELL" || d.askingPrice >= ASKING_PRICE_FLOOR_SELL,
    {
      path: ["askingPrice"],
      message: `السعر المطلوب في البيع يجب أن يكون ${ASKING_PRICE_FLOOR_SELL.toLocaleString("en-US")} دج أو أكثر`,
    },
  )
  // ── askingPrice floor — RENT ──
  .refine(
    (d) => d.intent !== "RENT" || d.askingPrice >= ASKING_PRICE_FLOOR_RENT,
    {
      path: ["askingPrice"],
      message: `السعر المطلوب في الإيجار يجب ألا يقل عن ${ASKING_PRICE_FLOOR_RENT.toLocaleString("en-US")} دج`,
    },
  )
  // ── secretMinPrice ≤ askingPrice ──
  .refine((d) => d.secretMinPrice <= d.askingPrice, {
    path: ["secretMinPrice"],
    message: "الحد الأدنى السري يجب أن يكون أقل من أو يساوي السعر المطلوب",
  })
  // ── secretMinPrice absolute floor — SELL ──
  .refine(
    (d) => d.intent !== "SELL" || d.secretMinPrice >= RESERVE_PRICE_FLOOR_SELL,
    {
      path: ["secretMinPrice"],
      message: `الحد الأدنى السري في البيع لا يمكن أن يقل عن ${RESERVE_PRICE_FLOOR_SELL.toLocaleString("en-US")} دج بأي حال`,
    },
  )
  // ── secretMinPrice absolute floor — RENT ──
  .refine(
    (d) => d.intent !== "RENT" || d.secretMinPrice >= RESERVE_PRICE_FLOOR_RENT,
    {
      path: ["secretMinPrice"],
      message: `الحد الأدنى السري يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_RENT.toLocaleString("en-US")} دج للإيجار`,
    },
  );

// Step 4 — seller info
export const publishStep4Schema = z.object({
  accountType: accountTypeSchema,
  fullName: z.string().min(3, "الاسم مطلوب").max(80),
  phone: z
    .string()
    .min(10, "رقم هاتف صحيح مطلوب")
    .max(20),
});

// Step 5 — photos (optional)
export const publishStep5Schema = z.object({
  photos: z.array(z.string()).max(5).optional(),
});

// ─── Full publish schema (combined) ──────────────────────────────
// Reserve price floor enforced here (server-side) AND in the route handler.
export const publishListingSchema = z
  .object({
    intent: propertyIntentSchema,
    type: propertyTypeSchema,
    city: z.enum(WILAYAS),
    commune: z.string().min(2),
    district: z.string().max(60).optional().nullable(),
    areaSqm: z.number().int().min(1),
    bedrooms: z.number().int().min(0).max(20).optional().nullable(),
    floor: z.number().int().min(-5).max(200).optional().nullable(),
    bathrooms: z.number().int().min(0).max(15).optional().nullable(),
    facades: z.number().int().min(0).max(10).optional().nullable(),
    // ── Feature completeness (for future Hedonic Model) ──
    buildingAge: z.number().int().min(0).max(200).optional().nullable(),
    hasElevator: z.boolean().optional().default(false),
    hasParking: z.boolean().optional().default(false),
    seasonalSeason: z.enum(["SUMMER", "WINTER", "EID", "HOLIDAY", "OFF_SEASON"]).optional().nullable(),
    legalStatus: legalStatusSchema,
    // عقود التعمير — optional, conditional validation via refines below.
    urbanPermitStatus: urbanPermitStatusSchema.optional().nullable(),
    offerTitle: z.string().min(5).max(120),
    description: z.string().max(2000).optional().nullable(),
    // SELL / RENT pricing (ignored for SEASONAL_RENT)
    // askingPrice floor is enforced via .refine below (intent-based).
    // secretMinPrice floor is enforced via .refine below (intent-based).
    askingPrice: z.number().int().optional(),
    secretMinPrice: z.number().int().optional(),
    // SEASONAL_RENT pricing (ignored for SELL / RENT)
    pricePerNight: z.number().int().min(RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT).optional(),
    secretMinPricePerNight: z.number().int().min(1).optional(),
    minStayNights: z.number().int().min(1).max(90).optional(),
    availableFrom: z.string().optional(),
    availableTo: z.string().optional(),
    // GPS coordinates (optional — for real-distance matching)
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    locationAccuracy: z.number().min(0).optional(),
    accountType: accountTypeSchema,
    fullName: z.string().min(3).max(80),
    phone: z.string().min(10).max(20),
    photos: z.array(z.string()).max(5).optional(),
  })
  // SEASONAL_RENT: restrict type to APARTMENT / VILLA / INDIVIDUAL_HOUSE
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      return SEASONAL_RENT_ALLOWED_TYPES.includes(d.type);
    },
    {
      message: "الإيجار الموسمي متاح فقط للشقق والفلل والمنازل الفردية",
      path: ["type"],
    },
  )
  // SELL / RENT: validate askingPrice + secretMinPrice presence
  .refine(
    (d) => {
      if (d.intent === "SEASONAL_RENT") return true;
      return d.askingPrice !== undefined && d.secretMinPrice !== undefined;
    },
    { message: "السعر المطلوب والحد الأدنى السري مطلوبان", path: ["askingPrice"] },
  )
  // ── askingPrice floor — SELL (≥ 1,000,000 DZD) ──
  .refine(
    (d) => {
      if (d.intent !== "SELL") return true;
      return d.askingPrice !== undefined && d.askingPrice >= ASKING_PRICE_FLOOR_SELL;
    },
    {
      path: ["askingPrice"],
      message: `السعر المطلوب في البيع يجب أن يكون ${ASKING_PRICE_FLOOR_SELL.toLocaleString("en-US")} دج أو أكثر`,
    },
  )
  // ── askingPrice floor — RENT (≥ 3,000 DZD) ──
  .refine(
    (d) => {
      if (d.intent !== "RENT") return true;
      return d.askingPrice !== undefined && d.askingPrice >= ASKING_PRICE_FLOOR_RENT;
    },
    {
      path: ["askingPrice"],
      message: `السعر المطلوب في الإيجار يجب ألا يقل عن ${ASKING_PRICE_FLOOR_RENT.toLocaleString("en-US")} دج`,
    },
  )
  // ── secretMinPrice ≤ askingPrice ──
  .refine(
    (d) => {
      if (d.intent === "SEASONAL_RENT") return true;
      return d.secretMinPrice! <= d.askingPrice!;
    },
    {
      path: ["secretMinPrice"],
      message: "الحد الأدنى السري يجب أن يكون أقل من أو يساوي السعر المطلوب",
    },
  )
  // ── secretMinPrice absolute floor — SELL (≥ 1,000,000 DZD, NO EXCEPTIONS) ──
  .refine(
    (d) => {
      if (d.intent !== "SELL") return true;
      return d.secretMinPrice !== undefined && d.secretMinPrice >= RESERVE_PRICE_FLOOR_SELL;
    },
    {
      path: ["secretMinPrice"],
      message: `الحد الأدنى السري في البيع لا يمكن أن يقل عن ${RESERVE_PRICE_FLOOR_SELL.toLocaleString("en-US")} دج بأي حال`,
    },
  )
  // ── secretMinPrice absolute floor — RENT (≥ 3,000 DZD) ──
  .refine(
    (d) => {
      if (d.intent !== "RENT") return true;
      return d.secretMinPrice !== undefined && d.secretMinPrice >= RESERVE_PRICE_FLOOR_RENT;
    },
    {
      path: ["secretMinPrice"],
      message: `الحد الأدنى السري يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_RENT.toLocaleString("en-US")} دج للإيجار`,
    },
  )
  // SEASONAL_RENT: validate pricePerNight + secretMinPricePerNight + dates
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      return d.pricePerNight !== undefined && d.secretMinPricePerNight !== undefined;
    },
    { message: "السعر لليلة والحد الأدنى السري لليلة مطلوبان للإيجار الموسمي", path: ["pricePerNight"] },
  )
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      return d.secretMinPricePerNight! <= d.pricePerNight!;
    },
    {
      path: ["secretMinPricePerNight"],
      message: "الحد الأدنى السري لليلة يجب أن يكون أقل من أو يساوي السعر المعلن لليلة",
    },
  )
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      return d.secretMinPricePerNight! >= RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT;
    },
    {
      path: ["secretMinPricePerNight"],
      message: `الحد الأدنى السري لليلة يجب ألا يقل عن ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT.toLocaleString("en-US")} دج للإيجار الموسمي`,
    },
  )
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      if (!d.availableFrom || !d.availableTo) return false;
      return new Date(d.availableTo) > new Date(d.availableFrom);
    },
    {
      path: ["availableTo"],
      message: "تاريخ نهاية التوفر يجب أن يكون بعد تاريخ البداية",
    },
  )
  // ── عقود التعمير (Urban Permit Status) — conditional validation ──
  // AGRICULTURAL_LAND: urbanPermitStatus must be null/undefined.
  .refine(
    (d) => !(d.type === "AGRICULTURAL_LAND" && d.urbanPermitStatus != null),
    {
      path: ["urbanPermitStatus"],
      message: "عقود التعمير غير قابلة للتطبيق على الأرض الفلاحية",
    },
  )
  // Value must be in the allowed options for this type (rejects
  // CONFORMITY_CERTIFICATE / BUILDING_IN_TITLE_DEED on BUILDABLE_LAND
  // even if the value is a valid enum member).
  .refine(
    (d) => isUrbanPermitValidForType(d.type, d.urbanPermitStatus),
    {
      path: ["urbanPermitStatus"],
      message: "قيمة عقود التعمير غير متاحة لهذا النوع من العقار",
    },
  );

export type PublishListingInput = z.infer<typeof publishListingSchema>;
export type PublishStep1 = z.infer<typeof publishStep1Schema>;
export type PublishStep2 = z.infer<typeof publishStep2Schema>;
export type PublishStep3 = z.infer<typeof publishStep3Schema>;
export type PublishStep4 = z.infer<typeof publishStep4Schema>;
export type PublishStep5 = z.infer<typeof publishStep5Schema>;

// ─── Schemas: search flow (5 steps) ──────────────────────────────

// Step 1 — buy/rent
export const searchStep1Schema = z.object({
  intent: propertyIntentSchema,
});

// Step 2 — property type
export const searchStep2Schema = z.object({
  type: propertyTypeSchema,
});

// Step 3 — location
export const searchStep3Schema = z.object({
  city: z.enum(WILAYAS),
  commune: z.string().optional().or(z.literal("")), // optional — broad search
  district: z.string().max(60).optional().or(z.literal("")),
});

// Step 4 — max budget (only required for stage 2 matching)
export const searchStep4Schema = z.object({
  maxBudget: z
    .number({ message: "الميزانية مطلوبة" })
    .int()
    .min(100_000, "الحد الأدنى 100,000 دج"),
});

// Step 5 — contact info
export const searchStep5Schema = z.object({
  fullName: z.string().min(3, "الاسم مطلوب").max(80),
  phone: z.string().min(10, "رقم هاتف صحيح مطلوب").max(20),
});

// ─── Two-stage matching request ──────────────────────────────────
// Stage 1: general criteria (intent, type, wilaya, commune) → buyer
//          sees if any matches exist, but NOT the price/budget.
// Stage 2: buyer provides max budget → final match including price.
//
// SEASONAL_RENT: same two-stage flow, but stage 2 also requires
// checkIn/checkOut dates. The buyer's max budget here is per-night,
// and the engine filters by (maxBudgetPerNight ≥ secretMinPricePerNight)
// + date overlap with [availableFrom, availableTo] + stay length ≥ minStayNights.
export const matchStage1Schema = z
  .object({
    intent: propertyIntentSchema,
    type: propertyTypeSchema,
    city: z.enum(WILAYAS),
    commune: z.string().optional().nullable(),
    district: z.string().optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.intent !== "SEASONAL_RENT") return true;
      return SEASONAL_RENT_ALLOWED_TYPES.includes(d.type);
    },
    {
      message: "الإيجار الموسمي متاح فقط للشقق والفلل والمنازل الفردية",
      path: ["type"],
    },
  );

export const matchStage2Schema = matchStage1Schema.extend({
  // For SEASONAL_RENT, maxBudget is per-night and can be as low as 2,000 DZD.
  // For SELL/RENT, the floor is 100,000 DZD.
  maxBudget: z.number().int().min(2_000),
  fullName: z.string().min(3).max(80),
  phone: z.string().min(10).max(20),
  // SEASONAL_RENT-only — optional for SELL/RENT
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  // GPS search (optional — for real-distance matching)
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  searchRadiusKm: z.number().min(0.5).max(200).optional(),
});

export type MatchStage1Input = z.infer<typeof matchStage1Schema>;
export type MatchStage2Input = z.infer<typeof matchStage2Schema>;

// ─── Negotiation schema (DZD) ────────────────────────────────────
export const negotiationOfferSchema = z.object({
  matchId: z.string().min(1, "معرف المطابقة مطلوب"),
  offer: z
    .number({ message: "العرض مطلوب" })
    .int("يجب أن يكون رقماً صحيحاً")
    .min(100_000, "الحد الأدنى 100,000 دج"),
  note: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
});

export type NegotiationOfferInput = z.infer<typeof negotiationOfferSchema>;

// ─── Blind match result (public-facing) ──────────────────────────
export const blindMatchSchema = z.object({
  matchId: z.string(),
  score: z.number().min(0).max(100),
  intent: propertyIntentSchema,
  type: propertyTypeSchema,
  city: z.string(),
  commune: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  askingPrice: z.number().int().optional(), // only revealed after fee payment
  areaSqm: z.number().int(),
  bedrooms: z.number().int().nullable().optional(),
  bathrooms: z.number().int().nullable().optional(),
  facades: z.number().int().nullable().optional(),
  legalStatus: legalStatusSchema.optional(),
  // عقود التعمير — public field (not sensitive), shown in blind match card.
  urbanPermitStatus: urbanPermitStatusSchema.optional().nullable(),
  offerTitle: z.string().optional(),
  buyerFee: z.number().int(), // shown in stage 1 result
  addressRevealed: z.boolean(),
  contactRevealed: z.boolean(),
  photosRevealed: z.boolean(),
});

export type BlindMatch = z.infer<typeof blindMatchSchema>;

// ─── SmartWizard schemas (search flow v2 — used by Step2Location) ──
export const step2Schema = z.object({
  city: z.enum(WILAYAS),
  commune: z.string().min(2),
  district: z.string().max(60).optional().nullable(),
});
export type Step2Data = z.infer<typeof step2Schema>;

// ─── Match request (final submission from SmartWizard) ──────────
export const matchRequestSchema = z.object({
  intent: propertyIntentSchema,
  type: propertyTypeSchema.optional().nullable(),
  city: z.enum(WILAYAS),
  commune: z.string().optional().nullable(),
  district: z.string().max(60).optional().nullable(),
  budget: z.number().int().min(50_000),
  areaSqm: z.number().int().min(1).optional().nullable(),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  features: z.array(z.string()).max(20).optional(),
  fullName: z.string().min(3).max(80),
  phone: z.string().min(10).max(20),
});
export type MatchRequest = z.infer<typeof matchRequestSchema>;

// ══════════════════════════════════════════════════════════════════
//  AUTH SCHEMAS (Phase 2 — email + password auth)
// ══════════════════════════════════════════════════════════════════
// All auth endpoints use these Zod schemas for input validation.
// Validation happens BEFORE any DB lookup or rate-limit check, so
// malformed requests are rejected cheaply (no DB load).

// ── Email validation ─────────────────────────────────────────────
// Standard email regex (RFC 5322 simplified) + length cap.
// We DON'T verify the domain exists (DNS lookup) — that's a spam-
// prevention measure better handled by email verification at signup.
export const emailSchema = z
  .string()
  .min(5, "EMAIL_TOO_SHORT")
  .max(254, "EMAIL_TOO_LONG")
  .email("EMAIL_INVALID_FORMAT")
  .transform((s) => s.toLowerCase().trim());

// ── Password validation ──────────────────────────────────────────
// Strong-password policy:
//   • min 8 chars
//   • at least 1 uppercase
//   • at least 1 lowercase
//   • at least 1 digit
//   • at least 1 symbol (from a defined set)
// The error messages are i18n keys, NOT user-facing text — the UI
// translates them via the i18n dictionary.
export const passwordSchema = z
  .string()
  .min(8, "PASSWORD_TOO_SHORT")
  .max(128, "PASSWORD_TOO_LONG")
  .refine((s) => /[A-Z]/.test(s), "PASSWORD_NO_UPPERCASE")
  .refine((s) => /[a-z]/.test(s), "PASSWORD_NO_LOWERCASE")
  .refine((s) => /\d/.test(s), "PASSWORD_NO_DIGIT")
  .refine(
    (s) => /[!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]/.test(s),
    "PASSWORD_NO_SYMBOL",
  );

// ── National ID Number (NIN — رقم التعريف الوطني) ───────────────
// 18-digit Algerian national ID. Required on signup. Stored encrypted
// (AES-256-GCM). No live verification against government databases —
// format-only validation (length + numeric) to prevent typos.
export const ninSchema = z
  .string()
  .min(18, "رقم التعريف الوطني يجب أن يكون 18 رقماً")
  .max(18, "رقم التعريف الوطني يجب أن يكون 18 رقماً")
  .regex(/^\d{18}$/, "رقم التعريف الوطني يجب أن يحتوي على أرقام فقط")
  .describe("Algerian National ID Number (NIN) — 18 digits");

// ── Signup schema (email + password) ─────────────────────────────
export const signupEmailSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(3, "NAME_TOO_SHORT").max(80, "NAME_TOO_LONG"),
  // NIN is frozen (disabled) — not editable during signup.
  // Server accepts empty string for backward compatibility.
  nin: z.string().optional().default(""),
  // Optional phone — if provided, will be normalized + verified later.
  phone: z.string().optional().nullable(),
  rememberMe: z.boolean().optional().default(false),
});
export type SignupEmailInput = z.infer<typeof signupEmailSchema>;

// ── Login schema (email + password) ──────────────────────────────
export const loginEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "PASSWORD_REQUIRED").max(128),
  rememberMe: z.boolean().optional().default(false),
});
export type LoginEmailInput = z.infer<typeof loginEmailSchema>;

// ── Phone login (existing OTP flow, but normalized here) ─────────
export const loginPhoneSchema = z.object({
  phone: z.string().min(10, "PHONE_INVALID").max(20),
  // Code is verified in a separate /verify step, not at request time.
});
export type LoginPhoneInput = z.infer<typeof loginPhoneSchema>;

export const verifyPhoneSchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().regex(/^\d{6}$/, "CODE_MUST_BE_6_DIGITS"),
});
export type VerifyPhoneInput = z.infer<typeof verifyPhoneSchema>;

// ── Password reset ───────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "TOKEN_INVALID").max(100),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ── Email verification ────────────────────────────────────────────
export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(100),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const verifyEmailOtpSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "CODE_MUST_BE_6_DIGITS"),
});
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;
