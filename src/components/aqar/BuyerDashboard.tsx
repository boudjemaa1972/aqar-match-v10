"use client";

// ──────────────────────────────────────────────────────────────────
//  BuyerDashboard — buyer/tenant view with 5 tabs:
//   1. "نظرة عامة" (Overview) — stats + pending actions
//   2. "طلباتي" (My Requests) — all MatchRequests created by user
//   3. "التطابقات" (Matches) — all buyer matches with status timeline
//   4. "عمليات محفوظة" (Saved Searches) — placeholder (coming soon)
//   5. "تقييماتي" (My Reviews) — reviews given/received
//
//  Mirrors SellerDashboard design: same Card/Badge/motion style,
//  same responsive patterns, same RTL awareness.
//
//  SECURITY: all data comes from /api/buyer/* routes which filter
//  by buyerId = session.user.id. The component never receives
//  secretMinPrice or other sellers' secrets.
// ──────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, RefreshCw, CheckCircle2, XCircle, Clock, Phone, MapPin,
  BedDouble, Bath, Maximize, Loader2, Sparkles, Building2, Inbox,
  TrendingUp, Wallet, AlertCircle, Handshake, Bell, Bookmark,
  Star, ChevronLeft, ChevronRight, ArrowLeft, Eye, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { ReviewForm } from "./ReviewForm";
import { DealCompletedCard } from "./DealCompletedCard";
import { formatDZD } from "./store";

// ─── Types ────────────────────────────────────────────────────────
interface BuyerStats {
  activeRequests: number;
  fulfilledRequests: number;
  closedRequests: number;
  totalRequests: number;
  pendingBuyerAction: number;
  pendingNegotiation: number;
  completedDeals: number;
  rejectedMatches: number;
  expiredMatches: number;
  refundedMatches: number;
  totalFeesPaid: number;
  pendingActions: number;
}

interface BuyerRequest {
  id: string;
  intent: "SELL" | "RENT" | "SEASONAL_RENT";
  type: string;
  city: string;
  commune: string | null;
  district: string | null;
  maxBudget: number | null;
  status: "OPEN" | "FULFILLED" | "CLOSED";
  createdAt: string;
  matchesCount: number;
}

interface BuyerMatch {
  matchId: string;
  score: number;
  status:
    | "PROPOSED"
    | "SELLER_FEE_PAID"
    | "BUYER_NOTIFIED"
    | "BUYER_FEE_PAID"
    | "REJECTED"
    | "EXPIRED"
    | "REFUNDED";
  queueRank: number;
  sellerFeePaid: boolean;
  sellerConsented: boolean;
  buyerFeePaid: boolean;
  sellerConfirmContact: boolean;
  sellerDeadline: string | null;
  buyerDeadline: string | null;
  refundEligibleAt: string | null;
  buyerFee: number;
  sellerFee: number;
  createdAt: string;
  rounds: number;
  buyerOffer: number | null;
  sellerOffer: number | null;
  buyerTurn: boolean;
  revealed: boolean;
  listing: {
    id: string;
    intent: "SELL" | "RENT" | "SEASONAL_RENT";
    type: string;
    city: string;
    commune: string | null;
    district: string | null;
    askingPrice: number;
    pricePerNight?: number | null;
    areaSqm: number;
    bedrooms: number | null;
    bathrooms: number | null;
    floor: number | null;
    facades: number | null;
    legalStatus: string | null;
    urbanPermitStatus?: string | null;
    offerTitle: string;
    minStayNights?: number | null;
    availableFrom?: string | null;
    availableTo?: string | null;
    // Revealed fields (only when status = BUYER_FEE_PAID)
    contact?: string;
    location?: string;
    photos?: string[];
    geoLocation?: { lat: number; lng: number; accuracy?: number | null } | null;
  };
}

interface Props {
  onSwitchToSeller?: () => void;
  onStartSearch?: () => void;
  onStartPublish?: () => void;
}

type Tab = "overview" | "requests" | "matches" | "saved" | "reviews";

