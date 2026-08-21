"use client";

import { useState, useEffect } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

interface Props {
  matchId: string;
  role: "BUYER" | "SELLER";
  onSubmitted?: () => void;
}

interface ExistingReview {
  id: string;
  rating: number;
  comment: string;
  status: string;
  createdAt: string;
}

export function ReviewForm({ matchId, role, onSubmitted }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null);
  const [checking, setChecking] = useState(true);

  // ── Check if user already reviewed this match ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reviews?matchId=${matchId}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.review) {
            setExistingReview(json.review);
            setRating(json.review.rating);
            setComment(json.review.comment);
          }
        }
      } catch {}
      setChecking(false);
    })();
  }, [matchId]);

  async function handleSubmit() {
    if (rating < 1) {
      toast({ title: "الرجاء اختيار تقييم", variant: "destructive" });
      return;
    }
    if (comment.trim().length < 10) {
      toast({ title: "التعليق قصير جداً (10 أحرف على الأقل)", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, rating, comment: comment.trim() }),
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; reviewId?: string; message?: string } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "فشل الإرسال");
      }
      toast({ title: "✓", description: json.message || t("reviews.pending") });
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ──
  if (checking) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("buyer.dashboard.loading")}
      </div>
    );
  }

  // ── Already reviewed — show confirmation ──
  if (existingReview) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            {existingReview.status === "APPROVED"
              ? "شكراً لك، تقييمك منشور على المنصة"
              : "شكراً، تقييمك قيد المراجعة وسيظهر بعد الموافقة عليه"}
          </p>
        </div>
        {/* Show the submitted rating as read-only stars */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-4 h-4 ${star <= existingReview.rating ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/30"}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground italic">{existingReview.comment}</p>
      </div>
    );
  }

  // ── Just submitted — show success ──
  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            {t("reviews.pending")}
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            تم إرسال تقييمك وهو قيد المراجعة، سيظهر بعد الموافقة عليه
          </p>
        </div>
      </div>
    );
  }

  // ── Review form ──
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-foreground">{t("reviews.writeTitle")}</h3>

      {/* Stars */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="p-1"
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                star <= (hover || rating)
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-muted-foreground/40"
              }`}
            />
          </button>
        ))}
        <span className="text-xs text-muted-foreground mr-2 tabular-nums">
          {rating > 0 ? `${rating}/5` : ""}
        </span>
      </div>

      {/* Comment */}
      <div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("reviews.commentPlaceholder")}
          maxLength={500}
          rows={3}
          disabled={submitting}
        />
        <div className="text-[10px] text-muted-foreground text-left mt-1 tabular-nums">
          {comment.length} / 500
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || rating < 1 || comment.trim().length < 10}
        className="gap-2 w-full sm:w-auto"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
        {t("reviews.submit")}
      </Button>
    </div>
  );
}
