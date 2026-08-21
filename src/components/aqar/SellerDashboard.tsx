"use client";

// SellerDashboard — seller/landlord view with two tabs:
//   1. "عقاراتي" (My Listings) — view owned listings + per-listing match stats
//   2. "الطلبات الواردة" (Incoming Requests) — pending unlock requests &
//      pending negotiation offers awaiting seller action
//
// First-time visitors see an activation card that calls
// POST /api/seller/matches to transfer a demo listing to them.

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Store,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Handshake,
  Clock,
  Phone,
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  Loader2,
  Sparkles,
  Building2,
  Inbox,
  Eye,
  TrendingUp,
  Plus,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDZD } from "./store";
import { TYPE_LABELS, INTENT_LABELS } from "@/lib/schemas";
import { CreateListingForm } from "./CreateListingForm";
import { ReviewForm } from "./ReviewForm";
import { DealCompletedCard } from "./DealCompletedCard";

// ─── Types ────────────────────────────────────────────────────────
interface SellerListing {
  id: string;
  intent: "SELL" | "RENT";
  type: string;
  city: string;
  commune: string | null;
  district: string | null;
  price: number;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  floor: number | null;
  ageYears: number;
  features: string[];
  status: string;
  location: string;
  createdAt: string;
  stats: { total: number; pending: number; accepted: number; rejected: number };
}

interface SellerMatch {
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
  sellerFee: number;
  buyerFee: number;
  buyerConsent: boolean;
  sellerConsent: boolean;
  createdAt: string;
  rounds: number;
  buyerOffer: number | null;
  sellerOffer: number | null;
  buyerTurn: boolean;
  listing: {
    id: string;
    intent: "SELL" | "RENT";
    type: string;
    city: string;
    commune: string | null;
    district: string | null;
    askingPrice: number;
    areaSqm: number;
    bedrooms: number | null;
    bathrooms: number | null;
    facades: number | null;
    legalStatus: string | null;
    urbanPermitStatus?: string | null;
    offerTitle: string;
    location: string;
  };
}

interface Props {
  onSwitchToBuyer: () => void;
  onAddListing?: () => void;
}

type Tab = "listings" | "requests";

