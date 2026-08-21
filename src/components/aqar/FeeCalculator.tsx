"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Calculator, Info, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  calculateSellerFee,
  calculateBuyerFee,
  type PropertyIntent,
} from "@/lib/schemas";

export function FeeCalculator() {
  const { t } = useI18n();
  const [intent, setIntent] = useState<PropertyIntent>("SELL");
  const [price, setPrice] = useState("");
  const [pricePerNight, setPricePerNight] = useState("");
  const [nights, setNights] = useState("1");
  const isSeasonal = intent === "SEASONAL_RENT";

  const fees = useMemo(() => {
    const p = Number(price) || 0;
    const ppn = Number(pricePerNight) || 0;
    const n = Math.max(1, Number(nights) || 1);
    if (isSeasonal) {
      const total = ppn * n;
      if (total <= 0) return null;
      return { sellerFee: calculateSellerFee(total, "SEASONAL_RENT"), buyerFee: calculateBuyerFee(total, "SEASONAL_RENT"), base: total };
    }
    if (p <= 0) return null;
    return { sellerFee: calculateSellerFee(p, intent), buyerFee: calculateBuyerFee(p, intent), base: p };
  }, [price, pricePerNight, nights, intent, isSeasonal]);

  const sellerLabel = intent === "SELL" ? t("feeCalc.seller") : t("feeCalc.landlord");
  const buyerLabel = intent === "SELL" ? t("feeCalc.buyer") : t("feeCalc.tenant");
  const sellerMinDzd = intent === "SELL" ? "15,000" : "7,500";
  const buyerMinDzd = intent === "SELL" ? "10,000" : "5,000";

  return (
    <section id="fee-calculator" className="py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-3">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">{t("feeCalc.title")}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("feeCalc.subtitle")}</p>
        </div>
        <Card className="p-5 sm:p-6">
          <div className="mb-5">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">{t("feeCalc.transactionType")}</label>
            <div className="grid grid-cols-3 gap-2">
              {(["SELL", "RENT", "SEASONAL_RENT"] as const).map((v) => (
                <button key={v} onClick={() => setIntent(v)} className={"px-3 py-2.5 rounded-lg text-sm font-medium transition " + (intent === v ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                  {v === "SELL" ? t("feeCalc.sell") : v === "RENT" ? t("feeCalc.rent") : t("feeCalc.seasonal")}
                </button>
              ))}
            </div>
          </div>
          {isSeasonal ? (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("feeCalc.pricePerNight")}</label><input type="number" inputMode="numeric" value={pricePerNight} onChange={(e) => setPricePerNight(e.target.value)} placeholder="5,000" className="w-full h-11 px-3 rounded-lg border bg-background text-foreground text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("feeCalc.nights")}</label><input type="number" inputMode="numeric" min={1} max={90} value={nights} onChange={(e) => setNights(e.target.value)} className="w-full h-11 px-3 rounded-lg border bg-background text-foreground text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40" /></div>
            </div>
          ) : (
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{intent === "SELL" ? t("feeCalc.askingPrice") : t("feeCalc.monthlyRent")}</label>
              <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={intent === "SELL" ? "9,500,000" : "50,000"} className="w-full h-11 px-3 rounded-lg border bg-background text-foreground text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
          )}
          {fees ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground text-center mb-1">{t("feeCalc.totalValue")}: <span className="font-semibold text-foreground tabular-nums">{fees.base.toLocaleString("en-US")} {t("common.currency")}{isSeasonal ? " x " + Math.max(1, Number(nights) || 1) : ""}</span></div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><span className="text-sm font-bold text-primary">A</span></div><div><div className="text-sm font-medium text-foreground">{sellerLabel}</div><div className="text-[11px] text-muted-foreground">0.75% {t("feeCalc.ofPrice")} | {t("feeCalc.min")} {sellerMinDzd} {t("common.currency")}</div></div></div><div className="text-lg font-bold text-primary tabular-nums">{fees.sellerFee.toLocaleString("en-US")} {t("common.currency")}</div></div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-accent/5 border border-accent/10"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center"><span className="text-sm font-bold text-accent-foreground">B</span></div><div><div className="text-sm font-medium text-foreground">{buyerLabel}</div><div className="text-[11px] text-muted-foreground">{t("feeCalc.halfOf")} {sellerLabel} | {t("feeCalc.min")} {buyerMinDzd} {t("common.currency")}</div></div></div><div className="text-lg font-bold text-accent-foreground tabular-nums">{fees.buyerFee.toLocaleString("en-US")} {t("common.currency")}</div></div>
              <div className="flex items-start gap-2 mt-3 pt-3 border-t text-[11px] text-muted-foreground"><ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" /><span>{t("feeCalc.legalNote")}</span></div>
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground"><Info className="w-5 h-5 mx-auto mb-2 opacity-40" />{t("feeCalc.enterPrice")}</div>
          )}
        </Card>
      </div>
    </section>
  );
}