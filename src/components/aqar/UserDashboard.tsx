"use client";

// ──────────────────────────────────────────────────────────────────
//  UserDashboard — smart router that decides what to show:
//
//   1. Fetches lightweight counts from /api/buyer/stats + /api/seller/listings
//   2. Decides:
//      • hasListings && hasBuyerActivity  → tabbed Buyer/Seller dashboard
//      • hasListings only                  → SellerDashboard with "switch to buyer" button
//      • hasBuyerActivity only             → BuyerDashboard with "switch to seller" button
//      • neither                           → beautiful empty state with CTAs
//
//  "Buyer activity" = totalRequests > 0 OR matches.length > 0
//  This avoids loading the full BuyerDashboard data when the user has
//  no buyer activity at all.
// ──────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Building2, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { BuyerDashboard } from "./BuyerDashboard";
import { SellerDashboard } from "./SellerDashboard";
import { lazy, Suspense } from "react";

// SellerDashboard is heavy (1000+ lines) — lazy-load to keep the
// initial bundle small when the user only needs the buyer view.
const SellerDashboardLazy = lazy(() =>
  import("./SellerDashboard").then((m) => ({ default: m.SellerDashboard })),
);

interface Props {
  onSwitchToBuyer: () => void;
  onSwitchToSeller: () => void;
  onStartSearch: () => void;
  onStartPublish: () => void;
}

type Mode = "loading" | "empty" | "buyer" | "seller" | "both";

export function UserDashboard({
  onSwitchToBuyer,
  onSwitchToSeller,
  onStartSearch,
  onStartPublish,
}: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("loading");
  const [activeTab, setActiveTab] = useState<"buyer" | "seller">("buyer");

  useEffect(() => {
    (async () => {
      try {
        const [buyerStatsRes, sellerListingsRes] = await Promise.all([
          fetch("/api/buyer/stats", { cache: "no-store" }),
          fetch("/api/seller/listings", { cache: "no-store" }),
        ]);
        const buyerStats = buyerStatsRes.ok ? await buyerStatsRes.json() : { totalRequests: 0 };
        const sellerData = sellerListingsRes.ok ? await sellerListingsRes.json() : { hasListings: false };

        const hasBuyerActivity = (buyerStats.totalRequests ?? 0) > 0;
        const hasListings = !!sellerData.hasListings;

        if (hasListings && hasBuyerActivity) {
          setMode("both");
          // Default to the side with pending actions
          setActiveTab(buyerStats.pendingActions > 0 ? "buyer" : "seller");
        } else if (hasListings) {
          setMode("seller");
        } else if (hasBuyerActivity) {
          setMode("buyer");
        } else {
          setMode("empty");
        }
      } catch {
        // On error, show empty state with CTAs — user can retry by navigating
        setMode("empty");
      }
    })();
  }, []);

  // ── Loading ──
  if (mode === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t("buyer.dashboard.loading")}</p>
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (mode === "empty") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mb-6">
            <Image src="/logo.svg" alt="عقار Match" width={48} height={48} className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">
            {t("userDashboard.empty.title")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
            {t("userDashboard.empty.desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={onStartSearch} size="lg" className="gap-2">
              <Search className="w-4 h-4" />
              {t("userDashboard.empty.cta.search")}
            </Button>
            <Button onClick={onStartPublish} variant="outline" size="lg" className="gap-2">
              <Building2 className="w-4 h-4" />
              {t("userDashboard.empty.cta.publish")}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Both — tabbed ──
  if (mode === "both") {
    return (
      <div>
        {/* Tab switcher */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-secondary/60">
            <button
              onClick={() => setActiveTab("buyer")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "buyer"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Search className="w-4 h-4" />
              {t("userDashboard.tab.buyer")}
            </button>
            <button
              onClick={() => setActiveTab("seller")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "seller"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="w-4 h-4" />
              {t("userDashboard.tab.seller")}
            </button>
          </div>
        </div>

        {activeTab === "buyer" ? (
          <BuyerDashboard
            onSwitchToSeller={() => setActiveTab("seller")}
            onStartSearch={onStartSearch}
            onStartPublish={onStartPublish}
          />
        ) : (
          <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>}>
            <SellerDashboardLazy onSwitchToBuyer={() => setActiveTab("buyer")} onAddListing={onStartPublish} />
          </Suspense>
        )}
      </div>
    );
  }

  // ── Buyer only ──
  if (mode === "buyer") {
    return (
      <BuyerDashboard
        onSwitchToSeller={onSwitchToSeller}
        onStartSearch={onStartSearch}
        onStartPublish={onStartPublish}
      />
    );
  }

  // ── Seller only ──
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>}>
      <SellerDashboardLazy onSwitchToBuyer={onSwitchToBuyer} onAddListing={onStartPublish} />
    </Suspense>
  );
}
