"use client";

// ──────────────────────────────────────────────────────────────────
//  DealCompletedCard — elegant closing message shown to both parties
//  when a match reaches BUYER_FEE_PAID + sellerConfirmContact.
//
//  Three-part structure:
//   1. Congratulatory opening (warm, not flashy)
//   2. Review invitation (practical, connects to ReviewForm)
//   3. Closing note (platform's role ends, door stays open)
//
//  Shows prominently once, then collapses to a subtle reminder.
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Star, ArrowRight, X, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { ReviewForm } from "./ReviewForm";

interface Props {
  matchId: string;
  role: "BUYER" | "SELLER";
}

export function DealCompletedCard({ matchId, role }: Props) {
  const { t, dir } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const storageKey = `deal_completed_seen_${matchId}`;

  // Check if user already dismissed this card for this match
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(storageKey)) {
      setDismissed(true);
    }
  }, [storageKey]);

  function handleDismiss() {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(storageKey, "1");
    }
  }

  const Arrow = dir === "rtl" ? ArrowRight : ArrowRight;

  // ── Dismissed state: subtle reminder ──
  if (dismissed && !showReview) {
    return (
      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{t("deal.completed.seen")}</span>
        </div>
        <button
          onClick={() => setShowReview(true)}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <Star className="w-3 h-3" />
          {t("deal.completed.reviewBtn")}
        </button>
      </div>
    );
  }

  // ── Review form open ──
  if (showReview) {
    return (
      <div className="space-y-3">
        <ReviewForm
          matchId={matchId}
          role={role}
          onSubmitted={() => {
            setShowReview(false);
            handleDismiss();
          }}
        />
        <button
          onClick={() => setShowReview(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("deal.completed.laterBtn")}
        </button>
      </div>
    );
  }

  // ── Main card: prominent celebration + review invitation ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-background">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500" />

        <div className="p-4 sm:p-5 space-y-4">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="float-end text-muted-foreground hover:text-foreground transition p-1 -m-1"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Part 1: Congratulatory opening */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1 pt-0.5">
              <h3 className="text-base sm:text-lg font-bold text-foreground leading-snug">
                {t("deal.completed.title")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {t("deal.completed.desc")}
              </p>
            </div>
          </div>

          {/* Part 2: Review invitation */}
          <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 sm:p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("deal.completed.reviewTitle")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t("deal.completed.reviewDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setShowReview(true)}
                className="bg-amber-600 hover:bg-amber-700 gap-1.5"
              >
                <Star className="w-3.5 h-3.5" />
                {t("deal.completed.reviewBtn")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-muted-foreground"
              >
                {t("deal.completed.laterBtn")}
              </Button>
            </div>
          </div>

          {/* Part 3: Closing note */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              {t("deal.completed.closing")}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
