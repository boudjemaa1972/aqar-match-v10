"use client";

// ──────────────────────────────────────────────────────────────────
//  HomePage — redesigned per spec:
//   1. Hero: brand title (Cairo) + tagline + question + pitch + 2 stacked CTAs
//   2. Pain points: 3 icons (lock, zap, no-entry) with titles + descriptions
//   3. How it works: 4 numbered steps with icons
//   4. Stats: 3 numbers (active, for sale, for rent)
//   5. Reviews: title + placeholder if none
//   6. Footer text
// ──────────────────────────────────────────────────────────────────

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Lock,
  Zap,
  Ban,
  Home,
  Search,
  LockKeyhole,
  CheckCircle2,
  Star,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  MapPin,
  Building2,
  FileSpreadsheet,
  BarChart3,
  Briefcase,
  Upload,
  Database,
  Cpu,
  Layers,
  ArrowDownToLine,
  Sparkles,
  TrendingUp,
  Users,
  LineChart,
  Download,
  Settings,
  Globe,
  Bell,
  MessageSquare,
  Clock,
  Target,
  Award,
  UserPlus,
  Sliders,
  GitMerge,
  Handshake,
  FileCheck,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PromoBanner } from "./PromoBanner";
import { FeeCalculator } from "./FeeCalculator";

interface Props {
  onStartSeller: () => void;
  onStartBuyer: () => void;
  onNavigate?: (view: "home" | "publish" | "search" | "account" | "dashboard") => void;
}

