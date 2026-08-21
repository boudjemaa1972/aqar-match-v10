import type { Metadata, Viewport } from "next";
import { Cairo, Amiri } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { I18nProvider } from "@/lib/i18n";

// Only load the weights we actually use (reduces font payload).
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
  weight: ["400", "600", "700", "800"],
  preload: true,
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  display: "swap",
  weight: ["400", "700"],
  preload: false,
});

const SITE_URL = "https://aqarmatch.dz";
const SITE_NAME = "عقار Match";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "عقار Match — منصة المطابقة العقارية الذكية في الجزائر",
    template: "%s | عقار Match",
  },
  description:
    "أول منصة عقارية في الجزائر تعتمد نظام المطابقة الذكية. لا تصفح، لا بحث — فقط تطابق خوارزمي يربطك بالعقار المناسب مع خصوصية مطلقة وتشفير كامل للبيانات.",
  keywords: [
    "عقارات الجزائر",
    "Aqar Match",
    "مطابقة عقارية ذكية",
    "شراء عقار الجزائر",
    "إيجار الجزائر",
    "إيجار موسمي",
    "منصة عقارية",
    "عقار Match",
    "الجزائر العاصمة",
    "البليدة",
    "المدية",
    "خصوصية",
    "تشفير",
    "real estate Algeria",
    "blind matching",
  ],
  authors: [{ name: "Aqar Match", url: SITE_URL }],
  creator: "Aqar Match",
  publisher: "Aqar Match",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      "ar-DZ": SITE_URL,
      "fr-DZ": `${SITE_URL}/?lang=fr`,
    },
  },
  openGraph: {
    title: "عقار Match — منصة المطابقة العقارية الذكية في الجزائر",
    description:
      "لا تصفح، لا بحث، فقط تطابق ذكي — أول منصة عقارية في الجزائر تحمي بياناتك وتطابقك خوارزمياً.",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "ar_DZ",
    alternateLocale: ["fr_DZ"],
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "عقار Match — المنصة الذكية للعقارات في الجزائر",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "عقار Match — منصة المطابقة العقارية الذكية في الجزائر",
    description:
      "لا تصفح، لا بحث، فقط تطابق ذكي — أول منصة عقارية في الجزائر تحمي بياناتك وتطابقك خوارزمياً.",
    images: ["/og-image.png"],
  },
  category: "real estate",
  other: {
    "theme-color": "#8b3a2a",
    "msapplication-TileColor": "#8b3a2a",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#8b3a2a" },
    { media: "(prefers-color-scheme: dark)", color: "#1a0f0a" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "عقار Match",
  alternateName: "Aqar Match",
  url: SITE_URL,
  description:
    "أول منصة عقارية في الجزائر تعتمد نظام المطابقة الذكية — لا تصفح، لا بحث، فقط تطابق ذكي.",
  inLanguage: ["ar", "fr"],
  areaServed: {
    "@type": "Country",
    name: "الجزائر",
  },
  potentialAction: [
    {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/?view=search`,
      },
      "query-input": "required name=search_query_string",
    },
  ],
  publisher: {
    "@type": "Organization",
    name: "عقار Match",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    description:
      "منصة عقارية رقمية تعتمد نموذج التوفيق الذكي العميق — لا تصفح عشوائي، لا إعلانات، لا كشف بيانات قبل التوافق.",
    areaServed: "DZ",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"
          as="style"
        />
      </head>
      <body
        className={`${cairo.variable} ${amiri.variable} font-cairo antialiased bg-background text-foreground`}
      >
        <I18nProvider>{children}</I18nProvider>
        <Toaster />
      </body>
    </html>
  );
}
