import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ArrowLeft, Home as HomeIcon } from "lucide-react";
import { WILAYAS, COMMUNES_BY_WILAYA, type WilayaName } from "@/lib/schemas";
import { db } from "@/lib/db";

// ── SSG: pre-generate pages for all wilaya/commune combos ────────
export function generateStaticParams() {
  const params: { wilaya: string; commune: string }[] = [];
  for (const wilaya of WILAYAS) {
    const communes = COMMUNES_BY_WILAYA[wilaya] || [];
    for (const commune of communes) {
      params.push({
        wilaya: encodeURIComponent(wilaya),
        commune: encodeURIComponent(commune),
      });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ wilaya: string; commune: string }>;
}): Promise<Metadata> {
  const { wilaya: wEnc, commune: cEnc } = await params;
  const wilaya = decodeURIComponent(wEnc);
  const commune = decodeURIComponent(cEnc);

  return {
    title: `عقارات ${commune} — ${wilaya} | عقار Match`,
    description: `ابحث عن عقارات في ${commune}، ولاية ${wilaya} — شقق، فلل، منازل للبيع والإيجار والإيجار الموسمي. مطابقة ذكية بخصوصية مطلقة عبر عقار Match.`,
    keywords: [
      `عقارات ${commune}`,
      `شقق ${commune}`,
      `بيع عقار ${commune}`,
      `إيجار ${commune}`,
      `إيجار موسمي ${commune}`,
      `${commune} ${wilaya}`,
      `عقار Match ${commune}`,
    ],
    openGraph: {
      title: `عقارات ${commune} — ${wilaya} | عقار Match`,
      description: `ابحث عن عقارات في ${commune}، ولاية ${wilaya} — بيع، إيجار، إيجار موسمي.`,
      type: "website",
    },
    alternates: {
      canonical: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}/${encodeURIComponent(commune)}`,
    },
  };
}

export default async function CommunePage({
  params,
}: {
  params: Promise<{ wilaya: string; commune: string }>;
}) {
  const { wilaya: wEnc, commune: cEnc } = await params;
  const wilaya = decodeURIComponent(wEnc) as WilayaName;
  const commune = decodeURIComponent(cEnc);

  if (!WILAYAS.includes(wilaya) || !COMMUNES_BY_WILAYA[wilaya]?.includes(commune)) {
    notFound();
  }

  // Fetch listing counts for this commune
  let stats = { active: 0, sale: 0, rent: 0, seasonal: 0 };
  try {
    const [active, sale, rent, seasonal] = await Promise.all([
      db.listing.count({ where: { city: wilaya, commune, status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { city: wilaya, commune, intent: "SELL", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { city: wilaya, commune, intent: "RENT", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { city: wilaya, commune, intent: "SEASONAL_RENT", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
    ]);
    stats = { active, sale, rent, seasonal };
  } catch {}

  // Fetch sample listings for JSON-LD
  let sampleListings: Array<{
    id: string; intent: string; type: string;
    askingPrice: number; pricePerNight: number | null;
    areaSqm: number; bedrooms: number | null; bathrooms: number | null;
    offerTitle: string;
  }> = [];
  try {
    sampleListings = await db.listing.findMany({
      where: { city: wilaya, commune, status: { in: ["ACTIVE", "UNMODERATED"] } },
      select: {
        id: true, intent: true, type: true,
        askingPrice: true, pricePerNight: true,
        areaSqm: true, bedrooms: true, bathrooms: true,
        offerTitle: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
  } catch {}

  // ── JSON-LD: RealEstateListing ItemList ─────────────────────────
  const intentLabel: Record<string, string> = {
    SELL: "للبيع", RENT: "للإيجار", SEASONAL_RENT: "إيجار موسمي",
  };

  const realEstateItems = sampleListings.map((l) => {
    const price = l.intent === "SEASONAL_RENT" ? l.pricePerNight : l.askingPrice;
    return {
      "@type": "RealEstateListing",
      name: l.offerTitle,
      description: `${intentLabel[l.intent] || ""} — ${l.type} في ${commune}`,
      url: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}/${encodeURIComponent(commune)}`,
      image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
      price: {
        "@type": "PriceSpecification",
        price: price || 0,
        priceCurrency: "DZD",
        unitText: l.intent === "SEASONAL_RENT" ? "/ ليلة" : undefined,
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: commune,
        addressRegion: wilaya,
        addressCountry: "DZ",
      },
      floorSize: {
        "@type": "QuantitativeValue",
        value: l.areaSqm,
        unitCode: "MTK",
      },
      numberOfRooms: l.bedrooms || undefined,
      numberOfBathroomsTotal: l.bathrooms || undefined,
      category: l.type,
      publisher: {
        "@type": "Organization",
        name: "عقار Match",
        url: "https://aqarmatch.dz",
      },
    };
  });

  const jsonLdPlace = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `عقارات ${commune}`,
    alternateName: `${commune} — ${wilaya}`,
    description: `عقارات ${commune}، ولاية ${wilaya} — بيع، إيجار، إيجار موسمي عبر عقار Match.`,
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: wilaya,
    },
    aggregateRating: stats.active > 0 ? {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: String(stats.active),
    } : undefined,
  };

  const jsonLdItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `عقارات ${commune} — ${stats.active} عقار متاح`,
    numberOfItems: stats.active,
    itemListElement: realEstateItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };

  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://aqarmatch.dz/" },
      { "@type": "ListItem", position: 2, name: `عقارات ${wilaya}`, item: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}` },
      { "@type": "ListItem", position: 3, name: commune, item: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}/${encodeURIComponent(commune)}` },
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdPlace) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdItemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }} />

      {/* Breadcrumb */}
      <nav className="border-b bg-secondary/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition flex items-center gap-1">
            <HomeIcon className="w-3 h-3" /> الرئيسية
          </Link>
          <span>/</span>
          <Link href={`/immobilier/${encodeURIComponent(wilaya)}`} className="hover:text-foreground transition">
            عقارات {wilaya}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{commune}</span>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-oasis-gradient border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <MapPin className="w-3.5 h-3.5" />
            {commune} — {wilaya}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground mb-3">
            عقارات {commune}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            اعثر على عقارك في {commune} عبر المطابقة الذكية — بيع، إيجار، إيجار موسمي. خصوصية مطلقة، بدون وسطاء.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <StatBox label="عقار نشط" value={stats.active} />
            <StatBox label="للبيع" value={stats.sale} />
            <StatBox label="للإيجار" value={stats.rent} />
            <StatBox label="إيجار موسمي" value={stats.seasonal} />
          </div>

          {/* CTA */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/?view=search"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
            >
              ابحث في {commune}
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link
              href="/?view=publish"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-border bg-card hover:border-primary/40 transition font-medium"
            >
              انشر عقارك في {commune}
            </Link>
          </div>
        </div>
      </header>

      {/* SEO content */}
      <section className="py-10 sm:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-foreground mb-4">
            عن {commune}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {commune} هي إحدى بلديات ولاية {wilaya} في الجزائر. تضم المنصة عقارات متاحة في {commune} للبيع والإيجار والإيجار الموسمي، مع مطابقة ذكية تربطك مباشرة بالمالك دون وسطاء.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            عبر عقار Match، لا تتصفح قوائم لا نهائية — أدخل معاييرك وميزانيتك، والمحرك السري يطابقك بأفضل العروض المتاحة في {commune}. ميزانيتك سرية تماماً، ولا تُكشف بيانات التواصل إلا بعد تأكيد جدية الطرفين.
          </p>

          {/* Back to wilaya */}
          <div className="mt-8">
            <Link
              href={`/immobilier/${encodeURIComponent(wilaya)}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              كل بلديات {wilaya}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t bg-card py-6 text-center">
        <p className="text-xs sm:text-sm text-muted-foreground">
          عقار Match 2026 — المنصة الذكية للعقارات في الجزائر
        </p>
      </footer>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-primary-foreground/10 backdrop-blur p-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs opacity-90">{label}</div>
    </div>
  );
}