export function HomePage({ onStartSeller, onStartBuyer, onNavigate }: Props) {
  const { t, lang, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  // Fetch live stats for trust bar + mobile badges
  const [stats, setStats] = useState({ active: 0, sale: 0, rent: 0, seasonal: 0 });
  const [activeCount, setActiveCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const json = await res.json();
          setStats({
            active: json.active || 0,
            sale: json.sale || 0,
            rent: json.rent || 0,
            seasonal: json.seasonal || 0,
          });
          setActiveCount(json.active || 0);
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="flex flex-col">
      {/* ── Promotional banner (shows only if there's an active offer) ── */}
      <PromoBanner />

      {/* ═══════════ Hero — Luxury Editorial ═══════════ */}
      <section className="relative overflow-hidden bg-editorial-hero noise-overlay">
        {/* Decorative geometric accents — desktop only */}
        <div className="hidden lg:block absolute top-12 left-8 w-32 h-32 border-2 border-primary/10 rotate-45 pointer-events-none" />
        <div className="hidden lg:block absolute bottom-16 right-12 w-20 h-20 border border-gold/15 rotate-12 pointer-events-none" />
        <div className="hidden lg:block absolute top-1/3 right-1/4 w-48 h-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        {/* Diagonal gold accent line */}
        <div className="hidden lg:block absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-gold/20 to-transparent transform rotate-12 origin-top pointer-events-none" />

        {/* ── MOBILE: Full-screen hero with background image ── */}
        <div className="lg:hidden relative min-h-[calc(100dvh-3.5rem-3.5rem)] flex flex-col">
          {/* Background image */}
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=75"
              alt="عقار في الجزائر"
              fill
              sizes="100vw"
              className="object-cover object-center"
              priority
            />
            {/* Dark gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />
          </div>

          {/* Content over image */}
          <div className="relative flex-1 flex flex-col justify-end px-5 pb-6 pt-16">
            {/* Smart badge — pill shape with gear icon */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-white text-xs font-medium mb-4 border border-white/15"
            >
              <Settings className="w-3 h-3" />
              {t("home.hero.badge")}
            </motion.div>

            {/* Main heading — two lines with dual-color on second line */}
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-cairo text-4xl sm:text-5xl font-black text-white mb-4 leading-[1.1] tracking-tight"
            >
              {t("home.hero.headline1")}
              <br />
              <span className="text-white">{t("home.hero.headline2a")}</span>
              <span className="text-gold">{t("home.hero.headline2b")}</span>
            </motion.h1>

            {/* Subheadline line 1 — heavier weight */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base sm:text-lg font-bold text-white mb-1"
            >
              {t("home.hero.subheadline1")}
            </motion.p>

            {/* Subheadline line 2 — lighter weight, muted */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-sm sm:text-base text-white/60 leading-relaxed mb-5"
            >
              {t("home.hero.subheadline2")}
            </motion.p>

            {/* Stacked CTAs — full width */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col gap-3 mb-4"
            >
              <button
                onClick={onStartSeller}
                className="group flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground px-5 py-3.5 shadow-lg shadow-primary/30 min-h-[52px] font-bold text-base"
              >
                <Building2 className="w-5 h-5" />
                {t("home.cta.seller")}
              </button>
              <button
                onClick={onStartBuyer}
                className="group flex items-center justify-center gap-2 rounded-2xl bg-white/10 backdrop-blur border border-white/30 text-white px-5 py-3.5 min-h-[52px] font-bold text-base"
              >
                <Search className="w-5 h-5" />
                {t("home.cta.buyer")}
              </button>
            </motion.div>

            {/* Stats badges — fixed horizontal distribution */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="grid grid-cols-4 gap-1.5"
            >
              <StatBadge
                label="عقار نشط"
                value={stats.active}
                bgClass="bg-primary/90"
                textClass="text-white"
              />
              <StatBadge
                label="للبيع"
                value={stats.sale}
                bgClass="bg-gold/90 text-foreground"
                textClass="text-white"
              />
              <StatBadge
                label="للإيجار"
                value={stats.rent}
                bgClass="bg-primary/60"
                textClass="text-white"
              />
              <StatBadge
                label="موسمي"
                value={stats.seasonal}
                bgClass="bg-accent/90 text-foreground"
                textClass="text-white"
              />
            </motion.div>
          </div>
        </div>

        {/* ── DESKTOP: Dual column layout ── */}
        <div className="hidden lg:block relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 lg:pt-20 pb-10 sm:pb-14 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

            {/* ── Column 1: Text + CTAs + Trust Bar ── */}
            <div className={dir === "rtl" ? "lg:order-2" : "lg:order-1"}>
              {/* Smart badge — pill shape with gear icon */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 border border-primary/20"
              >
                <Settings className="w-3 h-3" />
                {t("home.hero.badge")}
              </motion.div>

              {/* Main heading — two lines with dual-color on second line */}
              <motion.h1
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="font-cairo text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-foreground mb-5 leading-[1.05] tracking-tight"
              >
                {t("home.hero.headline1")}
                <br />
                <span className="text-primary">{t("home.hero.headline2a")}</span>
                <span className="text-gold">{t("home.hero.headline2b")}</span>
              </motion.h1>

              {/* Subheadline line 1 — heavier weight */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground mb-2"
              >
                {t("home.hero.subheadline1")}
              </motion.p>

              {/* Subheadline line 2 — lighter weight, muted */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-sm sm:text-base lg:text-lg text-muted-foreground leading-relaxed mb-6 sm:mb-8 max-w-xl"
              >
                {t("home.hero.subheadline2")}
              </motion.p>

              {/* Dual CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-3 mb-6"
              >
                {/* Primary: Seller */}
                <button
                  onClick={onStartSeller}
                  className="group flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground px-6 py-4 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all min-h-[56px] flex-1 sm:flex-none sm:min-w-[200px]"
                >
                  <Building2 className="w-5 h-5" />
                  <span className="font-bold text-base sm:text-lg">{t("home.cta.seller")}</span>
                  <Arrow className="w-4 h-4 opacity-70 group-hover:-translate-x-1 transition-transform" />
                </button>

                {/* Secondary: Buyer */}
                <button
                  onClick={onStartBuyer}
                  className="group flex items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card hover:border-primary/40 hover:bg-muted/50 px-6 py-4 transition-all hover:-translate-y-0.5 min-h-[56px] flex-1 sm:flex-none sm:min-w-[200px]"
                >
                  <Search className="w-5 h-5 text-primary" />
                  <span className="font-bold text-base sm:text-lg text-foreground">{t("home.cta.buyer")}</span>
                  <Arrow className="w-4 h-4 text-muted-foreground group-hover:-translate-x-1 transition-transform" />
                </button>
              </motion.div>

              {/* Trust Bar */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-muted-foreground"
              >
                <TrustItem icon={Lock} text={t("hero.trust.encrypted")} />
                <Divider />
                <TrustItem icon={Zap} text={t("hero.trust.instant")} />
                <Divider />
                <TrustItem icon={CreditCard} text={t("hero.trust.noCommission")} />
                <Divider />
                {activeCount !== null ? (
                  <TrustItem
                    icon={Building2}
                    text={t("hero.trust.activeListings", { n: activeCount })}
                  />
                ) : (
                  <TrustItem icon={MapPin} text={t("hero.trust.algeria")} />
                )}
              </motion.div>
            </div>

            {/* ── Column 2: Property Image ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={dir === "rtl" ? "lg:order-1" : "lg:order-2"}
            >
              <div className="relative rounded-2xl lg:rounded-3xl overflow-hidden shadow-2xl shadow-primary/10">
                {/* Property image — next/image for automatic optimization */}
                <Image
                  src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"
                  alt="عقار في الجزائر — منصة عقار Match"
                  width={1200}
                  height={800}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 600px"
                  className="w-full h-[280px] sm:h-[400px] lg:h-[500px] object-cover"
                  priority
                  placeholder="empty"
                />

                {/* Gradient overlay for badge readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Floating badge: "مطابقة فورية" */}
                <div className="absolute top-4 right-4 ltr:left-4 ltr:right-auto">
                  <div className="flex items-center gap-1.5 rounded-xl bg-primary/90 backdrop-blur px-3 py-2 shadow-lg">
                    <Zap className="w-4 h-4 text-primary-foreground" />
                    <span className="text-xs sm:text-sm font-bold text-primary-foreground">
                      {t("home.hero.badge")}
                    </span>
                  </div>
                </div>

                {/* Bottom badge: score example */}
                <div className="absolute bottom-4 right-4 ltr:left-4 ltr:right-auto">
                  <div className="flex items-center gap-2 rounded-xl bg-black/50 backdrop-blur px-3 py-2 shadow-lg">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">94%</span>
                    </div>
                    <div className="text-white">
                      <div className="text-xs font-semibold">{t("match.strongMatch")}</div>
                      <div className="text-[10px] opacity-80">{t("nav.brand")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ═══════════ عقار Match للقطاع المهني ═══════════ */}
      <ProSection onStartSeller={onStartSeller} onNavigate={onNavigate} />

      {/* ───────── Pain points — Editorial Style ───────── */}
      <section className="relative py-16 sm:py-20 lg:py-28 bg-background bg-zellige">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
          >              <PainPoint
              icon={Lock}
              title={t("pain.privacy.title")}
              desc={t("pain.privacy.desc")}
              color="bg-primary/10 text-primary"
              num="01"
              delay={0}
            />
            <PainPoint
              icon={Zap}
              title={t("pain.instant.title")}
              desc={t("pain.instant.desc")}
              color="bg-accent/15 text-accent-foreground"
              num="02"
              delay={0.1}
            />
            <PainPoint
              icon={Ban}
              title={t("pain.zero.title")}
              desc={t("pain.zero.desc")}
              color="bg-primary/8 text-primary"
              num="03"
              delay={0.2}
            />
          </motion.div>
        </div>
      </section>

      {/* ───────── How it works — Editorial ───────── */}
      <section className="relative py-16 sm:py-20 lg:py-28 bg-secondary/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 sm:mb-12"
          >
            <h2 className="deco-line inline-block text-xl sm:text-2xl lg:text-3xl font-black text-foreground mb-3 tracking-tight">
              {t("how.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">{t("how.subtitle")}</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            <StepCard
              num="01"
              icon={Home}
              title={t("how.step1.title")}
              desc={t("how.step1.desc")}
              delay={0}
            />
            <StepCard
              num="02"
              icon={Search}
              title={t("how.step2.title")}
              desc={t("how.step2.desc")}
              delay={0.1}
            />
            <StepCard
              num="03"
              icon={LockKeyhole}
              title={t("how.step3.title")}
              desc={t("how.step3.desc")}
              delay={0.2}
            />
            <StepCard
              num="04"
              icon={CheckCircle2}
              title={t("how.step4.title")}
              desc={t("how.step4.desc")}
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ═══════════ الميزات الأساسية ═══════════ */}
      <FeaturesSection />

      {/* ═══════════ فوائد المستخدمين ═══════════ */}
      <BenefitsSection />

      {/* ═══════════ الخطوات العملية ═══════════ */}
      <BusinessStepsSection />

      {/* ═══════════ المكونات الرئيسية ═══════════ */}
      <ComponentsSection />

      {/* ───────── Fee Calculator ───────── */}
      <FeeCalculator />

      {/* ───────── Stats ───────── */}
      <StatsSection />

      {/* ───────── Reviews ───────── */}
      <ReviewsSection />

      {/* ───────── Footer — Editorial ───────── */}
      <footer className="relative mt-auto border-t bg-card bg-zellige">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Internal links for SEO */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6 text-sm">
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">{t("footer.wilayas")}</h4>
              <ul className="space-y-1">
                <li><a href="/immobilier/الجزائر" className="text-muted-foreground hover:text-primary transition">{t("footer.alger")}</a></li>
                <li><a href="/immobilier/البليدة" className="text-muted-foreground hover:text-primary transition">{t("footer.blida")}</a></li>
                <li><a href="/immobilier/المدية" className="text-muted-foreground hover:text-primary transition">{t("footer.medea")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">{t("footer.blog")}</h4>
              <ul className="space-y-1">
                <li><a href="/blog/ايجار-موسمي-الجزائر" className="text-muted-foreground hover:text-primary transition">{t("footer.seasonalRent")}</a></li>
                <li><a href="/blog/شراء-شقة-في-الجزائر-دليل-كامل" className="text-muted-foreground hover:text-primary transition">{t("footer.buyApartment")}</a></li>
                <li><a href="/blog/اسعار-العقارات-في-الجزائر-2026" className="text-muted-foreground hover:text-primary transition">{t("footer.propertyPrices")}</a></li>
                <li><a href="/blog" className="text-muted-foreground hover:text-primary transition">{t("footer.allArticles")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">{t("footer.platform")}</h4>
              <ul className="space-y-1">
                <li><a href="/?view=search" className="text-muted-foreground hover:text-primary transition">{t("footer.searchProperty")}</a></li>
                <li><a href="/?view=publish" className="text-muted-foreground hover:text-primary transition">{t("footer.publishProperty")}</a></li>
                <li><a href="/?view=dashboard" className="text-muted-foreground hover:text-primary transition">{t("footer.dashboard")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">{t("footer.featuredCommunes")}</h4>
              <ul className="space-y-1">
                <li><a href="/immobilier/الجزائر/حيدرة" className="text-muted-foreground hover:text-primary transition">{t("footer.hydra")}</a></li>
                <li><a href="/immobilier/الجزائر/المرادية" className="text-muted-foreground hover:text-primary transition">{t("footer.mouradia")}</a></li>
                <li><a href="/immobilier/البليدة/الشفة" className="text-muted-foreground hover:text-primary transition">{t("footer.cheraga")}</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-4 border-t text-center">
            <p className="text-xs sm:text-sm text-muted-foreground">{t("footer.text")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
//  ProSection — "عقار Match للقطاع المهني"
//  Targets: real estate agencies, brokers, investors.
//  Features: market reports, bulk Excel upload, professional dashboard.
// ══════════════════════════════════════════════════════════════════
function ProSection({
  onStartSeller,
  onNavigate,
}: {
  onStartSeller: () => void;
  onNavigate?: (view: "home" | "publish" | "search" | "account" | "dashboard") => void;
}) {
  const { t } = useI18n();
  const nav = (v: "home" | "publish" | "search" | "account" | "dashboard") => {
    if (onNavigate) onNavigate(v);
    else window.location.href = `/?view=${v}`;
  };

  const proFeatures = [
    {
      icon: BarChart3,
      title: t("pro.feature.reports"),
      desc: t("pro.feature.reportsDesc"),
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      icon: FileSpreadsheet,
      title: t("pro.feature.bulk"),
      desc: t("pro.feature.bulkDesc"),
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      icon: Database,
      title: t("pro.feature.api"),
      desc: t("pro.feature.apiDesc"),
      color: "bg-violet-500/10 text-violet-600",
    },
    {
      icon: Briefcase,
      title: t("pro.feature.manage"),
      desc: t("pro.feature.manageDesc"),
      color: "bg-amber-500/10 text-amber-600",
    },
  ];

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-b from-secondary/40 to-background border-y">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Title ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3">
            <Cpu className="w-4 h-4" />
            {t("pro.badge")}
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground mb-2">
            {t("pro.title")}
          </h2>
        </motion.div>

        {/* ── Sub-banner: Excel → API description ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="max-w-3xl mx-auto mb-8"
        >
          <div className="flex items-start sm:items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <p className="text-xs sm:text-sm text-foreground leading-relaxed">
              {t("pro.banner")}
            </p>
          </div>
        </motion.div>

        {/* ── Feature cards (2×2 grid on mobile, 4 cols on desktop) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {proFeatures.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className="rounded-2xl border border-border bg-card p-4 sm:p-5 hover:shadow-md transition-all"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${f.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-foreground text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* ── Action buttons — all active, no disabled ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          {/* Primary actions row */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* استخراج تقارير السوق */}
            <button
              type="button"
              onClick={() => nav("dashboard")}
              className="group flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3.5 font-bold text-sm hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all min-h-[52px] flex-1 sm:flex-none active:scale-95"
            >
              <BarChart3 className="w-5 h-5 transition-transform group-hover:scale-110" />
              {t("pro.btn.marketReports")}
            </button>

            {/* رفع جدول إكسل بالجملة */}
            <button
              type="button"
              onClick={() => nav("publish")}
              className="group flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3.5 font-bold text-sm hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/30 transition-all min-h-[52px] flex-1 sm:flex-none active:scale-95"
            >
              <Upload className="w-5 h-5 transition-transform group-hover:scale-110" />
              {t("pro.btn.bulkUpload")}
            </button>

            {/* إدارة العقارات المهنية */}
            <button
              type="button"
              onClick={() => nav("dashboard")}
              className="group flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white px-5 py-3.5 font-bold text-sm hover:bg-violet-700 hover:shadow-lg hover:shadow-violet-500/30 transition-all min-h-[52px] flex-1 sm:flex-none active:scale-95"
            >
              <Briefcase className="w-5 h-5 transition-transform group-hover:scale-110" />
              {t("pro.btn.manage")}
            </button>
          </div>

          {/* Secondary actions row */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* المطابقة الذكية للعقارات */}
            <button
              type="button"
              onClick={() => nav("search")}
              className="group flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3.5 font-bold text-sm hover:opacity-90 hover:shadow-lg hover:shadow-primary/30 transition-all min-h-[52px] flex-1 sm:flex-none active:scale-95"
            >
              <Sparkles className="w-5 h-5 transition-transform group-hover:scale-110" />
              {t("pro.btn.smartMatch")}
            </button>

            {/* عرض التقارير والتحليلات */}
            <button
              type="button"
              onClick={() => nav("dashboard")}
              className="group flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white px-5 py-3.5 font-bold text-sm hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/30 transition-all min-h-[52px] flex-1 sm:flex-none active:scale-95"
            >
              <LineChart className="w-5 h-5 transition-transform group-hover:scale-110" />
              {t("pro.btn.analytics")}
            </button>
          </div>

          {/* Tertiary actions row — agencies/brokers/investors */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* تحميل قالب إكسل جاهز */}
            <button
              type="button"
              onClick={() => {
                // Generate a CSV template client-side and trigger download
                const headers = [
                  "نوع المعاملة", "نوع العقار", "الولاية", "البلدية", "الحي",
                  "السعر المطلوب", "الحد الأدنى السري", "المساحة (م²)",
                  "غرف النوم", "الحمامات", "الواجهات", "الوضعية القانونية",
                  "عقود التعمير", "عنوان العرض", "رقم الهاتف",
                ];
                const csv = "\uFEFF" + headers.join(",") + "\n";
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "aqarmatch-template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="group flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 px-5 py-3 font-bold text-sm hover:bg-emerald-500/10 transition-all min-h-[48px] flex-1 sm:flex-none active:scale-95"
            >
              <Download className="w-4 h-4 transition-transform group-hover:scale-110" />
              {t("pro.btn.downloadTemplate")}
            </button>

            {/* بوابة الوكالات العقارية */}
            <button
              type="button"
              onClick={() => nav("dashboard")}
              className="group flex items-center justify-center gap-2 rounded-xl border-2 border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-400 px-5 py-3 font-bold text-sm hover:bg-blue-500/10 transition-all min-h-[48px] flex-1 sm:flex-none active:scale-95"
            >
              <Users className="w-4 h-4 transition-transform group-hover:scale-110" />
              {t("pro.btn.agencyPortal")}
            </button>

            {/* إعدادات الحساب المهني */}
            <button
              type="button"
              onClick={() => nav("account")}
              className="group flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card text-foreground px-5 py-3 font-bold text-sm hover:border-primary/40 transition-all min-h-[48px] flex-1 sm:flex-none active:scale-95"
            >
              <Settings className="w-4 h-4 text-muted-foreground transition-transform group-hover:scale-110" />
              {t("pro.btn.accountSettings")}
            </button>
          </div>
        </motion.div>

        {/* ── Technical infrastructure badges ── */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-8 pt-6 border-t flex flex-wrap items-center justify-center gap-2"
        >
          {[
            { icon: Layers, label: "REST API" },
            { icon: Database, label: "PostgreSQL" },
            { icon: Cpu, label: "AI Matching Engine" },
            { icon: ShieldCheck, label: "AES-256 Encryption" },
            { icon: FileSpreadsheet, label: "Excel → API Pipeline" },
          ].map((b, i) => {
            const Icon = b.icon;
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary text-xs font-medium text-muted-foreground"
              >
                <Icon className="w-3.5 h-3.5" />
                {b.label}
              </span>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  ReviewsSection — fetches APPROVED reviews from /api/reviews
//  Shows skeleton while loading, fallback if empty, cards if data.
// ══════════════════════════════════════════════════════════════════
function ReviewsSection() {
  const { t } = useI18n();
  const [reviews, setReviews] = useState<
    Array<{ id: string; rating: number; comment: string; role: string; displayName: string; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/reviews");
        if (res.ok) {
          const json = await res.json();
          setReviews(json.reviews || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-gold fill-gold" />
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              {t("reviews.title")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("reviews.subtitle")}</p>
        </motion.div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border p-5 space-y-3 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-secondary" />
                  <div className="h-3 bg-secondary rounded w-20" />
                </div>
                <div className="h-3 bg-secondary rounded w-full" />
                <div className="h-3 bg-secondary rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Empty fallback */}
        {!loading && reviews.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>{t("reviews.empty")}</p>
          </div>
        )}

        {/* Reviews grid */}
        {!loading && reviews.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-border bg-card p-5 flex flex-col"
              >
                {/* Stars + role */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/30"}`}
                      />
                    ))}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                    r.role === "BUYER"
                      ? "bg-blue-500/10 text-blue-600"
                      : "bg-emerald-500/10 text-emerald-600"
                  }`}>
                    {r.role === "BUYER" ? t("reviews.roleBuyer") : t("reviews.roleSeller")}
                  </span>
                </div>
                {/* Comment */}
                <p className="text-sm text-foreground/90 leading-relaxed line-clamp-4 flex-1">
                  &ldquo;{r.comment}&rdquo;
                </p>
                {/* Author */}
                <div className="mt-3 pt-3 border-t flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">
                      {r.displayName.charAt(0)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{r.displayName}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Stat badge — rounded rectangle with colored background
// Used in the mobile hero stats row (4 badges, evenly distributed)
function StatBadge({
  label,
  value,
  bgClass,
  textClass,
}: {
  label: string;
  value: number;
  bgClass: string;
  textClass: string;
}) {
  return (
    <div className={`${bgClass} ${textClass} rounded-xl px-1.5 py-2 flex flex-col items-center justify-center text-center transition-transform hover:scale-105`}>
      <div className="text-base sm:text-lg font-extrabold tabular-nums leading-none">
        {value > 0 ? value.toLocaleString("en-US") : "—"}
      </div>
      <div className="text-[9px] sm:text-[10px] font-medium leading-tight mt-1 opacity-90">
        {label}
      </div>
    </div>
  );
}

// Trust bar item: icon + short text
function TrustItem({ icon: Icon, text }: { icon: typeof Lock; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}

// Vertical divider between trust items
function Divider() {
  return <div className="hidden sm:block w-px h-4 bg-border" />;
}

function PainPoint({
  icon: Icon,
  title,
  desc,
  color,
  num,
  delay,
}: {
  icon: typeof Lock;
  title: string;
  desc: string;
  color: string;
  num: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative group"
    >
      <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 sm:p-8 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-500">
        {/* Decorative number */}
        <span className="absolute top-4 left-4 font-cairo text-5xl font-black text-primary/[0.06] select-none pointer-events-none">
          {num}
        </span>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 ${color} group-hover:scale-110 transition-transform duration-500`}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="font-cairo font-bold text-foreground mb-2 text-lg tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

function StepCard({
  num,
  icon: Icon,
  title,
  desc,
  delay,
}: {
  num: string;
  icon: typeof Home;
  title: string;
  desc: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(4px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative group"
    >
      <div className="relative rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 pt-8 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-500">
        {/* Number — large decorative, editorial style */}
        <span className="absolute top-2 right-3 ltr:left-3 ltr:right-auto font-cairo text-4xl font-black text-primary/10 select-none">
          {num}
        </span>

        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-3 group-hover:bg-primary/15 transition-colors duration-500">
          <Icon className="w-5 h-5" />
        </div>

        <h3 className="font-cairo font-bold text-foreground mb-1.5 text-sm tracking-tight">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

// ── Stats — fetched live from /api/stats ──
// (useEffect + useState already imported at top of file)

function StatsSection() {
  const { t } = useI18n();
  const [stats, setStats] = useState({ active: 0, sale: 0, rent: 0, seasonal: 0 });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const json = await res.json();
          setStats({
            active: json.active || 0,
            sale: json.sale || 0,
            rent: json.rent || 0,
            seasonal: json.seasonal || 0,
          });
        }
      } catch {}
    })();
  }, []);

  return (
    <section className="relative py-16 sm:py-20 lg:py-28 bg-primary text-primary-foreground noise-overlay overflow-hidden">
      {/* Decorative diagonal line */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-1/4 -right-20 w-80 h-px bg-white/10 rotate-45" />
        <div className="absolute bottom-1/4 -left-20 w-60 h-px bg-white/10 -rotate-45" />
      </div>
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="deco-line inline-block font-cairo text-xl sm:text-2xl lg:text-3xl font-black mb-10 sm:mb-12 tracking-tight">{t("stats.title")}</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6">
          <StatBox value={stats.active} label={t("stats.active")} />
          <StatBox value={stats.sale} label={t("stats.sale")} />
          <StatBox value={stats.rent} label={t("stats.rent")} />
        </div>
      </div>
    </section>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl sm:rounded-2xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.06] p-4 sm:p-6 lg:p-8 hover:bg-white/[0.12] transition-colors duration-500"
    >
      <div className="text-3xl sm:text-5xl lg:text-6xl font-black mb-2 tabular-nums leading-none">
        {value.toLocaleString("en-US")}
      </div>
      <div className="text-[10px] sm:text-xs lg:text-sm opacity-70 leading-tight font-medium tracking-wide uppercase">{label}</div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FeaturesSection — الميزات الأساسية (from infographic)
// ══════════════════════════════════════════════════════════════════
function FeaturesSection() {
  const { t } = useI18n();
  const features = [
    { icon: Sparkles, title: t("features.smartMatch"), desc: t("features.smartMatch.desc"), color: "bg-primary/10 text-primary" },
    { icon: Lock, title: t("features.privacy"), desc: t("features.privacy.desc"), color: "bg-emerald-500/10 text-emerald-600" },
    { icon: Globe, title: t("features.geoSearch"), desc: t("features.geoSearch.desc"), color: "bg-blue-500/10 text-blue-600" },
    { icon: Bell, title: t("features.smartAlerts"), desc: t("features.smartAlerts.desc"), color: "bg-amber-500/10 text-amber-600" },
    { icon: MessageSquare, title: t("features.secureChat"), desc: t("features.secureChat.desc"), color: "bg-violet-500/10 text-violet-600" },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3">
            <Sparkles className="w-4 h-4" />
            {t("features.badge")}
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground mb-2">
            {t("features.title")}
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="rounded-2xl border border-border bg-card p-5 sm:p-6 hover:shadow-md transition-all group"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${f.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-foreground text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BenefitsSection — فوائد المستخدمين (from infographic)
// ══════════════════════════════════════════════════════════════════
function BenefitsSection() {
  const { t } = useI18n();
  const benefits = [
    { icon: Clock, title: t("benefits.saveTime"), desc: t("benefits.saveTime.desc"), color: "text-primary" },
    { icon: Zap, title: t("benefits.speed"), desc: t("benefits.speed.desc"), color: "text-amber-500" },
    { icon: Target, title: t("benefits.accuracy"), desc: t("benefits.accuracy.desc"), color: "text-emerald-500" },
    { icon: Award, title: t("benefits.exclusive"), desc: t("benefits.exclusive.desc"), color: "text-violet-500" },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-28 bg-secondary/20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 text-gold text-xs font-bold mb-3">
            <TrendingUp className="w-4 h-4" />
            {t("benefits.badge")}
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground mb-2">
            {t("benefits.title")}
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6 hover:shadow-md transition-all"
              >
                <div className="flex-shrink-0 mt-1">
                  <Icon className={`w-8 h-8 ${b.color}`} />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base mb-1">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BusinessStepsSection — الخطوات العملية (from infographic)
// ══════════════════════════════════════════════════════════════════
function BusinessStepsSection() {
  const { t } = useI18n();
  const steps = [
    { num: "1", icon: UserPlus, title: t("steps.step1"), desc: t("steps.step1.desc") },
    { num: "2", icon: Sliders, title: t("steps.step2"), desc: t("steps.step2.desc") },
    { num: "3", icon: GitMerge, title: t("steps.step3"), desc: t("steps.step3.desc") },
    { num: "4", icon: Handshake, title: t("steps.step4"), desc: t("steps.step4.desc") },
    { num: "5", icon: FileCheck, title: t("steps.step5"), desc: t("steps.step5.desc") },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-28 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3">
            <CheckCircle2 className="w-4 h-4" />
            {t("steps.badge")}
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground mb-2">
            {t("steps.title")}
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="relative rounded-2xl border border-border bg-card p-4 sm:p-5 text-center hover:shadow-md transition-all group"
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-md">
                  {s.num}
                </div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-3 group-hover:scale-110 transition-transform mt-2">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-foreground text-sm mb-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  ComponentsSection — المكونات الرئيسية (from infographic)
// ══════════════════════════════════════════════════════════════════
function ComponentsSection() {
  const { t } = useI18n();
  const components = [
    { icon: Users, title: t("components.users"), desc: t("components.users.desc"), color: "bg-blue-500/10 text-blue-600" },
    { icon: Layers, title: t("components.app"), desc: t("components.app.desc"), color: "bg-emerald-500/10 text-emerald-600" },
    { icon: Cpu, title: t("components.engine"), desc: t("components.engine.desc"), color: "bg-violet-500/10 text-violet-600" },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-28 bg-secondary/30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3">
            <Database className="w-4 h-4" />
            {t("components.badge")}
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground mb-2">
            {t("components.title")}
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {components.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="rounded-2xl border border-border bg-card p-6 sm:p-8 text-center hover:shadow-md transition-all group"
              >
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${c.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
