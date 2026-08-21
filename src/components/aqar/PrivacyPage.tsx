"use client";

// ──────────────────────────────────────────────────────────────────
//  PrivacyPage — plain-language explanation of the encryption +
//  blind-matching model for non-technical users.
//
//  Goal: turn "AES-256-GCM" (a technical feature) into a marketing
//  trust argument that any seller/buyer can understand.
// ──────────────────────────────────────────────────────────────────

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Lock,
  EyeOff,
  ShieldCheck,
  KeyRound,
  Phone,
  Wallet,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function PrivacyPage() {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowRight : ArrowRight;

  return (
    <main className="min-h-screen bg-background">
      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-primary/10 to-background py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mb-6"
          >
            <ShieldCheck className="w-12 h-12 text-primary" />
          </motion.div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground mb-4">
            {t("privacy.title")}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            {t("privacy.subtitle")}
          </p>
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section className="py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pillar 1: Blind price matching */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-border bg-card p-6 hover:shadow-md transition"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 mb-4">
                <EyeOff className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold mb-2">{t("privacy.pillar1.title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("privacy.pillar1.desc")}
              </p>
            </motion.div>

            {/* Pillar 2: AES-256-GCM encryption */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-border bg-card p-6 hover:shadow-md transition"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold mb-2">{t("privacy.pillar2.title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("privacy.pillar2.desc")}
              </p>
            </motion.div>

            {/* Pillar 3: Contact reveal only after both pay */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-border bg-card p-6 hover:shadow-md transition"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 mb-4">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold mb-2">{t("privacy.pillar3.title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("privacy.pillar3.desc")}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Step-by-step: what happens to your data ── */}
      <section className="py-12 sm:py-16 bg-secondary/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            {t("privacy.steps.title")}
          </h2>
          <div className="space-y-6">
            {[
              { icon: Wallet, title: t("privacy.step1.title"), desc: t("privacy.step1.desc") },
              { icon: Lock, title: t("privacy.step2.title"), desc: t("privacy.step2.desc") },
              { icon: EyeOff, title: t("privacy.step3.title"), desc: t("privacy.step3.desc") },
              { icon: Phone, title: t("privacy.step4.title"), desc: t("privacy.step4.desc") },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-4 items-start"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary" />
                      <h3 className="font-bold text-foreground">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Tech details (collapsible-looking but always shown) ── */}
      <section className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">
            {t("privacy.tech.title")}
          </h2>
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            {[
              t("privacy.tech.point1"),
              t("privacy.tech.point2"),
              t("privacy.tech.point3"),
              t("privacy.tech.point4"),
            ].map((point, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-12 sm:py-16 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t("privacy.cta.title")}</h2>
          <p className="text-sm sm:text-base opacity-90 mb-8">{t("privacy.cta.desc")}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-background text-primary px-6 py-3 font-bold text-sm hover:bg-background/90 transition"
          >
            {t("privacy.cta.btn")}
            <Arrow className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