export function SellerDashboard({ onSwitchToBuyer, onAddListing }: Props) {
  const [tab, setTab] = useState<Tab>("listings");
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [matches, setMatches] = useState<SellerMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [hasListings, setHasListings] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();

  const loadListings = useCallback(async () => {
    try {
      const res = await fetch("/api/seller/listings");
      const json = await res.json();
      if (res.ok) {
        setListings(json.listings || []);
        setHasListings(json.hasListings !== false);
      }
    } catch {}
  }, []);

  const loadMatches = useCallback(async () => {
    try {
      const res = await fetch("/api/seller/matches");
      const json = await res.json();
      if (res.ok) {
        setMatches(json.matches || []);
        setHasListings(json.hasListings !== false);
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadListings(), loadMatches()]);
    setLoading(false);
  }, [loadListings, loadMatches]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll matches every 3s when on requests tab (so new buyer requests appear)
  useEffect(() => {
    if (tab !== "requests") return;
    const interval = setInterval(loadMatches, 3000);
    return () => clearInterval(interval);
  }, [tab, loadMatches]);

  async function activateSellerMode() {
    setActivating(true);
    try {
      const res = await fetch("/api/seller/demo-activate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "فشل التفعيل");
      toast({
        title: "تم تفعيل وضع البائع ✓",
        description: "تمت إضافة عقار تجريبي إلى حسابك.",
      });
      await load();
    } catch (e) {
      toast({
        title: "فشل التفعيل",
        description: e instanceof Error ? e.message : "خطأ غير معروف",
        variant: "destructive",
      });
    } finally {
      setActivating(false);
    }
  }

  // ── Match actions ─────────────────────────────────────────────
  async function approve(matchId: string) {
    try {
      const res = await fetch(`/api/seller/matches/${matchId}/approve`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      toast({
        title: "تمت الموافقة ✓",
        description: "سيتمكن المشتري من رؤية بيانات الاتصال الآن.",
      });
      await load();
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  }

  async function reject(matchId: string) {
    try {
      const res = await fetch(`/api/seller/matches/${matchId}/reject`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      toast({ title: "تم الرفض", description: "تم إبلاغ المشتري بالرفض." });
      await load();
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  }

  // MatchStatus: PROPOSED = seller notified, awaiting fee + consent.
  // SELLER_FEE_PAID / BUYER_NOTIFIED = in-progress.
  const pendingMatches = matches.filter(
    (m) => m.status === "PROPOSED" && !m.sellerConsent,
  );
  const otherMatches = matches.filter(
    (m) => !(m.status === "PROPOSED" && !m.sellerConsent),
  );

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary mb-2">
            <Store className="w-4 h-4" />
            <span>وضع البائع / المؤجّر</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
            لوحة تحكم البائع
          </h2>
          <p className="text-muted-foreground text-sm">
            أدر عقاراتك المعروضة واستقبل طلبات الفتح والتفاوض المغلق من المشترين.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => {
              if (onAddListing) onAddListing();
              else setShowCreateForm(true);
            }}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة عقار
          </Button>
          <Button variant="outline" onClick={load} disabled={loading} size="sm" className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button variant="ghost" onClick={onSwitchToBuyer} size="sm" className="gap-1.5">
            عودة للمشتري
          </Button>
        </div>
      </div>

      {/* Create-listing modal */}
      <CreateListingForm
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        onCreated={load}
      />

      {/* Tabs */}
      {hasListings && (
        <div className="mb-6 inline-flex p-1 rounded-xl bg-secondary gap-1">
          <button
            onClick={() => setTab("listings")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === "listings"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4" />
            عقاراتي
            {listings.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-xs font-bold">
                {listings.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("requests")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === "requests"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Inbox className="w-4 h-4" />
            الطلبات الواردة
            {pendingMatches.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold animate-pulse">
                {pendingMatches.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Empty state: no listings yet → activate */}
      {!hasListings && (
        <Card className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Store className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            ليس لديك عقارات بعد
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            في بيئة الإنتاج، ستُنشئ عقارك عبر نموذج خاص. هنا في العرض التوضيحي،
            يمكننا تحويل أحد العقارات التجريبية إليك لتجربة تدفق البائع مباشرة.
          </p>
          <Button onClick={activateSellerMode} disabled={activating} className="gap-2">
            {activating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري التفعيل...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                فعّل وضع البائع التجريبي
              </>
            )}
          </Button>
        </Card>
      )}

      {/* ─── Listings tab ─── */}
      {hasListings && tab === "listings" && (
        <div className="space-y-4">
          {listings.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
                <Building2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                لا توجد عقارات معروضة
              </h3>
              <p className="text-sm text-muted-foreground">
                ابدأ بإضافة عقارك الأول لاستقبال طلبات المطابقة.
              </p>
            </Card>
          ) : (
            listings.map((l, i) => (
              <ListingCard key={l.id} listing={l} index={i} />
            ))
          )}
        </div>
      )}

      {/* ─── Requests tab ─── */}
      {hasListings && tab === "requests" && (
        <div className="space-y-4">
          {matches.length === 0 && !loading && (
            <Card className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                لا توجد طلبات حالياً
              </h3>
              <p className="text-sm text-muted-foreground">
                سيظهر هنا أي طلب فتح أو تفاوض من المشترين على عقاراتك.
              </p>
            </Card>
          )}

          {pendingMatches.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {pendingMatches.length}
                </span>
                بانتظار إجراءك
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingMatches.map((m, i) => (
                  <SellerMatchCard
                    key={m.matchId}
                    match={m}
                    index={i}
                    onApprove={approve}
                    onReject={reject}
                    onCounter={load}
                  />
                ))}
              </div>
            </div>
          )}

          {otherMatches.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                سجل الطلبات ({otherMatches.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {otherMatches.map((m, i) => (
                  <SellerMatchCard
                    key={m.matchId}
                    match={m}
                    index={i}
                    onApprove={approve}
                    onReject={reject}
                    onCounter={load}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
//  ListingCard — one of the seller's own listings
// ──────────────────────────────────────────────────────────────────
function ListingCard({ listing, index }: { listing: SellerListing; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const s = listing.stats;

  let parsedLocation: {
    city?: string;
    district?: string;
    street?: string;
    lat?: number;
    lng?: number;
  } = {};
  try {
    parsedLocation = JSON.parse(listing.location);
  } catch {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card className="overflow-hidden border-2">
        <div className="p-4 sm:p-5 border-b bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                  {INTENT_LABELS[listing.intent]}
                </Badge>
                <Badge variant="outline" className="font-medium">
                  {TYPE_LABELS[listing.type] || listing.type}
                </Badge>
                {listing.status === "ACTIVE" && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                    نشط
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm flex-wrap">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">{listing.city}</span>
                {listing.commune && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{listing.commune}</span>
                  </>
                )}
                {listing.district && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-muted-foreground">{listing.district}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-left flex-shrink-0">
              <div className="text-xs text-muted-foreground">السعر</div>
              <div className="text-xl font-bold text-foreground tabular-nums">
                {formatDZD(listing.price)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Listing stats */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg bg-secondary/60 py-2">
              <Maximize className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{listing.areaSqm}م²</div>
            </div>
            <div className="rounded-lg bg-secondary/60 py-2">
              <BedDouble className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{listing.bedrooms}</div>
            </div>
            <div className="rounded-lg bg-secondary/60 py-2">
              <Bath className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{listing.bathrooms}</div>
            </div>
            <div className="rounded-lg bg-secondary/60 py-2">
              <Phone className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{listing.parking}</div>
            </div>
          </div>

          {/* Match stats */}
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="إجمالي المطابقات" value={s.total} icon={<Eye className="w-3 h-3" />} />
            <StatBox label="بانتظارك" value={s.pending} icon={<Clock className="w-3 h-3" />} accent="amber" />
            <StatBox label="مقبولة" value={s.accepted} icon={<CheckCircle2 className="w-3 h-3" />} accent="emerald" />
            <StatBox label="مرفوضة" value={s.rejected} icon={<XCircle className="w-3 h-3" />} accent="muted" />
          </div>

          {/* Features */}
          {listing.features.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {listing.features.slice(0, 5).map((f) => (
                <Badge key={f} variant="outline" className="text-xs">
                  {f}
                </Badge>
              ))}
              {listing.features.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{listing.features.length - 5}
                </Badge>
              )}
            </div>
          )}

          {/* Expandable location */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition pt-1"
          >
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              العنوان الدقيق (مرئي لك فقط)
            </span>
            {expanded ? "إخفاء" : "عرض"}
          </button>
          {expanded && (
            <div className="rounded-lg bg-secondary/60 p-3 text-xs text-foreground space-y-1">
              <div>الشارع: {parsedLocation.street || "—"}</div>
              <div>
                الإحداثيات: {parsedLocation.lat?.toFixed(4) || "—"},{" "}
                {parsedLocation.lng?.toFixed(4) || "—"}
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function StatBox({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "amber" | "emerald" | "muted";
}) {
  const colors = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div className={`rounded-lg p-2 text-center ${accent ? colors[accent] : "bg-secondary/60"}`}>
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  SellerMatchCard — one match row from the seller's perspective
// ──────────────────────────────────────────────────────────────────
function SellerMatchCard({
  match,
  index,
  onApprove,
  onReject,
  onCounter,
}: {
  match: SellerMatch;
  index: number;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCounter: () => void;
}) {
  const [counterOffer, setCounterOffer] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const listingPrice = match.listing.askingPrice;
  const hasBuyerOffer = match.buyerOffer !== null && match.buyerOffer !== undefined;

  // New seller-first fee model states:
  // PROPOSED          → seller needs to pay fee + consent
  // BUYER_NOTIFIED    → seller done, waiting for buyer to pay
  // BUYER_FEE_PAID    → buyer paid, seller should confirm contact
  // EXPIRED / REFUNDED / REJECTED → closed
  const isAwaitingSellerFee = match.status === "PROPOSED";
  const isAwaitingSellerConfirm = match.status === "BUYER_FEE_PAID" && !match.sellerConfirmContact;
  const isAwaitingBuyer = match.status === "BUYER_NOTIFIED";
  const isCompleted = match.status === "BUYER_FEE_PAID" && match.sellerConfirmContact;
  const isClosed = ["EXPIRED", "REFUNDED", "REJECTED"].includes(match.status);

  // Legacy compat for old UI logic
  const isAwaitingSellerAction = isAwaitingSellerFee || isAwaitingSellerConfirm;
  const isAccepted = isCompleted;
  const isRejected = match.status === "REJECTED";

  async function submitCounter(accept: boolean) {
    setSubmitting(true);
    try {
      const body: { accept?: boolean; counterOffer?: number; note?: string } = {};
      if (accept) body.accept = true;
      else {
        const n = Number(counterOffer);
        if (!n || n < 10000) {
          toast({
            title: "عرض غير صالح",
            description: "الحد الأدنى 10,000 دج",
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
        body.counterOffer = n;
        if (note.trim()) body.note = note.trim();
      }
      const res = await fetch(
        `/api/seller/negotiation/${match.matchId}/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      toast({
        title: accept ? "تم القبول ✓" : "تم إرسال العرض المقابل",
        description: json.message,
      });
      setCounterOffer("");
      setNote("");
      onCounter();
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Card className={`overflow-hidden border-2 ${isAwaitingSellerAction ? "border-amber-500/40" : ""}`}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                  {INTENT_LABELS[match.listing.intent]}
                </Badge>
                <Badge variant="outline" className="font-medium">
                  {TYPE_LABELS[match.listing.type] || match.listing.type}
                </Badge>
                {isAccepted && (
                  <Badge className="bg-emerald-500 text-white border-0 gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    مكتمل
                  </Badge>
                )}
                {isRejected && (
                  <Badge variant="destructive" className="border-0 gap-1">
                    <XCircle className="w-3 h-3" />
                    مرفوض
                  </Badge>
                )}
                {isAwaitingSellerFee && (
                  <Badge className="bg-amber-500 text-white border-0 gap-1">
                    <Clock className="w-3 h-3" />
                    بانتظار دفعك
                  </Badge>
                )}
                {isAwaitingSellerConfirm && (
                  <Badge className="bg-amber-500 text-white border-0 gap-1">
                    <Clock className="w-3 h-3" />
                    أكد التواصل
                  </Badge>
                )}
                {isAwaitingBuyer && (
                  <Badge className="bg-blue-500 text-white border-0 gap-1">
                    <Clock className="w-3 h-3" />
                    بانتظار المشتري
                  </Badge>
                )}
                {match.status === "EXPIRED" && (
                  <Badge variant="outline" className="border-0 gap-1 text-muted-foreground">
                    <XCircle className="w-3 h-3" />
                    منتهي الصلاحية
                  </Badge>
                )}
                {match.status === "REFUNDED" && (
                  <Badge variant="outline" className="border-0 gap-1 text-muted-foreground">
                    <XCircle className="w-3 h-3" />
                    مسترد
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm flex-wrap">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">
                  {match.listing.city}
                </span>
                {match.listing.commune && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{match.listing.commune}</span>
                  </>
                )}
                {match.listing.district && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-muted-foreground">{match.listing.district}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white font-bold flex items-center justify-center text-base tabular-nums">
                {match.score}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">توافق</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Listing summary */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg bg-secondary/60 py-2">
              <Maximize className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{match.listing.areaSqm}م²</div>
            </div>
            <div className="rounded-lg bg-secondary/60 py-2">
              <BedDouble className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{match.listing.bedrooms}</div>
            </div>
            <div className="rounded-lg bg-secondary/60 py-2">
              <Bath className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{match.listing.bathrooms}</div>
            </div>
            <div className="rounded-lg bg-secondary/60 py-2">
              <TrendingUp className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <div className="font-bold tabular-nums">{match.rounds}</div>
            </div>
          </div>

          {/* Status banner */}
          {isAwaitingSellerAction && !hasBuyerOffer && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold text-foreground mb-0.5">
                  طلب فتح بيانات الاتصال
                </div>
                <div className="text-muted-foreground text-xs">
                  مشترٍ مهتم يطلب رؤية بياناتك. وافق ليكشف له العنوان والهاتف.
                </div>
              </div>
            </div>
          )}

          {hasBuyerOffer && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Handshake className="w-4 h-4" />
                <span className="text-sm font-semibold">عرض تفاوض</span>
              </div>
              <div className="text-sm text-muted-foreground mb-1">عرض المشتري:</div>
              <div className="text-2xl font-bold text-foreground tabular-nums mb-2">
                {formatDZD(match.buyerOffer)}
              </div>
              {match.sellerOffer !== null && (
                <div className="text-xs text-muted-foreground mb-2">
                  آخر عرض لك:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatDZD(match.sellerOffer)}
                  </span>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                سعر القائمة:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatDZD(listingPrice)}
                </span>
              </div>
            </div>
          )}

          {/* Counter-offer input */}
          {isAwaitingSellerAction && !isAccepted && !isRejected && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                عرض مقابل (دج)
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={counterOffer}
                  onChange={(e) => setCounterOffer(e.target.value)}
                  placeholder={String(Math.round(listingPrice * 0.98))}
                  className="h-12 tabular-nums flex-1"
                  disabled={submitting}
                />
                <Button
                  onClick={() => submitCounter(false)}
                  disabled={submitting || !counterOffer}
                  size="sm"
                  className="gap-1 min-h-[48px] min-w-[72px]"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Handshake className="w-3.5 h-3.5" />
                  )}
                  رد
                </Button>
              </div>
              {hasBuyerOffer && (
                <div className="flex gap-1.5">
                  {[0.95, 0.97, 1.0, 1.02].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setCounterOffer(String(Math.round(listingPrice * p)))
                      }
                      className="px-2 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/70 text-secondary-foreground transition"
                    >
                      {Math.round(p * 100)}%
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ملاحظة اختيارية للمشتري..."
                maxLength={500}
                rows={2}
                disabled={submitting}
              />
            </div>
          )}
        </div>

        {/* Actions — seller-first fee model */}
        {isAwaitingSellerFee && (
          <div className="p-4 sm:p-5 pt-0 space-y-3">
            {/* Seller fee prompt */}
            <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-semibold">رسم شفاف (يدفع البائع أولاً)</span>
              </div>
              <div className="text-2xl font-bold text-foreground tabular-nums mb-1">
                {match.sellerFee.toLocaleString("en-US")} دج
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                تدفع رسماً ثابتاً بدون عمولة. إن لم تستجب خلال 48 ساعة، يُلغى التطابق وينتقل المشتري للعرض التالي.
              </p>
              <Button
                onClick={() => onApprove(match.matchId)}
                disabled={submitting}
                className="gap-2 w-full bg-emerald-600 hover:bg-emerald-700 min-h-[48px]"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="text-sm sm:text-base">دفع الرسم + الموافقة</span>
              </Button>
            </div>
            <Button
              onClick={() => onReject(match.matchId)}
              variant="outline"
              disabled={submitting}
              className="gap-2 w-full text-destructive border-destructive/30 hover:bg-destructive/5 min-h-[48px]"
            >
              <XCircle className="w-4 h-4" />
              <span className="text-sm sm:text-base">رفض</span>
            </Button>
          </div>
        )}

        {isAwaitingSellerConfirm && (
          <div className="p-4 sm:p-5 pt-0 space-y-3">
            <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-semibold">المشتري دفع رسمه — أككد التواصل</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                لدى المشتري الحق في استرداد رسمه إن لم تؤكد التواصل خلال 48 ساعة. اضغط للتأكيد.
              </p>
              <Button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const res = await fetch(`/api/seller/matches/${match.matchId}/confirm-contact`, { method: "POST" });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json?.error);
                    toast({ title: "تم تأكيد التواصل ✓", description: json.message });
                    onCounter();
                  } catch (e) {
                    toast({ title: "خطأ", description: e instanceof Error ? e.message : "", variant: "destructive" });
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="gap-2 w-full bg-emerald-600 hover:bg-emerald-700 min-h-[48px]"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="text-sm sm:text-base">أكد التواصل مع المشتري</span>
              </Button>
            </div>
          </div>
        )}

        {isAwaitingBuyer && (
          <div className="p-4 sm:p-5 pt-0">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>بانتظار دفع المشتري لرسمه (48 ساعة).</p>
                <p className="text-xs mt-1 text-blue-600 dark:text-blue-500">تم إشعار المشتري تلقائياً برسالة تطالبه بدفع رسم الجدية لربط الاتصال.</p>
              </div>
            </div>
          </div>
        )}

        {isAccepted && (
          <div className="p-4 sm:p-5 pt-0">
            <DealCompletedCard matchId={match.matchId} role="SELLER" />
          </div>
        )}

        {isRejected && (
          <div className="p-4 sm:p-5 pt-0">
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              تم رفض الطلب.
            </div>
          </div>
        )}

        {(match.status === "EXPIRED" || match.status === "REFUNDED") && (
          <div className="p-4 sm:p-5 pt-0">
            <div className="rounded-lg bg-muted border border-border p-3 text-sm text-muted-foreground flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {match.status === "REFUNDED"
                ? "تم استرداد رسم المشتري — لم يتم تأكيد التواصل في الوقت المحدد."
                : "انتهت صلاحية المطابقة — انتقل المشتري للعرض التالي."}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
