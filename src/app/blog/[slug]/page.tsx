import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Clock, ArrowLeft, ArrowRight, Home as HomeIcon } from "lucide-react";
import {
  BLOG_ARTICLES,
  getArticleBySlug,
  type BlogArticle,
} from "@/lib/blog/blog-data";
import { WILAYAS, COMMUNES_BY_WILAYA } from "@/lib/schemas";

// ── SSG: pre-generate all article pages ──────────────────────────
// NOTE: In dev mode, Next.js matches dynamic routes on-demand.
// For production builds, generateStaticParams pre-renders all pages.
export function generateStaticParams() {
  return BLOG_ARTICLES.map((a) => ({ slug: encodeURIComponent(a.slug) }));
}

// ── Dynamic metadata per article ─────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const article = getArticleBySlug(slug);

  if (!article) {
    return { title: "مقال غير موجود" };
  }

  return {
    title: article.title,
    description: article.description,
    keywords: article.keywords,
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: [article.author],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
    alternates: {
      canonical: `https://aqarmatch.dz/blog/${article.slug}`,
    },
    other: {
      "article:published_time": article.publishedAt,
      "article:modified_time": article.updatedAt,
      "article:author": article.author,
      ...(article.wilaya ? { "article:section": article.wilaya } : {}),
    },
  };
}

// ── JSON-LD for article ──────────────────────────────────────────
function ArticleJsonLd({ article }: { article: BlogArticle }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    keywords: article.keywords.join(", "),
    author: {
      "@type": "Organization",
      name: article.author,
    },
    publisher: {
      "@type": "Organization",
      name: "عقار Match",
      logo: {
        "@type": "ImageObject",
        url: "https://aqarmatch.dz/logo.svg",
      },
    },
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    url: `https://aqarmatch.dz/blog/${article.slug}`,
    inLanguage: "ar",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  // Related articles (same wilaya or same intent)
  const related = BLOG_ARTICLES.filter(
    (a) => a.slug !== article.slug && (a.wilaya === article.wilaya || a.intent === article.intent),
  ).slice(0, 3);

  return (
    <main className="min-h-screen bg-background">
      <ArticleJsonLd article={article} />

      {/* Breadcrumb */}
      <nav className="border-b bg-secondary/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition flex items-center gap-1">
            <HomeIcon className="w-3 h-3" />
            الرئيسية
          </Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-foreground transition">المدوّنة</Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate">{article.title}</span>
        </div>
      </nav>

      {/* Article header */}
      <header className="bg-oasis-gradient border-b">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          {article.wilaya && (
            <Link
              href={`/immobilier/${encodeURIComponent(article.wilaya)}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium mb-4 hover:bg-primary/20 transition"
            >
              {article.wilaya}
            </Link>
          )}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground leading-tight mb-4">
            {article.title}
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            {article.description}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(article.publishedAt).toLocaleDateString("ar-DZ", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {article.readingTime} دقائق قراءة
            </span>
            <span>{article.author}</span>
          </div>
        </div>
      </header>

      {/* Article body */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="prose prose-lg max-w-none">
          {article.sections.map((section, i) => (
            <section key={i} className="mb-8">
              <h2 className="text-xl font-bold text-foreground mb-3 mt-6">
                {section.heading}
              </h2>
              {section.paragraphs.map((p, j) => (
                <p key={j} className="text-base text-foreground/90 leading-relaxed mb-3">
                  {p}
                </p>
              ))}
              {section.list && (
                <ul className="space-y-2 my-4">
                  {section.list.map((item, k) => (
                    <li key={k} className="flex items-start gap-2 text-sm text-foreground/90">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 text-center">
          <h3 className="text-lg font-bold text-foreground mb-2">
            جرب المطابقة الذكية الآن
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            أدخل معاييرك ودع محركنا يجد لك العقار المناسب — بخصوصية مطلقة
          </p>
          <Link
            href="/?view=search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            ابحث عن عقار
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        {/* Related articles */}
        {related.length > 0 && (
          <div className="mt-12 pt-8 border-t">
            <h3 className="text-lg font-bold text-foreground mb-4">مقالات ذات صلة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/blog/${rel.slug}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition"
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {rel.wilaya || "عام"}
                  </div>
                  <div className="text-sm font-semibold text-foreground line-clamp-2">
                    {rel.title}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Back to blog */}
        <div className="mt-8 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowRight className="w-4 h-4" />
            العودة إلى المدوّنة
          </Link>
        </div>
      </article>
    </main>
  );
}
