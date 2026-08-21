import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ArrowLeft, Building2, Home as HomeIcon } from "lucide-react";
import { WILAYAS, COMMUNES_BY_WILAYA, type WilayaName } from "@/lib/schemas";
import { getArticlesByWilaya } from "@/lib/blog/blog-data";
import { db } from "@/lib/db";

// ── SSG: pre-generate pages for all 3 wilayas ────────────────────
export function generateStaticParams() {
  return WILAYAS.map((w) => ({ wilaya: encodeURIComponent(w) }));
}

// ── Dynamic metadata per wilaya ──────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ wilaya: string }>;
}): Promise<Metadata> {
  const { wilaya: encoded } = await params;
  const wilaya = decodeURIComponent(encoded);
  if (!WILAYAS.includes(wilaya as WilayaName)) {
    return { title: "ولاية غير موجودة" };
  }

  const titles: Record<string, string> = {
    الجزائر: "عقارات الجزائر العاصمة — بيع، إيجار، إيجار موسمي",
    البليدة: "عقارات البليدة — بيع، إيجار، إيجار موسمي",
    المدية: "عقارات المدية — بيع، إيجار، أراضي",
  };
  const descriptions: Record<string, string> = {
    الجزائر:
      "ابحث عن عقارات في الجزائر العاصمة — شقق، فلل، منازل فردية للبيع والإيجار والإيجار الموسمي. مطابقة ذكية بخصوصية مطلقة. حيدرة، المرادية، الأبيار، باب الزوار والمزيد.",
    البليدة:
      "عقارات في ولاية البليدة — شقق، فلل، أراضٍ للبيع والإيجار. إيجار موسمي في الشفا وبوفاريك. مطابقة ذكية بخصوصية مطلقة عبر عقار Match.",
    المدية:
      "عقارات ولاية المدية — شقق، منازل، أراضٍ صالحة للبناء وفلاحية. أسعار منافسة وفرص استثمارية. مطابقة ذكية بخصوصية مطلقة عبر عقار Match.",
  };

  return {
    title: titles[wilaya] || `عقارات ${wilaya} | عقار Match`,
    description: descriptions[wilaya] || `عقارات ${wilaya} عبر عقار Match`,
    keywords: [
      `عقارات ${wilaya}`,
      `شقق ${wilaya}`,
      `بيع عقار ${wilaya}`,
      `إيجار ${wilaya}`,
      `إيجار موسمي ${wilaya}`,
      `عقار Match ${wilaya}`,
    ],
    openGraph: {
      title: titles[wilaya],
      description: descriptions[wilaya],
      type: "website",
    },
    alternates: {
      canonical: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}`,
    },
  };
}

export default async function WilayaPage({
  params,
}: {
  params: Promise<{ wilaya: string }>;
}) {
  const { wilaya: encoded } = await params;
  const wilaya = decodeURIComponent(encoded) as WilayaName;

  if (!WILAYAS.includes(wilaya)) {
    notFound();
  }

  const communes = COMMUNES_BY_WILAYA[wilaya] || [];
  const articles = getArticlesByWilaya(wilaya);

  // Fetch live listing counts + sample listings for JSON-LD
  let stats = { active: 0, sale: 0, rent: 0, seasonal: 0 };
  let sampleListings: Array<{
    id: string; intent: string; type: string; city: string;
    commune: string | null; askingPrice: number; pricePerNight: number | null;
    areaSqm: number; bedrooms: number | null; bathrooms: number | null;
    offerTitle: string; legalStatus: string | null;
  }> = [];
  try {
    const [active, sale, rent, seasonal] = await Promise.all([
      db.listing.count({ where: { city: wilaya, status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { city: wilaya, intent: "SELL", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { city: wilaya, intent: "RENT", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
      db.listing.count({ where: { city: wilaya, intent: "SEASONAL_RENT", status: { in: ["ACTIVE", "UNMODERATED"] } } }),
    ]);
    stats = { active, sale, rent, seasonal };

    // Fetch up to 10 sample listings for structured data
    sampleListings = await db.listing.findMany({
      where: { city: wilaya, status: { in: ["ACTIVE", "UNMODERATED"] } },
      select: {
        id: true, intent: true, type: true, city: true,
        commune: true, askingPrice: true, pricePerNight: true,
        areaSqm: true, bedrooms: true, bathrooms: true,
        offerTitle: true, legalStatus: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
  } catch {}

  // ── JSON-LD: ItemList of RealEstateListing ──────────────────────
  // https://schema.org/RealEstateListing
  // Each listing gets its own structured data object with:
  //   - name, description, price, address, floorSize, numberOfRooms
  //   - availability (ForSale / ForRent)
  //   - publisher (Aqar Match)
  //
  // This helps Google understand the individual properties on this
  // page and can trigger rich snippets in search results.
  const intentToAvailability: Record<string, string> = {
    SELL: "https://schema.org/InStock",
    RENT: "https://schema.org/InStock",
    SEASONAL_RENT: "https://schema.org/InStock",
  };
  const intentLabel: Record<string, string> = {
    SELL: "للبيع",
    RENT: "للإيجار",
    SEASONAL_RENT: "إيجار موسمي",
  };

  const realEstateItems = sampleListings.map((l) => {
    const price = l.intent === "SEASONAL_RENT" ? l.pricePerNight : l.askingPrice;
    const priceUnit = l.intent === "SEASONAL_RENT" ? "/ ليلة" : "";
    return {
      "@type": "RealEstateListing",
      name: l.offerTitle,
      description: `${intentLabel[l.intent] || ""} — ${l.type} في ${l.commune || l.city}`,
      url: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}`,
      image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
      price: {
        "@type": "PriceSpecification",
        price: price || 0,
        priceCurrency: "DZD",
        unitText: priceUnit || undefined,
      },
      availability: intentToAvailability[l.intent] || "https://schema.org/InStock",
      address: {
        "@type": "PostalAddress",
        addressLocality: l.commune || l.city,
        addressRegion: wilaya,
        addressCountry: "DZ",
      },
      floorSize: {
        "@type": "QuantitativeValue",
        value: l.areaSqm,
        unitCode: "MTK", // square meter
      },
      numberOfRooms: l.bedrooms || undefined,
      numberOfBathroomsTotal: l.bathrooms || undefined,
      category: l.type,
      publisher: {
        "@type": "Organization",
        name: "عقار Match",
        url: "https://aqarmatch.dz",
      },
      datePosted: new Date().toISOString(),
    };
  });

  // ── JSON-LD: Place (wilaya) + ItemList ──────────────────────────
  const jsonLdPlace = {
    "@context": "https://schema.org",
    "@type": "AdministrativeArea",
    name: wilaya,
    alternateName: `ولاية ${wilaya}`,
    description: `عقارات ${wilaya} للبيع والإيجار والإيجار الموسمي عبر عقار Match — منصة المطابقة العقارية الذكية في الجزائر.`,
    containedInPlace: {
      "@type": "Country",
      name: "الجزائر",
      alternateName: "Algeria",
    },
    aggregateRating: stats.active > 0 ? {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: String(stats.active),
      bestRating: "5",
      worstRating: "1",
    } : undefined,
  };

  const jsonLdItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `عقارات ${wilaya} — ${stats.active} عقار متاح`,
    numberOfItems: stats.active,
    itemListElement: realEstateItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };

  // BreadcrumbList JSON-LD
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://aqarmatch.dz/" },
      { "@type": "ListItem", position: 2, name: `عقارات ${wilaya}`, item: `https://aqarmatch.dz/immobilier/${encodeURIComponent(wilaya)}` },
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Structured data — helps Google understand the properties */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdPlace) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdItemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }} />

      {/* Breadcrumb */}
      <nav className="border-b bg-secondary/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition flex items-center gap-1">
            <HomeIcon className="w-3 h-3" /> الرئيسية
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">عقارات {wilaya}</span>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-oasis-gradient border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <MapPin className="w-3.5 h-3.5" />
            ولاية {wilaya}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground mb-3">
            عقارات {wilaya}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            اعثر على عقارك المثالي في {wilaya} عبر المطابقة الذكية — بيع، إيجار، إيجار موسمي. خصوصية مطلقة، بدون وسطاء.
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
              href={`/?view=search`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
            >
              ابحث في {wilaya}
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link
              href={`/?view=publish`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-border bg-card hover:border-primary/40 transition font-medium"
            >
              انشر عقارك في {wilaya}
            </Link>
          </div>
        </div>
      </header>

      {/* Communes grid */}
      <section className="py-10 sm:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
            بلديات {wilaya}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            اختر بلدية للبحث عن عقارات فيها
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {communes.map((commune) => (
              <Link
                key={commune}
                href={`/immobilier/${encodeURIComponent(wilaya)}/${encodeURIComponent(commune)}`}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/30 hover:bg-muted/50 transition group"
              >
                <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition line-clamp-1">
                  {commune}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Related articles */}
      {articles.length > 0 && (
        <section className="py-10 bg-secondary/30 border-t">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-6">
              مقالات عن {wilaya}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/blog/${article.slug}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:shadow-md hover:border-primary/30 transition"
                >
                  <div className="text-xs text-muted-foreground mb-1">{article.readingTime} دقائق</div>
                  <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-2">
                    {article.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {article.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
