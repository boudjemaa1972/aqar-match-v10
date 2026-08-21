"use client";

// BlindMatchCard — displays a matched listing with privacy preserved.
//
// Public (always visible): score %, type, city, district, price, area,
//   bedrooms, matched/missing features.
// Private (revealed after unlock/acceptance): exact address, contact,
//   photos.
//
// Actions:
//  • Unlock contact   → POST /api/match/[id]/unlock
//  • Negotiate        → opens NegotiationPanel
//  • Reject           → marks card as rejected locally

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Maximize,
  BedDouble,
  Bath,
  Car,
  Lock,
  Unlock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  XCircle,
  Phone,
  MessageCircle,
  Map,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDZD, scoreColor, scoreBg } from "./store";
import { NegotiationPanel } from "./NegotiationPanel";
import { INTENT_LABELS, TYPE_LABELS, type BlindMatch } from "@/lib/schemas";

interface Props {
  match: BlindMatch;
  index: number;
  onReject: (matchId: string) => void;
}

interface RevealedData {
  contact: string;
  location: string;
  photos: string[];
}

export function BlindMatchCard({ match, index, onReject }: Props) {
  const [revealed, setRevealed] = useState<RevealedData | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [awaitingSeller, setAwaitingSeller] = useState(false);
  const [sellerOffer, setSellerOffer] = useState<number | null>(null);
  const [rejectedBySeller, setRejectedBySeller] = useState(false);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [rejected, setRejected] = useState(false);
  const { toast } = useToast();

  // ── On mount: check current match status ──────────────────────
  // If the buyer already requested unlock in a previous session,
  // restore the correct UI state (awaiting, accepted, or rejected).
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/match/${match.matchId}/status`);
        if (!res.ok) return;
        const json = await res.json();
        if (stop) return;

        if (json.status === "ACCEPTED" && json.revealed) {
          setRevealed({
            contact: json.contact,
            location: json.location,
            photos: json.photos || [],
          });
        } else if (json.status === "REJECTED") {
          setRejectedBySeller(true);
        } else if (
          json.status === "UNLOCK_REQ" ||
          json.buyerConsent === true
        ) {
          setAwaitingSeller(true);
        }
      } catch {}
    })();
    return () => {
      stop = true;
    };
  }, [match.matchId]);

  // ── Poll for seller decision once buyer requested unlock ──────
  useEffect(() => {
    if (!awaitingSeller) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/match/${match.matchId}/status`);
        if (!res.ok) return;
        const json = await res.json();
        if (stop) return;

        if (json.status === "ACCEPTED" && json.revealed) {
          setRevealed({
            contact: json.contact,
            location: json.location,
            photos: json.photos || [],
          });
          setAwaitingSeller(false);
          toast({
            title: "وافق البائع! ✓",
            description: "تم فتح بيانات الاتصال. يمكنك التواصل مباشرة الآن.",
          });
        } else if (json.status === "REJECTED") {
          setRejectedBySeller(true);
          setAwaitingSeller(false);
          toast({
            title: "اعتذر البائع",
            description: "لم يقبل البائع طلب الفتح.",
            variant: "destructive",
          });
        } else if (json.sellerOffer !== null && json.sellerOffer !== undefined) {
          setSellerOffer(json.sellerOffer);
        }
      } catch {}
    };
    const interval = setInterval(poll, 2500);
    poll();
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, [awaitingSeller, match.matchId, toast]);

  if (rejected) return null;

  async function handleUnlock() {
    setUnlocking(true);
    try {
      const res = await fetch(`/api/match/${match.matchId}/unlock`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "فشل الفتح");

      if (json.revealed) {
        setRevealed({
          contact: json.contact,
          location: json.location,
          photos: json.photos || [],
        });
        toast({
          title: "تم فتح بيانات الاتصال ✓",
          description: "وافق البائع — يمكنك التواصل مباشرة مع المالك.",
        });
      } else {
        // Pending — start polling
        setAwaitingSeller(true);
        toast({
          title: "تم إرسال طلب الفتح",
          description: json.message,
        });
      }
    } catch (e) {
      toast({
        title: "تعذّر الفتح",
        description: e instanceof Error ? e.message : "خطأ غير معروف",
        variant: "destructive",
      });
    } finally {
      setUnlocking(false);
    }
  }

  function handleReject() {
    setRejected(true);
    onReject(match.matchId);
    toast({
      title: "تم استبعاد هذا العرض",
      description: "لن يظهر مرة أخرى في نتائجك.",
    });
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08 }}
      >
        <Card className="overflow-hidden border-2 hover:border-primary/30 transition-all">
          {/* Top — score + intent */}
          <div className="relative p-4 sm:p-5 border-b bg-gradient-to-l from-primary/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary border-0"
                  >
                    {INTENT_LABELS[match.intent]}
                  </Badge>
                  <Badge variant="outline" className="font-medium">
                    {TYPE_LABELS[match.type]}
                  </Badge>
                  {revealed && (
                    <Badge className="bg-emerald-500 text-white border-0 gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      مكشوف
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm flex-wrap">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">
                    {match.city}
                  </span>
                  {match.commune && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{match.commune}</span>
                    </>
                  )}
                  {match.district && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">{match.district}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Score ring */}
              <div className="flex-shrink-0 text-center">
                <div
                  className={`relative w-14 h-14 rounded-full flex items-center justify-center ${scoreBg(
                    match.score,
                  )} text-white font-bold`}
                >
                  <span className="text-lg tabular-nums">{match.score}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  نسبة التوافق
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">السعر</div>
                <div className="text-2xl font-bold text-foreground tabular-nums">
                  {formatDZD(match.askingPrice ?? 0)}
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground mb-0.5">المساحة</div>
                <div className="text-lg font-semibold text-foreground tabular-nums">
                  {match.areaSqm} م²
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary/60 py-2">
                <BedDouble className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <div className="text-sm font-bold tabular-nums">
                  {match.bedrooms === 0 ? "—" : match.bedrooms}
                </div>
                <div className="text-[10px] text-muted-foreground">غرف</div>
              </div>
              <div className="rounded-lg bg-secondary/60 py-2">
                <Bath className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <div className="text-sm font-bold tabular-nums">
                  {match.bathrooms}
                </div>
                <div className="text-[10px] text-muted-foreground">حمامات</div>
              </div>
              <div className="rounded-lg bg-secondary/60 py-2">
                <Car className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <div className="text-sm font-bold tabular-nums">
                  —
                </div>
                <div className="text-[10px] text-muted-foreground">مواقف</div>
              </div>
            </div>

            {/* Features — currently no matchedFeatures field in BlindMatch schema.
                Placeholder until schema is extended. */}

            {/* Breakdown expandable */}
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition pt-1"
            >
              <span>تفاصيل درجة التوافق</span>
              {showBreakdown ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showBreakdown && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-1.5 pt-2 border-t"
              >
                <BreakdownRow
                  label="الميزانية"
                  value={(match as any).breakdown?.budget}
                  max={35}
                />
                <BreakdownRow
                  label="المساحة"
                  value={(match as any).breakdown?.area}
                  max={15}
                />
                <BreakdownRow
                  label="غرف النوم"
                  value={(match as any).breakdown?.bedrooms}
                  max={15}
                />
                <BreakdownRow
                  label="الحمامات"
                  value={(match as any).breakdown?.bathrooms}
                  max={10}
                />
                <BreakdownRow
                  label="المواقف"
                  value={(match as any).breakdown?.parking}
                  max={5}
                />
                <BreakdownRow
                  label="المزايا"
                  value={(match as any).breakdown?.features}
                  max={15}
                />
                <BreakdownRow
                  label="الموقع"
                  value={(match as any).breakdown?.location}
                  max={5}
                />
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 sm:p-5 pt-0 flex flex-col gap-2">
            {!revealed && !rejectedBySeller ? (
              <>
                {awaitingSeller ? (
                  // Awaiting seller — show pending state with hint
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span className="text-sm font-semibold">
                        في انتظار موافقة البائع
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      طلبك مُرسل. يمكنك التبديل إلى &laquo;وضع البائع&raquo; في
                      الأعلى للموافقة يدوياً (لأغراض العرض التوضيحي).
                    </p>
                    {sellerOffer !== null && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        رد البائع بعرض مقابل:{" "}
                        <span className="font-bold tabular-nums text-foreground">
                          {formatDZD(sellerOffer)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    onClick={handleUnlock}
                    disabled={unlocking}
                    className="w-full gap-2"
                    size="lg"
                  >
                    <Unlock className="w-4 h-4" />
                    {unlocking ? "جاري الإرسال..." : "اطلب فتح بيانات الاتصال"}
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setShowNegotiation(true)}
                    variant="outline"
                    className="gap-1.5"
                    disabled={awaitingSeller}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    تفاوض مغلق
                  </Button>
                  <Button
                    onClick={handleReject}
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    استبعاد
                  </Button>
                </div>
              </>
            ) : revealed ? (
              <RevealedContact contact={revealed.contact} location={revealed.location} />
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">اعتذر البائع</div>
                  <div className="text-sm text-muted-foreground">
                    لم يوافق البائع على كشف بيانات الاتصال لهذه المطابقة.
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Negotiation dialog */}
      <Dialog open={showNegotiation} onOpenChange={setShowNegotiation}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>التفاوض المغلق</DialogTitle>
            <DialogDescription>
              قدّم عرضك على السعر — البائع يرى العرض دون كشف هويتك. عند التوافق
              (فرق ≤ 2%) تُفتح بيانات الاتصال تلقائياً.
            </DialogDescription>
          </DialogHeader>
          <NegotiationPanel
            matchId={match.matchId}
            listingPrice={match.askingPrice ?? 0}
            onAgreed={() => {
              setShowNegotiation(false);
              handleUnlock();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function BreakdownRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number | undefined;
  max: number;
}) {
  if (value === undefined) return null;
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBg(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-left tabular-nums text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

function RevealedContact({
  contact,
  location,
}: {
  contact: string;
  location: string;
}) {
  let parsedContact: { phone?: string; whatsapp?: string; email?: string } = {};
  let parsedLocation: {
    city?: string;
    district?: string;
    street?: string;
    lat?: number;
    lng?: number;
  } = {};
  try {
    parsedContact = JSON.parse(contact);
  } catch {}
  try {
    parsedLocation = JSON.parse(location);
  } catch {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-sm font-semibold">بيانات الاتصال مفتوحة</span>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-sm">
          <Map className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <div className="text-xs text-muted-foreground">العنوان الدقيق</div>
            <div className="font-medium text-foreground">
              {parsedLocation.street || "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {parsedLocation.city} · {parsedLocation.district}
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-2">
          {parsedContact.phone && (
            <a
              href={`tel:${parsedContact.phone}`}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 transition"
            >
              <Phone className="w-4 h-4" />
              اتصال
            </a>
          )}
          {parsedContact.whatsapp && (
            <a
              href={`https://wa.me/${parsedContact.whatsapp.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-white py-2 text-sm font-medium hover:opacity-90 transition"
            >
              <MessageCircle className="w-4 h-4" />
              واتساب
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
