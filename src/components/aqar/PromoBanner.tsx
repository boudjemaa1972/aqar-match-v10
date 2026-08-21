"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface PromoOffer {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  remaining: number | null;
  daysRemaining: number;
}

export function PromoBanner() {
  const { t } = useI18n();
  const [offer, setOffer] = useState<PromoOffer | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/offers/active?category=INDIVIDUAL", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.offer) setOffer(json.offer);
        }
      } catch {}
    })();
  }, []);

  if (!offer || dismissed) return null;

  const discountPct = offer.discountType === "PERCENTAGE" ? offer.discountValue : 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 relative z-30"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="w-4 h-4 flex-shrink-0 fill-white" />
            <span className="font-bold">{t("promo.banner.title")}</span>
            <span className="hidden sm:inline opacity-90">
              {t("promo.banner.desc", { discount: discountPct })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {offer.daysRemaining > 0 && (
              <span className="text-xs flex items-center gap-1 opacity-90">
                <Clock className="w-3 h-3" />
                {t("promo.banner.daysLeft", { days: offer.daysRemaining })}
              </span>
            )}
            {offer.remaining !== null && offer.remaining <= 10 && (
              <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">
                {t("promo.banner.remaining", { remaining: offer.remaining })}
              </span>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="p-1 hover:bg-white/20 rounded transition flex-shrink-0"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
