"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, Check, X, Clock, AlertTriangle } from "lucide-react";

// ══════════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════════

interface MeetingAgreementStatus {
  status: string;
  deadline: string | null;
  buyerProposal: { date: string; status: string } | null;
  sellerProposal: { date: string; status: string } | null;
  agreedDate: string | null;
  confirmedAt: string | null;
}

interface MeetingAgreementDialogProps {
  matchId: string;
  role: "buyer" | "seller";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function formatDateArabic(dateStr: string): string {
  const date = new Date(dateStr);
  const days = [
    "الأحد", "الإثنين", "الثلاثاء", "الأربعاء",
    "الخميس", "الجمعة", "السبت",
  ];
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];

  const day = days[date.getDay()];
  const dayNum = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours < 12 ? "صباحاً" : "مساءً";
  const displayHours = hours % 12 || 12;

  return `${day} ${dayNum} ${month} ${year}، ${displayHours}:${minutes} ${period}`;
}

function formatDeadline(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "منتهية";
  if (diffDays === 1) return "يوم واحد متبقي";
  if (diffDays === 2) return "يومان متبقيان";
  if (diffDays <= 10) return `${diffDays} أيام متبقية`;
  return `${diffDays} يوماً متبقياً`;
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════════

export function MeetingAgreementDialog({
  matchId,
  role,
  open,
  onOpenChange,
}: MeetingAgreementDialogProps) {
  const [status, setStatus] = useState<MeetingAgreementStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("10:00");

  // ── Fetch current status ──
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/meeting-agreement`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      console.error("Failed to fetch meeting status");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (open) {
      fetchStatus();
      setError(null);
      setSuccess(null);
    }
  }, [open, fetchStatus]);

  // ── Handle propose ──
  const handlePropose = async () => {
    if (!proposedDate) {
      setError("يرجى اختيار التاريخ");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Combine date and time
      const dateTime = new Date(`${proposedDate}T${proposedTime}:00`);

      const res = await fetch(`/api/matches/${matchId}/meeting-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedDate: dateTime.toISOString(),
          role,
          action: "propose",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }

      if (data.status === "Agreed") {
        setSuccess("تم الاتفاق على الموعد بنجاح! 🎉");
      } else {
        setSuccess("تم إرسال اقتراحك بنجاح");
      }

      await fetchStatus();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handle approve ──
  const handleApprove = async (dateToApprove: string) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/matches/${matchId}/meeting-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedDate: dateToApprove,
          role,
          action: "approve",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }

      setSuccess("تم الموافقة على الموعد بنجاح! 🎉");
      await fetchStatus();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Determine what to show ──
  const otherProposal =
    role === "buyer" ? status?.sellerProposal : status?.buyerProposal;
  const myProposal =
    role === "buyer" ? status?.buyerProposal : status?.sellerProposal;

  const showProposeForm =
    status?.status === "NotStarted" ||
    status?.status === "ConflictingProposals" ||
    (!otherProposal && !myProposal);

  const showApproveButton =
    otherProposal &&
    otherProposal.status === "Proposed" &&
    (!myProposal || myProposal.status !== "Approved");

  const isAgreed = status?.status === "Agreed";
  const isFailed = status?.status === "Cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5" />
            اتفاق على موعد اللقاء
          </DialogTitle>
          <DialogDescription>
            يُرجى الاتفاق على موعد لقاء مناسب لكلا الطرفين
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            جاري التحميل...
          </div>
        ) : isAgreed ? (
          // ── AGREED STATE ──
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-bold mb-2">
                <Check className="w-5 h-5" />
                تم الاتفاق بنجاح!
              </div>
              <p className="text-sm text-green-600 dark:text-green-400">
                📅 الموعد: {status?.agreedDate ? formatDateArabic(status.agreedDate) : ""}
              </p>
              {status?.confirmedAt && (
                <p className="text-xs text-green-500 dark:text-green-500 mt-1">
                  ⏰ وقت التأكيد: {new Date(status.confirmedAt).toISOString()}
                </p>
              )}
            </div>
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="font-bold mb-1">⚠️ إشعار قانوني:</p>
              <p className="text-muted-foreground">
                التزام منصة عقار Match تجاهكما انقضى بموجب الاتفاقية.
                يُرجى الحضور في الموعد المتفق عليه.
              </p>
            </div>
          </div>
        ) : isFailed ? (
          // ── FAILED STATE ──
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold mb-2">
              <X className="w-5 h-5" />
              انتهى الوقت دون اتفاق
            </div>
            <p className="text-sm text-red-600 dark:text-red-400">
              لم يتم التوصل لاتفاق على موعد اللقاء خلال المهلة المحددة.
            </p>
          </div>
        ) : (
          // ── ACTIVE STATE ──
          <div className="space-y-4">
            {/* Deadline */}
            {status?.deadline && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>المهلة المتبقية: {formatDeadline(status.deadline)}</span>
              </div>
            )}

            {/* Existing proposals */}
            {status?.buyerProposal && (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm font-bold mb-1">اقتراح المشتري:</p>
                <p className="text-sm">
                  📅 {formatDateArabic(status.buyerProposal.date)}
                  <span className="text-xs text-muted-foreground mr-2">
                    ({status.buyerProposal.status === "Approved" ? "✅ موافق" : "⏳ في الانتظار"})
                  </span>
                </p>
              </div>
            )}

            {status?.sellerProposal && (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm font-bold mb-1">اقتراح البائع:</p>
                <p className="text-sm">
                  📅 {formatDateArabic(status.sellerProposal.date)}
                  <span className="text-xs text-muted-foreground mr-2">
                    ({status.sellerProposal.status === "Approved" ? "✅ موافق" : "⏳ في الانتظار"})
                  </span>
                </p>
              </div>
            )}

            {/* Approve button for other party's proposal */}
            {showApproveButton && otherProposal && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  اقترح الطرف الآخر موعداً. هل توافق؟
                </p>
                <Button
                  onClick={() => handleApprove(otherProposal.date)}
                  disabled={submitting}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 ml-2" />
                  أوافق على هذا الموعد
                </Button>
              </div>
            )}

            {/* Propose form */}
            {showProposeForm && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-bold">اقترح موعد اللقاء:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="meeting-date" className="text-sm">
                      التاريخ
                    </Label>
                    <Input
                      id="meeting-date"
                      type="date"
                      value={proposedDate}
                      onChange={(e) => setProposedDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="meeting-time" className="text-sm">
                      الوقت
                    </Label>
                    <Input
                      id="meeting-time"
                      type="time"
                      value={proposedTime}
                      onChange={(e) => setProposedTime(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button
                  onClick={handlePropose}
                  disabled={submitting || !proposedDate}
                  className="w-full"
                >
                  <Calendar className="w-4 h-4 ml-2" />
                  {submitting ? "جاري الإرسال..." : "اقترح موعد اللقاء"}
                </Button>
              </div>
            )}

            {/* Conflicting proposals warning */}
            {status?.status === "ConflictingProposals" && (
              <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  الطرفان اقترحا مواعيد مختلفة. يُرجى التواصل للتوصل لاتفاق.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error / Success messages */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">
            {success}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
