import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import { BLOG_ARTICLES } from "@/lib/blog/blog-data";
import { WILAYAS } from "@/lib/schemas";

export const metadata: Metadata = {
  title: "مدوّنة عقار Match — أدلة ونصائح عقارية في الجزائر",
  description:
    "مقالات وأدلة شاملة لشراء وبيع وإيجار العقارات في الجزائر. أسعار العقارات، الإجراءات القانونية، الإيجار الموسمي، ونصائح لتجنب النصب العقاري.",
  keywords: [
    "مدونة عقارية الجزائر",
    "نصائح شراء عقار",
    "أسعار العقارات الجزائر",
    "الإيجار الموسمي الجزائر",
    "الإجراءات القانونية العقار",
    "تجنب النصب العقاري",
  ],
  openGraph: {
    title: "مدوّنة عقار Match — أدلة ونصائح عقارية في الجزائر",
    description: "مقالات وأدلة شاملة لشراء وبيع وإيجار العقارات في الجزائر.",
    type: "website",
  },
  alternates: {
    canonical: "https://aqarmatch.dz/blog",
  },
};

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-oasis-gradient border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-primary mb-3">
            مدوّنة عقار Match
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            أدلة ونصائح عقارية شاملة لكل ما تحتاج معرفته عن شراء وبيع وإيجار العقارات في الجزائر
          </p>
        </div>
      </header>

      {/* Articles list */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="space-y-6">
          {BLOG_ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="block group"
            >
              <article className="rounded-2xl border border-border bg-card p-5 sm:p-6 hover:shadow-lg hover:border-primary/30 transition-all">
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  {article.wilaya && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                      {article.wilaya}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(article.publishedAt).toLocaleDateString("ar-DZ")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {article.readingTime} دقائق قراءة
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {article.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {article.description}
                </p>
                <div className="mt-3 flex items-center gap-1 text-sm text-primary font-medium">
                  اقرأ المقال
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-primary text-primary-foreground p-6 sm:p-8 text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">جاهز للبدء؟</h2>
          <p className="text-sm opacity-90 mb-5 max-w-md mx-auto">
            ابحث عن عقارك المثالي أو انشر عقارك الآن عبر منصة المطابقة الذكية
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-foreground text-primary font-bold hover:opacity-90 transition"
          >
            ابدأ المطابقة الذكية
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
