"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users, Building2, TrendingUp, Star, ShieldAlert, MessageSquareX,
  RefreshCw, Loader2, CheckCircle2, XCircle, AlertCircle, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

interface OverviewStats {
  users: { total: number; individual: number; agency: number; developer: number };
  listings: { active: number };
  matches: { total: number; completed: number; successRate: number };
  reviews: { pending: number };
  security: { blockedMessages30d: number };
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  role: string;
  createdAt: string;
  user: { id: string; accountCategory: string };
}

interface BlockedMessage {
  id: string;
  content: string;
  blockedReason: string | null;
  sentAt: string;
  senderId: string;
  conversation: { matchId: string };
}

type Tab = "overview" | "reviews" | "blocked" | "disputes";

export default function AdminPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [blockedMessages, setBlockedMessages] = useState<BlockedMessage[]>([]);
  const [disputes, setDisputes] = useState<unknown[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "overview") {
        const res = await fetch("/api/admin/stats/overview", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          setError("غير مصرح — هذه الصفحة للمشرفين فقط");
          return;
        }
        if (res.ok) setStats(await res.json());
      } else if (tab === "reviews") {
        const res = await fetch("/api/reviews?status=PENDING&admin=true", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setReviews(json.reviews || []);
        }
      } else if (tab === "blocked") {
        const res = await fetch("/api/admin/messages/blocked", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setBlockedMessages(json.messages || []);
        }
      } else if (tab === "disputes") {
        const res = await fetch("/api/admin/disputes", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setDisputes(json.disputes || []);
        }
      }
    } catch (e) {
      setError("تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleReviewAction(reviewId: string, action: "APPROVED" | "REJECTED") {
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        toast({ title: action === "APPROVED" ? "تم القبول ✓" : "تم الرفض" });
        setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      }
    } catch {
      toast({ title: "فشل", variant: "destructive" });
    }
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
        <p className="text-lg font-bold text-foreground mb-2">{error}</p>
        <p className="text-sm text-muted-foreground">إذا كنت مشرفاً، تواصل مع الإدارة لتفعيل صلاحياتك.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: "overview", label: "نظرة عامة", icon: TrendingUp },
    { key: "reviews", label: "تقييمات معلّقة", icon: Star },
    { key: "blocked", label: "رسائل محظورة", icon: MessageSquareX },
    { key: "disputes", label: "نزاعات", icon: Flag },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة الإدارة</h1>
          <p className="text-sm text-muted-foreground">مراقبة نشاط المنصة والنزاعات</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="w-4 h-4" />
          تحديث
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          const active = tab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {tab === "overview" && stats && <OverviewTab stats={stats} />}
          {tab === "reviews" && <ReviewsTab reviews={reviews} onAction={handleReviewAction} />}
          {tab === "blocked" && <BlockedTab messages={blockedMessages} />}
          {tab === "disputes" && <DisputesTab disputes={disputes} />}
        </motion.div>
      )}
    </div>
  );
}

function OverviewTab({ stats }: { stats: OverviewStats }) {
  const cards = [
    { label: "إجمالي المستخدمين", value: stats.users.total, icon: Users, color: "bg-blue-500/10 text-blue-600" },
    { label: "أفراد", value: stats.users.individual, icon: Users, color: "bg-emerald-500/10 text-emerald-600" },
    { label: "وكالات", value: stats.users.agency, icon: Building2, color: "bg-violet-500/10 text-violet-600" },
    { label: "مرقّون", value: stats.users.developer, icon: Building2, color: "bg-amber-500/10 text-amber-600" },
    { label: "نشرات نشطة", value: stats.listings.active, icon: Building2, color: "bg-cyan-500/10 text-cyan-600" },
    { label: "معدل نجاح المطابقة", value: `${stats.matches.successRate}%`, icon: TrendingUp, color: "bg-emerald-500/10 text-emerald-600" },
    { label: "تقييمات معلّقة", value: stats.reviews.pending, icon: Star, color: "bg-amber-500/10 text-amber-600" },
    { label: "رسائل محظورة (30 يوم)", value: stats.security.blockedMessages30d, icon: ShieldAlert, color: "bg-red-500/10 text-red-600" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-foreground tabular-nums">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function ReviewsTab({ reviews, onAction }: { reviews: Review[]; onAction: (id: string, action: "APPROVED" | "REJECTED") => void }) {
  if (reviews.length === 0) return <p className="text-center text-sm text-muted-foreground py-12">لا توجد تقييمات معلّقة</p>;
  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline">{r.rating} ★</Badge>
                <span className="text-xs text-muted-foreground">{r.role}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("ar-DZ")}</span>
              </div>
              <p className="text-sm text-foreground">{r.comment}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onAction(r.id, "APPROVED")} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> قبول
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction(r.id, "REJECTED")} className="gap-1 text-destructive">
                <XCircle className="w-3.5 h-3.5" /> رفض
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BlockedTab({ messages }: { messages: BlockedMessage[] }) {
  if (messages.length === 0) return <p className="text-center text-sm text-muted-foreground py-12">لا توجد رسائل محظورة</p>;
  const reasonLabels: Record<string, string> = {
    phone_number: "رقم هاتف",
    external_link: "رابط خارجي",
    email: "بريد إلكتروني",
    social_handle: "معرّف تواصل اجتماعي",
  };
  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <Card key={m.id} className="p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                  {reasonLabels[m.blockedReason || ""] || m.blockedReason}
                </Badge>
                <span className="text-xs text-muted-foreground">{new Date(m.sentAt).toLocaleString("ar-DZ")}</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate">{m.content.slice(0, 80)}...</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DisputesTab({ disputes }: { disputes: unknown[] }) {
  if (disputes.length === 0) return <p className="text-center text-sm text-muted-foreground py-12">لا توجد نزاعات</p>;
  return (
    <div className="space-y-3">
      {disputes.map((d, i) => (
        <Card key={i} className="p-4">
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 mb-2">
            <Flag className="w-3 h-3 me-1" /> نزاع
          </Badge>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{JSON.stringify(d, null, 2)}</pre>
        </Card>
      ))}
    </div>
  );
}
