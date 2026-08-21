"use client";

// ──────────────────────────────────────────────────────────────────
//  /admin/reviews — Admin review moderation page.
//
//  Uses the session-based admin role (requireAdmin on the API side).
//  The admin must be logged in with systemRole=ADMIN (promoted via
//  scripts/create-admin.ts). No CRON_SECRET needed — the session
//  cookie is the auth mechanism.
//
//  Flow:
//   1. Fetches PENDING reviews from GET /api/admin/reviews?status=PENDING
//   2. For each review: shows stars, comment, role, date, matchId
//   3. Approve/Reject buttons call PATCH /api/admin/reviews/[id]
//   4. Optimistic removal from list on success
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, CheckCircle2, XCircle, Loader2, AlertCircle,
  RefreshCw, ArrowLeft, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

interface AdminReview {
  id: string;
  rating: number;
  comment: string;
  role: string;
  status: string;
  matchId: string | null;
  createdAt: string;
  displayName: string;
  accountCategory: string;
}

export default function AdminReviewsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reviews?status=PENDING", { cache: "no-store" });
      if (res.status === 401) {
        setError("يجب تسجيل الدخول كمشرف للوصول إلى هذه الصفحة");
        return;
      }
      if (res.status === 403) {
        setError("غير مصرح — هذه الصفحة للمشرفين فقط");
        return;
      }
      if (!res.ok) {
        throw new Error("تعذّر تحميل التقييمات");
      }
      const json = await res.json();
      setReviews(json.reviews || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل التقييمات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  async function handleAction(reviewId: string, action: "APPROVED" | "REJECTED") {
    setActionLoading(reviewId);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "فشل الإجراء");
      }
      // Optimistic removal from list
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      toast({
        title: action === "APPROVED" ? "تمت الموافقة ✓" : "تم الرفض",
        description: action === "APPROVED"
          ? "التقييم منشور الآن في قسم آراء المستخدمين"
          : "تم رفض التقييم — لن يظهر للعامة",
      });
    } catch (e) {
      toast({
        title: "فشل",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  // ── Error / unauthorized state ──
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
        <p className="text-lg font-bold text-foreground mb-2">{error}</p>
        <p className="text-sm text-muted-foreground mb-6">
          إذا كنت مشرفاً، سجّل الدخول برقم هاتفك ثم حاول مرة أخرى.
        </p>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            العودة للرئيسية
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مراجعة التقييمات</h1>
          <p className="text-sm text-muted-foreground">
            {reviews.length > 0
              ? `${reviews.length} تقييم بانتظار المراجعة`
              : "لا توجد تقييمات معلّقة"}
          </p>
        </div>
        <Button onClick={loadReviews} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="w-4 h-4" />
          تحديث
        </Button>
      </div>

      {/* Back to admin */}
      <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-3 h-3" />
        العودة للوحة الإدارة
      </Link>

      {/* Empty state */}
      {reviews.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary/60 mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">لا توجد تقييمات بانتظار المراجعة حالياً</p>
          <p className="text-xs text-muted-foreground">ستظهر التقييمات الجديدة هنا تلقائياً</p>
        </div>
      ) : (
        /* Review cards */
        <div className="space-y-3">
          <AnimatePresence>
            {reviews.map((review) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                layout
              >
                <Card className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {/* Left: review content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Stars + role + date */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                star <= review.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-none text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {review.role === "BUYER" ? "مشترٍ" : "بائع"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(review.createdAt).toLocaleDateString("ar-DZ", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Comment */}
                      <p className="text-sm text-foreground leading-relaxed">
                        {review.comment}
                      </p>

                      {/* Metadata */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>من: {review.displayName}</span>
                        {review.matchId && (
                          <span className="font-mono">
                            مطابقة: {review.matchId.slice(-8)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 min-w-[100px]"
                        disabled={actionLoading === review.id}
                        onClick={() => handleAction(review.id, "APPROVED")}
                      >
                        {actionLoading === review.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        موافقة
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1.5 min-w-[100px]"
                        disabled={actionLoading === review.id}
                        onClick={() => handleAction(review.id, "REJECTED")}
                      >
                        {actionLoading === review.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        رفض
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
