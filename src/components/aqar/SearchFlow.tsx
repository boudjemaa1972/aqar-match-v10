"use client";

// ──────────────────────────────────────────────────────────────────
//  SearchFlow — 5-step buyer flow with two-stage matching:
//   1. Buy/rent intent
//   2. Property type (6 types with icons)
//   3. Location (wilaya + optional commune + optional neighbourhood)
//   4. Max budget (secret, encrypted)
//   5. Contact info + summary → START MATCHING
//
//  After step 3, runs STAGE 1 match (general criteria) to check if any
//  listings exist. If yes, asks for budget + contact → STAGE 2 (final
//  match including budget). Shows fee prompt before revealing details.
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Store, TreePine, Sprout, KeyRound,
  ChevronLeft, ChevronRight, Lock, Loader2, CheckCircle2,
  AlertCircle, Sparkles, ArrowLeft, ShieldCheck, MapPin, User, Phone, Info, Clock, Sun, Calendar, Calculator,
  Image as ImageIcon, LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { InlineMap } from "@/components/aqar/InlineMap";
import { MissingFieldsHelper } from "@/components/aqar/MissingFieldsHelper";
import { SearchVerifyGate } from "@/components/aqar/SearchVerifyGate";
import { LocationPicker, type PickedLocation } from "@/components/aqar/LocationPicker";
import { LeafletMapPicker } from "@/components/aqar/LeafletMapPicker";
import {
  WILAYAS, COMMUNES_BY_WILAYA,
  normalizeWilaya,
  getAskingPriceFloor,
  RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT,
  type PropertyType, type PropertyIntent,
} from "@/lib/schemas";

