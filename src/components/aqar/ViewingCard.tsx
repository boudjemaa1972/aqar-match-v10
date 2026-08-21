"use client";

// ──────────────────────────────────────────────────────────────────
//  ViewingCard — displays scheduled viewing for a DEVELOPER match.
//  Shows: date/time, representative NAME (no contact info), status,
//  and a simple timeline (match → chat → viewing → outcome).
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Clock, User, CheckCircle2, XCircle, AlertCircle,
  Loader2, MapPin,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

interface Viewing {
  id: string;
  scheduledAt: string;
  representativeName: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  outcome: string | null;
}

interface Props {
  matchId: string;
}

export function ViewingCard({ matchId }: Props) {
  const { t } = useI18n();
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/match/${matchId}/viewing`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setViewing(json.viewing);
        }
      } catch {}
      setLoading(false);
    })();
  }, [matchId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("buyer.dashboard.loading")}
      </div>
    );
  }

  if (!viewing) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-center">
        <Calendar className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">{t("viewing.noViewing")}</p>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; icon: typeof Calendar; label: string }> = {
    SCHEDULED: { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock, label: t("viewing.scheduled") },
    COMPLETED: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2, label: t("viewing.completed") },
    CANCELLED: { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle, label: t("viewing.cancelled") },
    NO_SHOW:   { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: AlertCircle, label: t("viewing.no_show") },
  };
  const sc = statusConfig[viewing.status] || statusConfig.SCHEDULED;
  const StatusIcon = sc.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center gap-2 bg-secondary/30">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">{t("viewing.title")}</span>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={sc.color}>
              <StatusIcon className="w-3 h-3 me-1" />
              {sc.label}
            </Badge>
          </div>

          {/* Date/time */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("viewing.scheduledAt")}</p>
              <p className="text-sm font-bold text-foreground">
                {new Date(viewing.scheduledAt).toLocaleDateString("ar-DZ", {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(viewing.scheduledAt).toLocaleTimeString("ar-DZ", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Representative */}
          {viewing.representativeName && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <User className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("viewing.representative")}</p>
                <p className="text-sm font-bold text-foreground">{viewing.representativeName}</p>
              </div>
            </div>
          )}

          {/* Timeline (simple) */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${viewing.status ? "bg-primary" : "bg-muted"}`} />
                <span>تطابق</span>
              </div>
              <div className="flex-1 h-px bg-border" />
              <div className="flex flex-col items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>محادثة</span>
              </div>
              <div className="flex-1 h-px bg-border" />
              <div className="flex flex-col items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${viewing.status !== "SCHEDULED" ? "bg-primary" : "bg-muted-foreground/30"}`} />
                <span>معاينة</span>
              </div>
              <div className="flex-1 h-px bg-border" />
              <div className="flex flex-col items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${viewing.status === "COMPLETED" ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                <span>نتيجة</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