export function BuyerDashboard({ onSwitchToSeller, onStartSearch, onStartPublish }: Props) {
  const { t, dir } = useI18n();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<BuyerStats | null>(null);
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [matches, setMatches] = useState<BuyerMatch[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, reqRes, matchRes] = await Promise.all([
        fetch("/api/buyer/stats", { cache: "no-store" }),
        fetch("/api/buyer/requests", { cache: "no-store" }),
        fetch("/api/buyer/matches", { cache: "no-store" }),
      ]);
      if (!statsRes.ok || !reqRes.ok || !matchRes.ok) {
        throw new Error(t("buyer.dashboard.error"));
      }
      const [statsJson, reqJson, matchJson] = await Promise.all([
        statsRes.json(),
        reqRes.json(),
        matchRes.json(),
      ]);
      setStats(statsJson);
      setRequests(reqJson.requests || []);
      setMatches(matchJson.matches || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("buyer.dashboard.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Pay buyer fee from dashboard ──
  const handlePayFee = useCallback(async (matchId: string) => {
    try {
      const res = await fetch(`/api/match/${matchId}/pay-fee`, { method: "POST" });
      const text = await res.text();
      let json: { ok?: boolean; error?: string } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "فشل الدفع");
      }
      // Refresh data to show updated match status
      await loadData();
    } catch (e) {
      // Show error toast — the match card stays visible for retry
      console.error("Pay fee failed:", e);
    }
  }, [loadData]);

  // ── Poll for active matches (every 10s) ──
  // When a buyer has matches in PROPOSED / SELLER_FEE_PAID state, they
  // need to know ASAP when the seller pays+consents (→ BUYER_NOTIFIED)
  // so they can pay their fee. This poll refreshes the data automatically.
  useEffect(() => {
    // Only poll if there are active (non-terminal) matches
    const hasActiveMatches = matches.some(
      (m) => ["PROPOSED", "SELLER_FEE_PAID", "BUYER_NOTIFIED"].includes(m.status),
    );
    if (!hasActiveMatches) return;
    const interval = setInterval(loadData, 10_000); // 10 seconds
    return () => clearInterval(interval);
  }, [matches, loadData]);

  const Arrow = dir === "rtl" ? ArrowLeft : ArrowLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  // ── Loading state ──
  if (loading && !stats) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("buyer.dashboard.loading")}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive mb-3" />
          <p className="text-sm text-foreground mb-4">{error}</p>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 me-1.5" />
            {t("buyer.dashboard.refresh")}
          </Button>
        </div>
      </div>
    );
  }

  // ── Empty state — no requests and no matches ──
  const isEmpty = (stats?.totalRequests ?? 0) === 0 && matches.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mb-6">
            <Search className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">
            {t("buyer.dashboard.empty.title")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
            {t("buyer.dashboard.empty.desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {onStartSearch && (
              <Button onClick={onStartSearch} size="lg" className="gap-2">
                <Search className="w-4 h-4" />
                {t("buyer.dashboard.empty.cta.search")}
              </Button>
            )}
            {onStartPublish && (
              <Button onClick={onStartPublish} variant="outline" size="lg" className="gap-2">
                <Building2 className="w-4 h-4" />
                {t("buyer.dashboard.empty.cta.publish")}
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Tabs definition ──
  const tabs: { key: Tab; label: string; icon: typeof Search; badge?: number }[] = [
    { key: "overview", label: t("buyer.dashboard.tab.overview"), icon: TrendingUp },
    { key: "requests", label: t("buyer.dashboard.tab.requests"), icon: Inbox, badge: stats?.activeRequests },
    { key: "matches", label: t("buyer.dashboard.tab.matches"), icon: Sparkles, badge: stats?.pendingActions },
    { key: "saved", label: t("buyer.dashboard.tab.saved"), icon: Bookmark },
    { key: "reviews", label: t("buyer.dashboard.tab.reviews"), icon: Star },
  ];

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-1">
            {t("buyer.dashboard.title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{t("buyer.dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchToSeller && (
            <Button onClick={onSwitchToSeller} variant="outline" size="sm" className="gap-1.5">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("userDashboard.tab.seller")}</span>
            </Button>
          )}
          <Button onClick={loadData} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">{t("buyer.dashboard.refresh")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/5"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.reload();
            }}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">خروج</span>
          </Button>
        </div>
      </div>

      {/* ── Pending action banner (if any) ── */}
      {stats && stats.pendingActions > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-6 flex items-center gap-3"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
              {t("buyer.dashboard.pendingAction.title")}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {stats.pendingActions} {t("buyer.dashboard.pendingAction.desc")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            onClick={() => setTab("matches")}
          >
            {t("buyer.dashboard.matches.viewDetails")}
            <Next className="w-3.5 h-3.5" />
          </Button>
        </motion.div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto scroll-slim pb-1">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          const active = tab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tabItem.label}</span>
              {tabItem.badge != null && tabItem.badge > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500 text-white"
                }`}>
                  {tabItem.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === "overview" && stats && (
          <OverviewTab stats={stats} matches={matches} onGoToMatches={() => setTab("matches")} />
        )}
        {tab === "requests" && (
          <RequestsTab requests={requests} />
        )}
        {tab === "matches" && (
          <MatchesTab matches={matches} onPayFee={handlePayFee} />
        )}
        {tab === "saved" && (
          <SavedTab />
        )}
        {tab === "reviews" && (
          <ReviewsTab />
        )}
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OverviewTab — stats grid + pending actions
// ══════════════════════════════════════════════════════════════════
function OverviewTab({
  stats,
  matches,
  onGoToMatches,
}: {
  stats: BuyerStats;
  matches: BuyerMatch[];
  onGoToMatches: () => void;
}) {
  const { t } = useI18n();

  const statCards = [
    {
      label: t("buyer.dashboard.stat.activeRequests"),
      value: stats.activeRequests,
      icon: Inbox,
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: t("buyer.dashboard.stat.pendingAction"),
      value: stats.pendingActions,
      icon: Bell,
      color: "bg-amber-500/10 text-amber-600",
      highlight: stats.pendingActions > 0,
    },
    {
      label: t("buyer.dashboard.stat.ongoingNegotiations"),
      value: stats.pendingNegotiation,
      icon: Handshake,
      color: "bg-violet-500/10 text-violet-600",
    },
    {
      label: t("buyer.dashboard.stat.completedDeals"),
      value: stats.completedDeals,
      icon: CheckCircle2,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: t("buyer.dashboard.stat.totalFeesPaid"),
      value: formatDZD(stats.totalFeesPaid),
      icon: Wallet,
      color: "bg-rose-500/10 text-rose-600",
    },
  ];

  // Pending action matches (need buyer attention)
  const pendingMatches = matches.filter(
    (m) => m.status === "BUYER_NOTIFIED" || (m.buyerTurn && m.sellerOffer !== null && m.status !== "BUYER_FEE_PAID"),
  );

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={`p-3 sm:p-4 ${s.highlight ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${s.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
                  {s.value}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                  {s.label}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Pending actions */}
      {pendingMatches.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600" />
            {t("buyer.dashboard.pendingAction.title")}
          </h3>
          <div className="space-y-2">
            {pendingMatches.slice(0, 3).map((m) => (
              <PendingActionCard key={m.matchId} match={m} onGoToMatches={onGoToMatches} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingActionCard({ match, onGoToMatches }: { match: BuyerMatch; onGoToMatches: () => void }) {
  const { t } = useI18n();
  const isPayFee = match.status === "BUYER_NOTIFIED";
  const isRespondOffer = match.buyerTurn && match.sellerOffer !== null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4 flex items-center gap-3 flex-wrap"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {match.listing.offerTitle || t("buyer.dashboard.matches.title")}
        </p>
        <p className="text-xs text-muted-foreground">
          {match.listing.city}{match.listing.commune ? ` • ${match.listing.commune}` : ""}
        </p>
      </div>
      <Button size="sm" onClick={onGoToMatches} className="bg-amber-600 hover:bg-amber-700">
        {isPayFee ? t("buyer.dashboard.pendingAction.payFee") : isRespondOffer ? t("buyer.dashboard.pendingAction.respondOffer") : t("buyer.dashboard.matches.viewDetails")}
      </Button>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  RequestsTab — list of MatchRequests
// ══════════════════════════════════════════════════════════════════
function RequestsTab({ requests }: { requests: BuyerRequest[] }) {
  const { t, dir } = useI18n();

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("buyer.dashboard.requests.empty")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r, i) => {
        const statusColor =
          r.status === "OPEN" ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
          : r.status === "FULFILLED" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
          : "bg-muted text-muted-foreground border-border";
        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge variant="outline" className={statusColor}>
                      {r.status === "OPEN" ? "نشط" : r.status === "FULFILLED" ? "مُنجَز" : "مغلق"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("ar-DZ", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    {r.intent === "SELL" ? "شراء" : r.intent === "RENT" ? "إيجار" : "إيجار موسمي"} • {r.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.city}{r.commune ? ` • ${r.commune}` : ""}{r.district ? ` • ${r.district}` : ""}
                  </p>
                  {r.maxBudget !== null && (
                    <p className="text-sm font-bold text-primary mt-1.5 tabular-nums">
                      {formatDZD(r.maxBudget)}
                    </p>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground tabular-nums">{r.matchesCount}</div>
                  <div className="text-[10px] text-muted-foreground">{t("buyer.dashboard.matches.title")}</div>
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MatchesTab — all buyer matches with status timeline
// ══════════════════════════════════════════════════════════════════
function MatchesTab({ matches, onPayFee }: { matches: BuyerMatch[]; onPayFee?: (matchId: string) => Promise<void> }) {
  const { t } = useI18n();

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t("buyer.dashboard.matches.empty")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((m, i) => (
        <BuyerMatchCard key={m.matchId} match={m} index={i} onPayFee={onPayFee} />
      ))}
    </div>
  );
}

function BuyerMatchCard({ match, index, onPayFee }: { match: BuyerMatch; index: number; onPayFee?: (matchId: string) => void }) {
  const { t } = useI18n();
  const [paying, setPaying] = useState(false);

  const statusConfig: Record<string, { color: string; label: string }> = {
    PROPOSED: { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", label: t("buyer.dashboard.matches.status.PROPOSED") },
    SELLER_FEE_PAID: { color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20", label: t("buyer.dashboard.matches.status.SELLER_FEE_PAID") },
    BUYER_NOTIFIED: { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: t("buyer.dashboard.matches.status.BUYER_NOTIFIED") },
    BUYER_FEE_PAID: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", label: t("buyer.dashboard.matches.status.BUYER_FEE_PAID") },
    REJECTED: { color: "bg-red-500/10 text-red-600 border-red-500/20", label: t("buyer.dashboard.matches.status.REJECTED") },
    EXPIRED: { color: "bg-muted text-muted-foreground border-border", label: t("buyer.dashboard.matches.status.EXPIRED") },
    REFUNDED: { color: "bg-orange-500/10 text-orange-600 border-orange-500/20", label: t("buyer.dashboard.matches.status.REFUNDED") },
  };
  const sc = statusConfig[match.status] || statusConfig.PROPOSED;

  // Pending action?
  const isPending = match.status === "BUYER_NOTIFIED" || (match.buyerTurn && match.sellerOffer !== null && match.status !== "BUYER_FEE_PAID");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className={`overflow-hidden ${isPending ? "border-amber-500/40" : ""}`}>
        <div className="p-4 sm:p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="outline" className={sc.color}>
                  {sc.label}
                </Badge>
                {isPending && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                    <Bell className="w-3 h-3 me-1" />
                    {t("buyer.dashboard.stat.pendingAction")}
                  </Badge>
                )}
                {match.revealed && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 me-1" />
                    {t("buyer.dashboard.matches.contactRevealed")}
                  </Badge>
                )}
              </div>
              <h3 className="font-bold text-foreground text-sm sm:text-base">
                {match.listing.offerTitle || t("buyer.dashboard.matches.title")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {match.listing.city}{match.listing.commune ? ` • ${match.listing.commune}` : ""}
              </p>
            </div>
            <div className="text-end">
              <div className="text-xs text-muted-foreground">{t("match.strongMatch")}</div>
              <div className="text-lg font-bold text-primary tabular-nums">{Math.round(match.score)}%</div>
            </div>
          </div>

          {/* Listing details grid */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
            <Detail icon={Maximize} value={`${match.listing.areaSqm} م²`} />
            {match.listing.bedrooms !== null && <Detail icon={BedDouble} value={String(match.listing.bedrooms)} />}
            {match.listing.bathrooms !== null && <Detail icon={Bath} value={String(match.listing.bathrooms)} />}
            <Detail icon={Wallet} value={formatDZD(match.listing.askingPrice || match.listing.pricePerNight || 0)} />
          </div>

          {/* Negotiation info (if any) */}
          {match.sellerOffer !== null && (
            <div className="rounded-lg bg-secondary/50 px-3 py-2 mb-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-muted-foreground">عرض البائع:</span>
                <span className="font-bold text-foreground tabular-nums">{formatDZD(match.sellerOffer)}</span>
              </div>
              {match.buyerOffer !== null && (
                <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
                  <span className="text-muted-foreground">عرضك:</span>
                  <span className="font-bold text-foreground tabular-nums">{formatDZD(match.buyerOffer)}</span>
                </div>
              )}
            </div>
          )}

          {/* Revealed contact (after BUYER_FEE_PAID) */}
          {match.revealed && match.listing.contact && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 mb-3">
              <div className="flex items-center gap-2 text-xs">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span className="text-muted-foreground">{t("match.revealedContact")}:</span>
                {(() => {
                  try {
                    const c = JSON.parse(match.listing.contact);
                    return (
                      <a href={`tel:${c.phone}`} className="font-mono font-bold text-foreground" dir="ltr">
                        {c.phone}
                      </a>
                    );
                  } catch {
                    return <span className="font-mono" dir="ltr">{match.listing.contact}</span>;
                  }
                })()}
              </div>
            </div>
          )}

          {/* Deal completed card — shown only for BUYER_FEE_PAID */}
          {match.status === "BUYER_FEE_PAID" && (
            <DealCompletedCard matchId={match.matchId} role="BUYER" />
          )}

          {/* Buyer fee info */}
          {!match.buyerFeePaid && match.buyerFee > 0 && (
            <div className="flex items-center justify-between gap-2 text-xs mb-3">
              <span className="text-muted-foreground">رسمك كمشترٍ:</span>
              <span className="font-bold text-foreground tabular-nums">{formatDZD(match.buyerFee)}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {match.status === "BUYER_NOTIFIED" && !match.buyerFeePaid && (
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-400/40 animate-pulse"
                disabled={paying}
                onClick={async () => {
                  if (!onPayFee) return;
                  setPaying(true);
                  await onPayFee(match.matchId);
                  setPaying(false);
                }}
              >
                {paying ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Wallet className="w-3.5 h-3.5 me-1" />}
                {t("buyer.dashboard.matches.payFee")}
              </Button>
            )}
            {match.buyerTurn && match.sellerOffer !== null && match.status !== "BUYER_FEE_PAID" && (
              <Button size="sm" variant="outline">
                <Handshake className="w-3.5 h-3.5 me-1" />
                {t("buyer.dashboard.pendingAction.respondOffer")}
              </Button>
            )}
            <Button size="sm" variant="ghost">
              <Eye className="w-3.5 h-3.5 me-1" />
              {t("buyer.dashboard.matches.viewDetails")}
            </Button>
          </div>

          {/* Deadline info (if pending) */}
          {match.buyerDeadline && match.status === "BUYER_NOTIFIED" && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" />
              <span>
                الموعد النهائي: {new Date(match.buyerDeadline).toLocaleString("ar-DZ", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function Detail({ icon: Icon, value }: { icon: typeof Maximize; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 py-2">
      <Icon className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
      <div className="font-bold text-foreground tabular-nums text-[11px]">{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  SavedTab — placeholder (coming soon)
// ══════════════════════════════════════════════════════════════════
function SavedTab() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Bookmark}
      title={t("buyer.dashboard.saved.title")}
      subtitle={t("buyer.dashboard.saved.comingSoon")}
    />
  );
}

// ══════════════════════════════════════════════════════════════════
//  ReviewsTab — placeholder (uses existing /api/reviews)
// ══════════════════════════════════════════════════════════════════
function ReviewsTab() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Star}
      title={t("buyer.dashboard.reviews.title")}
      subtitle={t("buyer.dashboard.reviews.empty")}
    />
  );
}

// ── Reusable empty state ──
function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Search;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center py-12 sm:py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary/60 mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