interface Props {
  onBackHome: () => void;
  onGoToDashboard?: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;
type MatchPhase = "form" | "matching" | "noResults" | "found" | "confirmed" | "cancelled";

interface MatchResult {
  matchId: string;
  score: number;
  type: PropertyType;
  city: string;
  commune: string | null;
  askingPrice: number;
  coverPhoto?: string | null; // PUBLIC — one exterior photo to entice buyer
  // SEASONAL_RENT public fields:
  pricePerNight?: number | null;
  minStayNights?: number | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  areaSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  legalStatus: string | null;
  urbanPermitStatus?: string | null;
  offerTitle?: string;
  buyerFee: number;
  sellerFee: number;
  queueSize?: number;
  queueRank?: number;
  revealed: boolean;
  // ⚠️ secretMinPrice AND secretMinPricePerNight are NEVER part of
  // this interface. The buyer cannot learn the seller's reserve, ever.
}

export function SearchFlow({ onBackHome, onGoToDashboard }: Props) {
  const { t, dir } = useI18n();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<MatchPhase>("form");
  const [stage1Checking, setStage1Checking] = useState(false);
  const [stage2Matching, setStage2Matching] = useState(false);
  const [paying, setPaying] = useState(false);
  // Phone verification status — step 5 is valid only when this is true.
  // Set by PhoneAuthGate's onVerified callback.
  const [phoneVerified, setPhoneVerified] = useState(false);
  // Revealed contact/geo/photos after buyer pays (BUYER_FEE_PAID state)
  const [revealedContact, setRevealedContact] = useState<string | null>(null);
  const [revealedLocation, setRevealedLocation] = useState<string | null>(null);
  const [revealedGeo, setRevealedGeo] = useState<{ lat: number; lng: number; accuracy?: number | null } | null>(null);
  const [revealedPhotos, setRevealedPhotos] = useState<string[]>([]);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [sellerReady, setSellerReady] = useState(false); // becomes true when seller pays+consents
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Step 1
  const [intent, setIntent] = useState<PropertyIntent | "">("");
  // Step 2
  const [type, setType] = useState<PropertyType | "">("");
  // Step 3
  const [city, setCity] = useState("");
  const [commune, setCommune] = useState("");
  const [district, setDistrict] = useState("");
  // Step 4
  const [maxBudget, setMaxBudget] = useState("");
  // SEASONAL_RENT only
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  // Step 5
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // ── LocationPicker state (optional — buyer's reference point) ──
  // If the buyer picks a precise location via the map, it's encrypted
  // server-side and used ONLY for geoProximity scoring. NEVER shown
  // to any seller — not even after the deal closes.
  const [searchLat, setSearchLat] = useState<number | null>(null);
  const [searchLng, setSearchLng] = useState<number | null>(null);

  // ── Check if Google Maps API key is configured ──────────────
  // When false, the LocationPicker is hidden entirely — the manual
  // dropdowns (wilaya/commune/district) are the primary path.
  // This prevents showing a confusing "map unavailable" fallback.
  const hasMapsApiKey = !!(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined);

  const communes = city ? COMMUNES_BY_WILAYA[city as keyof typeof COMMUNES_BY_WILAYA] || [] : [];

  // ── Pre-fill from URL params (when navigating from MapSearchView match button) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mi = params.get("matchIntent") as PropertyIntent | null;
    const mt = params.get("matchType") as PropertyType | null;
    const mc = params.get("matchCity");
    const mco = params.get("matchCommune");
    const md = params.get("matchDistrict");
    if (mi) setIntent(mi);
    if (mt) setType(mt);
    if (mc) setCity(mc);
    if (mco) setCommune(mco);
    if (md) setDistrict(md);
    // If all criteria are pre-filled, jump to step 4 (budget)
    if (mi && mt && mc) {
      setStep(4);
    } else if (mi && mt) {
      setStep(3);
    } else if (mi) {
      setStep(2);
    }
    // Clean up URL params
    if (mi || mt || mc) {
      const url = new URL(window.location.href);
      url.searchParams.delete("matchIntent");
      url.searchParams.delete("matchType");
      url.searchParams.delete("matchCity");
      url.searchParams.delete("matchCommune");
      url.searchParams.delete("matchDistrict");
      window.history.replaceState({}, "", url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const step1Valid = !!intent;
  const step2Valid = !!type;
  const step3Valid = !!city; // commune optional for broad search
  // Budget validation — uses the SAME intent-based floor as the seller's
  // askingPrice floor. A buyer searching for SELL must have a budget ≥ 1M
  // (otherwise no SELL listing can match), and RENT ≥ 3,000.
  // SEASONAL_RENT uses per-night floor.
  const step4Valid = intent === "SEASONAL_RENT"
    ? !!maxBudget && Number(maxBudget) >= RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT && !!checkIn && !!checkOut && new Date(checkOut) > new Date(checkIn)
    : !!intent && !!maxBudget && Number(maxBudget) >= getAskingPriceFloor(intent as PropertyIntent);
  const step5Valid = phoneVerified && fullName.length >= 3;
  const canAdvance = step === 1 ? step1Valid : step === 2 ? step2Valid : step === 3 ? step3Valid : step === 4 ? step4Valid : step5Valid;

  // ── Compute missing-field labels for the current step ────────
  const missingFields: string[] = (() => {
    if (step === 1) {
      const m: string[] = [];
      if (!intent) m.push(t("publish.transactionType"));
      return m;
    }
    if (step === 2) {
      const m: string[] = [];
      if (!type) m.push(t("publish.propertyType"));
      return m;
    }
    if (step === 3) {
      const m: string[] = [];
      if (!city) m.push(t("publish.wilaya"));
      return m;
    }
    if (step === 4) {
      const m: string[] = [];
      if (intent === "SEASONAL_RENT") {
        if (!maxBudget) m.push(t("search.budgetQuestion"));
        if (maxBudget && Number(maxBudget) < RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT) {
          m.push(`≥ ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT.toLocaleString()} دج/ليلة`);
        }
        if (!checkIn) m.push(t("seasonal.checkIn"));
        if (!checkOut) m.push(t("seasonal.checkOut"));
        if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
          m.push("تاريخ المغادرة بعد الوصول");
        }
      } else {
        if (!intent) m.push(t("publish.transactionType"));
        if (!maxBudget) m.push(t("search.budgetQuestion"));
        if (intent && maxBudget && Number(maxBudget) < getAskingPriceFloor(intent as PropertyIntent)) {
          m.push(`≥ ${getAskingPriceFloor(intent as PropertyIntent).toLocaleString()} دج`);
        }
      }
      return m;
    }
    if (step === 5) {
      const m: string[] = [];
      if (!phoneVerified) m.push(t("phoneGate.title"));
      if (phoneVerified && fullName.length < 3) m.push(t("search.fullName"));
      return m;
    }
    return [];
  })();

  const stepLabels = ["1", "2", "3", "4", "5"];

  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;

  // ── Poll match status when in "found" phase ───────────────────
  // The buyer needs to know when the seller has paid + consented
  // (status transitions to BUYER_NOTIFIED) so they can pay their fee.
  useEffect(() => {
    if (phase !== "found" || !match) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/match/${match.matchId}/status`);
        if (!res.ok) return;
        const json = await res.json();
        if (stop) return;
        // BUYER_NOTIFIED means seller paid + consented → buyer can now pay
        if (json.status === "BUYER_NOTIFIED") {
          setSellerReady(true);
        } else if (json.status === "BUYER_FEE_PAID") {
          // Already paid (shouldn't happen in this flow, but defensive)
          setSellerReady(true);
          setPhase("confirmed");
        } else if (json.status === "EXPIRED" || json.status === "REFUNDED") {
          setPhase("noResults");
        }
      } catch {}
    };
    const interval = setInterval(poll, 3000);
    poll();
    return () => { stop = true; clearInterval(interval); };
  }, [phase, match]);

  // ── On step 3 → 4 transition: run STAGE 1 match ───────────────
  async function handleStep3Next() {
    setStage1Checking(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: 1, intent, type, city, commune: commune || null, district: district || null }),
      });
      // ── Parse JSON safely — server may return HTML on hard errors ──
      let json: { stage1HasMatches?: boolean; error?: string } | null = null;
      const text = await res.text();
      if (text) {
        try { json = JSON.parse(text); } catch { json = null; }
      }
      if (!res.ok) {
        throw new Error(json?.error || (res.status === 401 ? "يجب تسجيل الدخول للمتابعة" : "فشل البحث"));
      }
      if (json?.stage1HasMatches) {
        // proceed to step 4 (budget)
        setStep(4);
      } else {
        setPhase("noResults");
      }
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setStage1Checking(false);
    }
  }

  // ── Final: START MATCHING (stage 2) ────────────────────────────
  async function handleStartMatching() {
    setPhase("matching");
    setStage2Matching(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: 2,
          intent, type, city,
          commune: commune || null,
          district: district || null,
          maxBudget: Number(maxBudget),
          fullName, phone,
          // Buyer's reference point from LocationPicker (optional).
          // Encrypted server-side → used ONLY for geoProximity scoring.
          // NEVER shown to any seller, even after deal closure.
          // NOTE: omit fields when no coords — Zod schema is `.optional()`
          // which accepts undefined but rejects null.
          ...(searchLat !== null ? { latitude: searchLat } : {}),
          ...(searchLng !== null ? { longitude: searchLng } : {}),
          checkIn: intent === "SEASONAL_RENT" ? checkIn : undefined,
          checkOut: intent === "SEASONAL_RENT" ? checkOut : undefined,
        }),
      });
      // ── Parse JSON safely — same pattern as handleStep3Next ──
      let json: { matches?: unknown[]; error?: string; requestRef?: string } | null = null;
      const text = await res.text();
      if (text) {
        try { json = JSON.parse(text); } catch { json = null; }
      }
      if (!res.ok) {
        throw new Error(json?.error || (res.status === 401 ? "يجب تسجيل الدخول للمتابعة" : "فشل المطابقة"));
      }
      // Simulate engine delay for UX
      setTimeout(() => {
        if (json?.matches && json.matches.length > 0) {
          // Type assertion needed because json is typed as nullable
          setMatch(json.matches[0] as MatchResult);
          setPhase("found");
        } else {
          setPhase("noResults");
        }
        setStage2Matching(false);
      }, 1800);
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
      setPhase("form");
      setStage2Matching(false);
    }
  }

  // ── Pay fee to reveal ──────────────────────────────────────────
  async function handlePayFee() {
    if (!match) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/match/${match.matchId}/pay-fee`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      // Store revealed data for the confirmed screen
      setRevealedContact(json.contact || null);
      setRevealedLocation(json.location || null);
      setRevealedGeo(json.geoLocation || null);
      setRevealedPhotos(json.photos || []);
      setPhase("confirmed");
    } catch (e) {
      toast({
        title: "فشل الدفع",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  }

  // ── Reject match (feedback loop) ──────────────────────────────
  // Records the rejection reason → adjusts user's weight profile
  // → platform becomes smarter for future searches.
  async function handleReject() {
    if (!match || !rejectReason) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/match/${match.matchId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      toast({
        title: t("match.reject.thanks"),
        description: json.weightShift
          ? `تم تعديل الأوزان: الموقع ${json.weightShift.after.location}% | السعر ${json.weightShift.after.price}% | المواصفات ${json.weightShift.after.features}%`
          : "",
      });
      setShowRejectModal(false);
      setRejectReason("");
      setPhase("cancelled");
    } catch (e) {
      toast({
        title: "خطأ",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  }

  function handleNext() {
    if (step === 3) {
      handleStep3Next();
      return;
    }
    if (step < 5) setStep((s) => (s + 1) as Step);
  }

  // ── Matching screen ────────────────────────────────────────────
  if (phase === "matching") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="relative w-48 h-48 mb-8">
          <motion.div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
          </motion.div>
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20 animate-orbit">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary shadow-lg" />
          </div>
          <div className="absolute inset-4 rounded-full border border-accent/30 animate-orbit-reverse">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent" />
          </div>
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-lg font-bold text-foreground mb-1">المحرك السري يعمل</motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-sm text-muted-foreground">يطابق معاييرك مع عقارات البائعين...</motion.p>
      </div>
    );
  }

  // ── No results ─────────────────────────────────────────────────
  if (phase === "noResults") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">{t("match.noResults.title")}</h2>
        <p className="text-muted-foreground mb-2">{t("match.noResults.desc")}</p>
        <p className="text-sm text-muted-foreground mb-8">{t("match.noResults.hint")}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mb-3">
          <Button onClick={() => { setPhase("form"); setStep(1); setIntent(""); setType(""); setCity(""); setCommune(""); setDistrict(""); setMaxBudget(""); }} className="gap-2">{t("match.newSearch")}</Button>
          <Button variant="outline" onClick={() => setStep(4)} className="gap-2">{t("match.editBudget")}</Button>
        </div>
        <Button variant="ghost" onClick={onBackHome}>{t("search.backHome")}</Button>
      </div>
    );
  }

  // ── Found a match — seller-first flow ──────────────────────────
  // The buyer sees the match, but CANNOT pay yet. They must wait for
  // the seller to pay + consent first (status transitions from
  // PROPOSED → BUYER_NOTIFIED). The buyer polls /status to know when.
  if (phase === "found" && match) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-6">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 mb-3">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </motion.div>
          <h2 className="text-2xl font-bold text-foreground mb-1">{t("match.found.title")}</h2>
          <p className="text-muted-foreground">{t("match.found.desc")}</p>
          {match.queueSize && match.queueSize > 1 && (
            <p className="text-xs text-muted-foreground mt-2">
              {t("match.found.queueSize", { n: match.queueSize })}
            </p>
          )}
        </div>

        {/* Blind card — with cover photo to entice buyer */}
        <Card className="p-0 mb-5 overflow-hidden">
          {/* Cover photo — PUBLIC, visible before payment */}
          {match.coverPhoto && (
            <div className="relative w-full h-48 sm:h-56 overflow-hidden">
              <Image
                src={match.coverPhoto}
                alt={match.offerTitle || "عقار مطابق"}
                fill
                sizes="(max-width: 640px) 100vw, 500px"
                className="object-cover"
                priority
              />
              {/* Gradient overlay for score badge readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              {/* Score badge over photo */}
              <div className="absolute top-3 right-3 ltr:left-3 ltr:right-auto">
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/90 backdrop-blur px-3 py-1.5 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span className="text-xs font-bold text-white">{t("match.strongMatch")}</span>
                  <span className="text-sm font-extrabold text-white tabular-nums">{match.score}%</span>
                </div>
              </div>
              {/* Offer title over photo bottom */}
              {match.offerTitle && (
                <div className="absolute bottom-3 right-3 left-3 ltr:left-3 ltr:right-3">
                  <p className="text-sm font-bold text-white line-clamp-1 drop-shadow-lg">
                    {match.offerTitle}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Fallback if no cover photo */}
          {!match.coverPhoto && (
            <div className="flex items-center justify-between p-4">
              <Badge intent={intent} type={match.type} />
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">{t("match.strongMatch")}</span>
                <span className="font-bold text-emerald-700 tabular-nums">{match.score}%</span>
              </div>
            </div>
          )}

          {/* Card body — details below photo */}
          <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <Badge intent={intent} type={match.type} />
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700">{t("match.strongMatch")}</span>
              <span className="font-bold text-emerald-700 tabular-nums">{match.score}%</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground">{match.city}</span>
            {match.commune && <><span>·</span><span>{match.commune}</span></>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label={t("match.areaApprox")} value={`${match.areaSqm} م²`} />
            {match.bedrooms !== null && <Detail label={t("match.rooms")} value={String(match.bedrooms)} />}
            {match.bathrooms !== null && <Detail label={t("match.bathrooms")} value={String(match.bathrooms)} />}
            {match.legalStatus && <Detail label={t("match.legalStatus")} value={t(`legal.${match.legalStatus}`)} />}
            {match.urbanPermitStatus && <Detail label={t("match.urbanPermitStatus")} value={t(`urbanPermit.${match.urbanPermitStatus}`)} />}
          </div>
          {/* PUBLIC price — shown from the start */}
          <div className="mt-4 pt-4 border-t">
            {match.pricePerNight ? (
              <>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Sun className="w-3 h-3 text-gold" />
                  {t("seasonal.pricePerNight")}
                </div>
                <div className="text-2xl font-bold text-foreground tabular-nums">
                  {match.pricePerNight.toLocaleString("en-US")} {t("common.currency")}
                  <span className="text-sm font-normal text-muted-foreground mr-1">{t("seasonal.perNight")}</span>
                </div>
                {match.minStayNights && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {t("seasonal.minStay")}: {match.minStayNights} {t("seasonal.nights")}
                  </div>
                )}
                {match.availableFrom && match.availableTo && (
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t("seasonal.availableRange")}:{" "}
                    {new Date(match.availableFrom).toLocaleDateString("ar")} —{" "}
                    {new Date(match.availableTo).toLocaleDateString("ar")}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground mb-1">السعر المطلوب</div>
                <div className="text-2xl font-bold text-foreground tabular-nums">
                  {match.askingPrice.toLocaleString("en-US")} {t("common.currency")}
                </div>
              </>
            )}
            {/* ⚠️ secretMinPrice AND secretMinPricePerNight are NEVER shown
                here. The buyer cannot learn the seller's reserve, by design. */}
          </div>
          </div>
        </Card>

        {/* Seller-first flow status — changes when seller pays+consents */}
        {sellerReady ? (
          // ── Seller has paid + consented → buyer can now pay ──
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="p-5 mb-5 border-2 border-emerald-500/40 bg-emerald-500/5">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-bold">{t("match.found.sellerReady")}</span>
              </div>
              <p className="text-sm text-foreground mb-3 font-medium">{t("match.found.payNowPrompt")}</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{t("match.found.buyerFee")}</span>
                <span className="text-2xl font-bold text-foreground tabular-nums">{match.buyerFee.toLocaleString("en-US")} {t("common.currency")}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("match.found.feeNote")}</p>
              <a href="/?view=home#fee-calculator" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                <Calculator className="w-3.5 h-3.5" />
                {t("feeCalc.learnMore")}
              </a>
            </Card>
          </motion.div>
        ) : (
          // ── Waiting for seller to pay+consent ──
          <Card className="p-5 mb-5 border-2 border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-semibold">{t("match.found.waitingSeller")}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{t("match.found.sellerFirstDesc")}</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{t("match.found.buyerFee")}</span>
              <span className="text-2xl font-bold text-foreground tabular-nums">{match.buyerFee.toLocaleString("en-US")} {t("common.currency")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("match.found.feeNote")}</p>
              <a href="/?view=home#fee-calculator" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                <Calculator className="w-3.5 h-3.5" />
                {t("feeCalc.learnMore")}
              </a>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handlePayFee}
            disabled={paying || !sellerReady}
            className={`gap-2 flex-1 bg-gold hover:bg-gold/90 disabled:opacity-50 min-h-[52px] ${
              sellerReady ? "ring-2 ring-gold/40 animate-pulse" : ""
            }`}
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {sellerReady ? t("match.found.pay") : t("match.found.waiting")}
          </Button>
          <Button variant="outline" onClick={() => setStep(4)} className="gap-2">{t("match.found.editSearch")}</Button>
          <Button variant="ghost" onClick={() => setPhase("cancelled")} className="gap-2">{t("match.found.cancel")}</Button>
        </div>

        {/* "This doesn't suit me" — feedback loop trigger */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowRejectModal(true)}
            className="text-xs text-muted-foreground hover:text-destructive transition underline"
          >
            {t("match.found.notForMe")}
          </button>
        </div>

        {/* Rejection modal */}
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-2xl border-2 border-border max-w-md w-full p-5 space-y-4">
              <h3 className="text-lg font-bold text-foreground">{t("match.found.whyReject")}</h3>
              <div className="space-y-2">
                {[
                  "PRICE_TOO_HIGH", "LOCATION_NOT_IDEAL", "TOO_FEW_ROOMS",
                  "TOO_MANY_ROOMS", "AREA_TOO_SMALL", "AREA_TOO_LARGE",
                  "LEGAL_STATUS_WEAK", "DATES_NOT_AVAILABLE", "OTHER",
                ].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRejectReason(r)}
                    className={`w-full text-right rounded-lg border-2 px-4 py-3 text-sm font-medium transition ${
                      rejectReason === r
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {t(`match.reject.${r}`)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                  className="flex-1"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={!rejectReason || rejecting}
                  className="flex-1 gap-2 bg-destructive text-white hover:bg-destructive/90"
                >
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t("match.reject.submit")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Confirmed — contact + geo + photos revealed ───────────────
  if (phase === "confirmed") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/15 mb-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t("match.confirmed.title")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("match.confirmed.desc")}</p>
        </motion.div>

        <div className="space-y-6">
          {/* ── Contact info ── */}
          {revealedContact && (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" />
                {t("match.revealedContact")}
              </h3>
              <div className="space-y-1.5">
                {(() => {
                  try {
                    const c = JSON.parse(revealedContact);
                    return (
                      <>
                        {c.fullName && (
                          <p className="text-sm text-foreground">
                            <span className="text-muted-foreground">{t("search.fullName")}:</span>{" "}
                            <span className="font-medium">{c.fullName}</span>
                          </p>
                        )}
                        {c.phone && (
                          <p className="text-sm text-foreground" dir="ltr">
                            <span className="text-muted-foreground" dir={dir}>{t("search.phone")}:</span>{" "}
                            <a href={`tel:${c.phone}`} className="font-mono font-medium text-primary hover:underline">
                              {c.phone}
                            </a>
                            {"  "}
                            <a
                              href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                            >
                              WhatsApp ↗
                            </a>
                          </p>
                        )}
                      </>
                    );
                  } catch {
                    // Plain string fallback
                    return (
                      <p className="text-sm text-foreground font-mono" dir="ltr">{revealedContact}</p>
                    );
                  }
                })()}
              </div>
            </div>
          )}

          {/* ── Inline map (GPS) ── */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {t("match.revealedLocation")}
            </h3>
            <InlineMap geo={revealedGeo} label={revealedLocation || undefined} />
          </div>

          {/* ── Photos (if any) ── */}
          {revealedPhotos.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                {t("match.revealedPhotos")}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {revealedPhotos.slice(0, 6).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`صورة ${i + 1}`}
                    className="w-full h-24 sm:h-32 object-cover rounded-lg border border-border"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          {onGoToDashboard && (
            <Button onClick={onGoToDashboard} className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              {t("buyer.dashboard.matches.continueInDashboard")}
            </Button>
          )}
          <Button onClick={onBackHome} variant="outline" className="gap-2">
            {t("search.backHome")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "cancelled") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">تم الإلغاء</h2>
        <p className="text-muted-foreground mb-8">{t("match.cancelled")}</p>
        <Button onClick={onBackHome} className="gap-2">{t("search.backHome")}</Button>
      </div>
    );
  }

  // ── Form (steps 1-5) ───────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-32 sm:pb-24">
      {/* Mobile sticky progress bar */}
      <div className="md:hidden sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground">{t("search.title")}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{step} / 5</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
      </div>

      <button onClick={onBackHome} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> {t("search.backHome")}
      </button>
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-1">{t("search.title")}</h1>
      <p className="text-muted-foreground text-xs sm:text-sm mb-6">{t("search.subtitle")}</p>

      {/* Steps breadcrumb — desktop only */}
      <div className="hidden md:flex items-center gap-2 mb-8">
        {stepLabels.map((num, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500/15 text-emerald-700" : "bg-secondary text-muted-foreground"
              }`}>{done ? "✓" : num}</div>
              {i < stepLabels.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>

          {/* ─── Step 1: Buy/rent/seasonal ─── */}
          {step === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4 text-center">{t("search.step1")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
                <TypeButton active={intent === "SELL"} onClick={() => { setIntent("SELL"); setType(""); }} label={t("search.buy")} icon={Home} />
                <TypeButton active={intent === "RENT"} onClick={() => { setIntent("RENT"); setType(""); }} label={t("search.rent")} icon={KeyRound} />
                <TypeButton active={intent === "SEASONAL_RENT"} onClick={() => { setIntent("SEASONAL_RENT"); setType(""); }} label={t("seasonal.label")} icon={Sun} />
              </div>
              {intent === "SEASONAL_RENT" && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-4 text-center">{t("seasonal.typeRestricted")}</p>
              )}
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-6 text-center flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                {t("search.privacyNote")}
              </p>
            </div>
          )}

          {/* ─── Step 2: Property type ─── */}
          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4 text-center">{t("search.propertyTypeQuestion")}</h3>
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                <TypeButton active={type === "APARTMENT"} onClick={() => setType("APARTMENT")} label={t("type.APARTMENT")} icon={Building2} />
                <TypeButton active={type === "VILLA"} onClick={() => setType("VILLA")} label={t("type.VILLA")} icon={Home} />
                <TypeButton active={type === "INDIVIDUAL_HOUSE"} onClick={() => setType("INDIVIDUAL_HOUSE")} label={t("type.INDIVIDUAL_HOUSE")} icon={Home} />
                {intent !== "SEASONAL_RENT" && (
                  <>
                    <TypeButton active={type === "COMMERCIAL"} onClick={() => setType("COMMERCIAL")} label={t("type.COMMERCIAL")} icon={Store} />
                    <TypeButton active={type === "BUILDABLE_LAND"} onClick={() => setType("BUILDABLE_LAND")} label={t("type.BUILDABLE_LAND")} icon={TreePine} />
                    <TypeButton active={type === "AGRICULTURAL_LAND"} onClick={() => setType("AGRICULTURAL_LAND")} label={t("type.AGRICULTURAL_LAND")} icon={Sprout} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── Step 3: Location ─── */}
          {step === 3 && (
            <div className="space-y-5 max-w-xl mx-auto">
              <h3 className="text-lg font-semibold text-foreground text-center">{t("search.locationQuestion")}</h3>
              <div>
                <Label className="text-xs mb-1.5 block">{t("publish.wilaya")}</Label>
                <Select value={city} onValueChange={(v) => { setCity(v); setCommune(""); }}>
                  <SelectTrigger className="h-12"><SelectValue placeholder={t("publish.chooseWilaya")} /></SelectTrigger>
                  <SelectContent className="max-h-72">{WILAYAS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">{t("publish.commune")} <span className="text-muted-foreground font-normal">(اختياري)</span></Label>
                <Select value={commune} onValueChange={setCommune} disabled={!city}>
                  <SelectTrigger className="h-12"><SelectValue placeholder={t("publish.chooseCommuneFirst")} /></SelectTrigger>
                  <SelectContent className="max-h-72">{communes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">{t("publish.neighbourhood")} <span className="text-muted-foreground font-normal">(اختياري)</span></Label>
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={t("publish.neighbourhoodPlaceholder")} className="h-12" />
              </div>

              {/* ── Optional: pick a precise reference point on the map ──
                  This is OPTIONAL — the buyer can skip it and rely on the
                  administrative fields above. If used, it enables the
                  geoProximity scoring layer (15 pts) for properties near
                  this reference point.

                  SECURITY: the buyer's coordinates are encrypted server-side
                  and used ONLY for matching — NEVER shown to any seller.

                  NOTE: only shown when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
                  configured. Otherwise, the manual dropdowns above are
                  sufficient — we DON'T show a broken map or a confusing
                  "fallback" message. */}
              <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">{hasMapsApiKey ? t("locationPicker.mapHint") : "انقر على الخريطة لتحديد نقطة مرجعية للبحث"}</p>
                  {hasMapsApiKey ? (
                    <LocationPicker
                      initialWilaya={city}
                      initialCommune={commune}
                      initialDistrict={district}
                      onLocationChange={(loc: PickedLocation | null) => {
                        if (!loc) {
                          setSearchLat(null);
                          setSearchLng(null);
                          return;
                        }
                        setSearchLat(loc.lat);
                        setSearchLng(loc.lng);
                        if (loc.wilaya) {
                          const normalized = normalizeWilaya(loc.wilaya);
                          if (normalized) setCity(normalized);
                        }
                        if (loc.commune) setCommune(loc.commune);
                        if (loc.district || loc.districtNotFound) setDistrict(loc.district);
                      }}
                    />
                  ) : (
                    <LeafletMapPicker
                      initialWilaya={city}
                      initialCommune={commune}
                      initialDistrict={district}
                      onLocationChange={(loc: PickedLocation | null) => {
                        if (!loc) {
                          setSearchLat(null);
                          setSearchLng(null);
                          return;
                        }
                        setSearchLat(loc.lat);
                        setSearchLng(loc.lng);
                        if (loc.wilaya) {
                          const normalized = normalizeWilaya(loc.wilaya);
                          if (normalized) setCity(normalized);
                        }
                        if (loc.commune) setCommune(loc.commune);
                        if (loc.district || loc.districtNotFound) setDistrict(loc.district);
                      }}
                    />
                  )}
                </div>
            </div>
          )}

          {/* ─── Step 4: Budget (+ dates for SEASONAL_RENT) ─── */}
          {step === 4 && (
            <div className="max-w-xl mx-auto space-y-5">
              <h3 className="text-lg font-semibold text-foreground mb-2 text-center">
                {intent === "SEASONAL_RENT" ? t("seasonal.maxBudgetPerNight") : t("search.budgetQuestion")}
              </h3>
              <Input
                type="number"
                inputMode="numeric"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder={intent === "SEASONAL_RENT" ? t("seasonal.maxBudgetPerNightPlaceholder") : t("search.budgetPlaceholder")}
                className="h-14 text-lg tabular-nums text-center"
              />
              <div className="space-y-2 text-center">
                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  {t("search.budgetSecret1")}
                </p>
                <p className="text-xs text-muted-foreground">{t("search.budgetSecret2")}</p>
                <p className="text-xs text-gold">{t("search.budgetTip")}</p>
              </div>

              {/* SEASONAL_RENT: check-in / check-out dates */}
              {intent === "SEASONAL_RENT" && (
                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" />
                    {t("seasonal.stayDuration")}
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">{t("seasonal.checkIn")}</Label>
                      <Input
                        type="date"
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="h-12"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground mb-1 block">{t("seasonal.checkOut")}</Label>
                      <Input
                        type="date"
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="h-12"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("seasonal.dateOverlapHint")}</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Step 5: Phone verification + summary ─── */}
          {step === 5 && (
            <div className="space-y-5 max-w-xl mx-auto">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{t("search.contactData")}</h3>
                <p className="text-xs text-muted-foreground">{t("search.contactNote")}</p>
              </div>

              {/* ── Verification Gate (phone OR email) ──
                  User chooses phone OTP or email OTP to verify.
                  If already verified (any method), shows green badge.
              */}
              <SearchVerifyGate
                onVerified={(u) => {
                  if (u.name) setFullName(u.name);
                  if (u.phone) setPhone(u.phone);
                  setPhoneVerified(true);
                }}
              />

              {/* ── Full name input (shown only after phone is verified) ── */}
              {phoneVerified && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2"
                >
                  <Label className="text-xs mb-1.5 block">{t("search.fullName")}</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("publish.fullNamePlaceholder")}
                    className="h-12"
                  />
                </motion.div>
              )}

              {/* Summary — always visible so user reviews criteria */}
              <Card className="p-4 bg-secondary/40">
                <div className="font-semibold text-sm text-foreground mb-3">{t("search.summary")}</div>
                <div className="space-y-1.5 text-sm">
                  <SummaryRow label={t("search.summaryTransaction")} value={intent === "SELL" ? t("publish.sale") : intent === "RENT" ? t("publish.rent") : t("publish.seasonalRent")} />
                  <SummaryRow label={t("search.summaryType")} value={type ? t(`type.${type}`) : "—"} />
                  <SummaryRow label={t("search.summaryLocation")} value={`${city}${commune ? ` · ${commune}` : ""}${district ? ` · ${district}` : ""}`} />
                  <SummaryRow label={t("search.summaryBudget")} value={`${Number(maxBudget).toLocaleString("en-US")} ${t("common.currency")}`} />
                </div>
              </Card>

              <Card className="p-3 bg-amber-500/10 border-amber-500/30">
                <p className="text-xs text-amber-800 dark:text-amber-300">{t("search.rateLimit")}</p>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Missing fields hint — appears when current step is incomplete ── */}
      <MissingFieldsHelper missing={missingFields} className="mt-4" />

      {/* ── Footer nav — fixed bottom on mobile, ABOVE BottomTabBar ──
          BottomTabBar is fixed bottom-0 z-40 h-14 (56px) on mobile.
          This footer sits above it (z-50) and offsets up by 56px (bottom-14).
      */}
      <div className="fixed bottom-14 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t p-3 sm:p-4 md:static md:bottom-0 md:bg-transparent md:border-0 md:p-0 md:backdrop-blur-none">
        <div className="max-w-3xl mx-auto md:max-w-none flex items-center gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="gap-1.5 min-h-[48px]"
            >
              <Prev className="w-4 h-4" /> <span className="hidden sm:inline">{t("common.back")}</span>
            </Button>
          )}
          {step < 5 ? (
            <Button
              size="lg"
              disabled={!canAdvance || stage1Checking}
              onClick={handleNext}
              className="gap-1.5 flex-1 md:flex-none md:min-w-[200px] bg-gold hover:bg-gold/90 text-gold-foreground min-h-[48px]"
            >
              {stage1Checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t("common.next")} <Next className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={!canAdvance || stage2Matching}
              onClick={handleStartMatching}
              className="gap-2 flex-1 md:flex-none md:min-w-[200px] bg-emerald-600 hover:bg-emerald-700 text-white min-h-[48px]"
            >
              {stage2Matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t("search.start")}
            </Button>
          )}
        </div>
      </div>
      {/* Spacer to prevent overlap with BottomTabBar on mobile */}
      <div className="h-24 md:hidden" />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────
function TypeButton({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon: typeof Home }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all min-h-[56px] ${
      active ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
    }`}>
      <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
      {label}
    </button>
  );
}

function Badge({ intent, type }: { intent: string; type: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
        {intent === "SELL" ? t("publish.sale") : t("publish.rent")}
      </span>
      <span className="inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium">
        {t(`type.${type}`)}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
