"use client";

// ──────────────────────────────────────────────────────────────────
//  PublishFlow — 5-step seller flow:
//   1. Transaction type + property type (6 types with icons)
//   2. Location (wilaya, commune, neighbourhood) + property details
//      (conditional: land types show only area, facades, legal status)
//   3. Pricing (asking price + secret min price + computed transparent fee)
//   4. Seller info (account type + name + phone)
//   5. Photos (optional, up to 5)
//
//  "Next" button is disabled (grayed out) until required fields are valid.
//  Final submit returns the success message per spec.
//
//  ENHANCEMENT (demand estimate):
//   Once the seller has selected intent + type + wilaya + (commune)
//   and entered an askingPrice, a debounced call to /api/demand-estimate
//   fetches the count of active buyer requests matching those criteria.
//   The result is shown as a quiet info card — motivating without
//   being pushy. If count < 3, we show a neutral-positive message
//   instead of the raw number (privacy + avoid discouragement).
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Building2, Store, TreePine, Sprout, Loader2, CheckCircle2,
  ChevronLeft, ChevronRight, Tag, MapPin, Phone, User, Image as ImageIcon,
  Lock, Info, ArrowLeft, Sun, Calendar, Users, TrendingUp, Calculator, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { MissingFieldsHelper } from "@/components/aqar/MissingFieldsHelper";
import { PhoneAuthGate } from "@/components/aqar/PhoneAuthGate";
import { LocationPicker, type PickedLocation } from "@/components/aqar/LocationPicker";
import { LeafletMapPicker } from "@/components/aqar/LeafletMapPicker";
import {
  WILAYAS, COMMUNES_BY_WILAYA, PROPERTY_FEATURES,
  normalizeWilaya,
  calculateSellerFee, isLandType,
  getAskingPriceFloor, getReservePriceFloor,
  RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT,
  isUrbanPermitApplicable, getUrbanPermitOptions,
  type PropertyType, type PropertyIntent, type LegalStatus, type UrbanPermitStatus, type AccountType,
} from "@/lib/schemas";

interface Props {
  onBackHome: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

export function PublishFlow({ onBackHome }: Props) {
  const { t, dir } = useI18n();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState(false);

  // Step 1
  const [intent, setIntent] = useState<PropertyIntent | "">("");
  const [type, setType] = useState<PropertyType | "">("");

  // Step 2
  const [city, setCity] = useState("");
  const [commune, setCommune] = useState("");
  const [district, setDistrict] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [floor, setFloor] = useState("");
  const [facades, setFacades] = useState("");
  const [legalStatus, setLegalStatus] = useState<LegalStatus | "">("");
  // عقود التعمير — separate from legalStatus (which covers ownership docs).
  const [urbanPermitStatus, setUrbanPermitStatus] = useState<UrbanPermitStatus | "">("");
  const [offerTitle, setOfferTitle] = useState("");
  const [description, setDescription] = useState("");

  // Step 3
  const [askingPrice, setAskingPrice] = useState("");
  const [secretMinPrice, setSecretMinPrice] = useState("");

  // Step 4
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // Phone verification status — step 4 is valid only when this is true.
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Step 5
  const [photos, setPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_SIZE_MB = 5;

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast({ title: t("publish.maxPhotos") || `الحد الأقصى ${MAX_PHOTOS} صور`, variant: "destructive" });
      return;
    }
    const toProcess = Array.from(files).slice(0, remaining);
    const maxSizeBytes = MAX_PHOTO_SIZE_MB * 1024 * 1024;
    let rejected = 0;
    const readers: Promise<string>[] = [];
    for (const file of toProcess) {
      if (file.size > maxSizeBytes) {
        rejected++;
        continue;
      }
      readers.push(
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("File read error"));
          reader.readAsDataURL(file);
        })
      );
    }
    Promise.all(readers).then((base64s) => {
      setPhotos((prev) => [...prev, ...base64s].slice(0, MAX_PHOTOS));
      if (rejected > 0) {
        toast({ title: `تم تجاهل ${rejected} صورة (أكبر من ${MAX_PHOTO_SIZE_MB} ميغابايت)`, variant: "destructive" });
      }
    });
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePhotoDelete(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  // SEASONAL_RENT fields
  const [pricePerNight, setPricePerNight] = useState("");
  const [secretMinPricePerNight, setSecretMinPricePerNight] = useState("");
  const [minStayNights, setMinStayNights] = useState("1");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");

  // ── LocationPicker state ────────────────────────────────────
  // `locationMode` toggles between map and manual dropdowns.
  // `pickedLat`/`pickedLng` are the EXACT coordinates from the map.
  // They're encrypted (encryptJSON → geoLocationEnc) on submit and
  // NEVER stored in plaintext anywhere (no hidden field, no log).
  const [locationMode, setLocationMode] = useState<"manual" | "map">("manual");
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);

  // ── Check if Google Maps API key is configured ──────────────
  // When false, the map toggle is hidden — manual dropdowns only.
  const hasMapsApiKey = !!(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined);

  // ── Demand estimate state (debounced fetch) ──────────────────
  // Fetched once the seller has intent + type + wilaya + (commune)
  // + askingPrice entered. Shown as a quiet info card on step 3.
  const [demandEstimate, setDemandEstimate] = useState<{
    count: number | null;
    bucket: "high" | "medium" | "low" | "none";
    isBelowThreshold: boolean;
  } | null>(null);
  const [demandLoading, setDemandLoading] = useState(false);
  const demandAbortRef = useRef<AbortController | null>(null);

  const isLand = type && isLandType(type);
  const communes = city ? COMMUNES_BY_WILAYA[city as keyof typeof COMMUNES_BY_WILAYA] || [] : [];

  // ── Reset urbanPermitStatus when type changes to an incompatible type ──
  // If user previously selected CONFORMITY_CERTIFICATE / BUILDING_IN_TITLE_DEED
  // then switches to BUILDABLE_LAND, the value is no longer valid — clear it
  // so the Select doesn't show a stale option that's not in the dropdown.
  // Also clears when switching to AGRICULTURAL_LAND (field hidden entirely).
  useEffect(() => {
    if (!type) return;
    if (urbanPermitStatus && !getUrbanPermitOptions(type).includes(urbanPermitStatus)) {
      setUrbanPermitStatus("");
    }
    if (type === "AGRICULTURAL_LAND" && urbanPermitStatus) {
      setUrbanPermitStatus("");
    }
  }, [type, urbanPermitStatus]);

  // ── Demand estimate: debounced fetch on step 3 when criteria ready ──
  // Fires when seller has: intent + type + city + (optional commune) +
  // askingPrice (or pricePerNight for seasonal). Re-fires with 500ms
  // debounce when any of those inputs change. Result is shown as a
  // quiet info card above the price summary on step 3.
  useEffect(() => {
    // Only fetch on step 3 (pricing) — earlier steps don't have askingPrice yet
    if (step !== 3) return;
    if (!intent || !type || !city) return;

    // Pick the right "askingPrice" param for the intent
    const priceForEstimate = intent === "SEASONAL_RENT" ? pricePerNight : askingPrice;
    const parsedPrice = priceForEstimate ? Number(priceForEstimate) : NaN;
    const hasValidPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;

    // If no valid price yet, don't fetch — we still want to show the
    // neutral-positive "we'll notify buyers" message instead.
    if (!hasValidPrice) {
      setDemandEstimate(null);
      return;
    }

    // Abort any in-flight request (debounce + race protection)
    if (demandAbortRef.current) {
      demandAbortRef.current.abort();
    }
    const controller = new AbortController();
    demandAbortRef.current = controller;

    const timer = setTimeout(async () => {
      setDemandLoading(true);
      try {
        const params = new URLSearchParams({
          intent: String(intent),
          propertyType: String(type),
          wilaya: city,
          askingPrice: String(parsedPrice),
        });
        if (commune) params.set("commune", commune);

        const res = await fetch(`/api/demand-estimate?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          // 429 (rate-limited) or 400 (validation) — silently hide the card
          if (!controller.signal.aborted) setDemandEstimate(null);
          return;
        }
        const json = await res.json();
        if (!controller.signal.aborted) {
          setDemandEstimate({
            count: json.count,
            bucket: json.bucket,
            isBelowThreshold: json.isBelowThreshold,
          });
        }
      } catch {
        // Network/abort error — silently hide the card
        if (!controller.signal.aborted) setDemandEstimate(null);
      } finally {
        if (!controller.signal.aborted) setDemandLoading(false);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [step, intent, type, city, commune, askingPrice, pricePerNight]);

  // ── Step validation ───────────────────────────────────────────
  const step1Valid = !!intent && !!type;
  const step2Valid = !!city && !!commune && !!areaSqm && !!legalStatus && offerTitle.length >= 5 &&
    (isLand || (!!bedrooms && !!bathrooms));
  const isSeasonal = intent === "SEASONAL_RENT";

  // Pricing validation — uses the SAME intent-based floor functions as the
  // server-side Zod schema, so the client and server agree on the rules.
  //   SELL: askingPrice ≥ 1,000,000  AND  secretMinPrice ≥ 1,000,000 (absolute)
  //   RENT: askingPrice ≥ 3,000       AND  secretMinPrice ≥ 3,000
  //   SEASONAL_RENT: pricePerNight ≥ 2,000  AND  secretMinPricePerNight ≥ 2,000
  //   All: secretMinPrice ≤ askingPrice
  const step3Valid = isSeasonal
    ? !!pricePerNight && !!secretMinPricePerNight && !!availableFrom && !!availableTo &&
      Number(pricePerNight) >= RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT &&
      Number(secretMinPricePerNight) >= RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT &&
      Number(secretMinPricePerNight) <= Number(pricePerNight) &&
      new Date(availableTo) > new Date(availableFrom)
    : !!intent && !!askingPrice && !!secretMinPrice &&
      Number(askingPrice) >= getAskingPriceFloor(intent as PropertyIntent) &&
      Number(secretMinPrice) >= getReservePriceFloor(intent as PropertyIntent) &&
      Number(secretMinPrice) <= Number(askingPrice);
  const step4Valid = !!accountType && phoneVerified && fullName.length >= 3;
  // Step 5 is always valid (photos optional)

  const canAdvance = step === 1 ? step1Valid : step === 2 ? step2Valid : step === 3 ? step3Valid : step === 4 ? step4Valid : true;

  // ── Compute missing-field labels for the current step ────────
  // Used by MissingFieldsHelper to show the user EXACTLY what to fill.
  const missingFields: string[] = (() => {
    if (step === 1) {
      const m: string[] = [];
      if (!intent) m.push(t("publish.transactionType"));
      if (!type) m.push(t("publish.propertyType"));
      return m;
    }
    if (step === 2) {
      const m: string[] = [];
      if (!city) m.push(t("publish.wilaya"));
      if (!commune) m.push(t("publish.commune"));
      if (!areaSqm) m.push(isLand ? t("publish.areaHectare") : t("publish.area"));
      if (!isLand && !bedrooms) m.push(t("publish.rooms"));
      if (!isLand && !bathrooms) m.push(t("publish.bathrooms"));
      if (!legalStatus) m.push(t("publish.legalStatus"));
      if (offerTitle.length < 5) m.push(t("publish.offerTitle"));
      return m;
    }
    if (step === 3) {
      const m: string[] = [];
      if (isSeasonal) {
        if (!pricePerNight) m.push(t("seasonal.pricePerNight"));
        if (!secretMinPricePerNight) m.push(t("seasonal.secretMinPricePerNight"));
        if (!availableFrom) m.push(t("seasonal.availableFrom"));
        if (!availableTo) m.push(t("seasonal.availableTo"));
        if (pricePerNight && Number(pricePerNight) < RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT) {
          m.push(`≥ ${RESERVE_PRICE_FLOOR_SEASONAL_PER_NIGHT.toLocaleString()} دج/ليلة`);
        }
        if (secretMinPricePerNight && pricePerNight && Number(secretMinPricePerNight) > Number(pricePerNight)) {
          m.push(t("publish.secretNote"));
        }
      } else {
        if (!askingPrice) m.push(t("publish.askingPrice"));
        if (!secretMinPrice) m.push(t("publish.secretMinPrice"));
        if (intent && askingPrice && Number(askingPrice) < getAskingPriceFloor(intent as PropertyIntent)) {
          m.push(`≥ ${getAskingPriceFloor(intent as PropertyIntent).toLocaleString()} دج`);
        }
        if (intent && secretMinPrice && Number(secretMinPrice) < getReservePriceFloor(intent as PropertyIntent)) {
          m.push(`السعر السري ≥ ${getReservePriceFloor(intent as PropertyIntent).toLocaleString()} دج`);
        }
        if (askingPrice && secretMinPrice && Number(secretMinPrice) > Number(askingPrice)) {
          m.push("السعر السري ≤ السعر المطلوب");
        }
      }
      return m;
    }
    if (step === 4) {
      const m: string[] = [];
      if (!accountType) m.push(t("publish.accountType"));
      if (!phoneVerified) m.push(t("phoneGate.title"));
      if (phoneVerified && fullName.length < 3) m.push(t("publish.fullName"));
      return m;
    }
    return [];
  })();

  // ── Steps array for the breadcrumb ────────────────────────────
  const stepLabels = [t("publish.step1"), t("publish.step2"), t("publish.step3"), t("publish.step4"), t("publish.step5")];

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    // ── Pre-submit validation (defense in depth) ──
    // Even if step validation was bypassed (e.g., user navigated from
    // an older session state), catch missing fields here BEFORE hitting
    // the API, and show a clear toast instead of a generic 422.
    if (!phoneVerified) {
      toast({
        title: t("phoneGate.title"),
        description: t("phoneGate.publishExplanation"),
        variant: "destructive",
      });
      setStep(4); // jump back to step 4 to complete verification
      return;
    }
    if (fullName.length < 3) {
      toast({
        title: t("publish.fullName"),
        description: t("publish.fullNamePlaceholder"),
        variant: "destructive",
      });
      setStep(4); // jump back to step 4 to fill name
      return;
    }
    if (!accountType) {
      toast({
        title: t("publish.accountType"),
        description: t("publish.accountType"),
        variant: "destructive",
      });
      setStep(4);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        intent, type, city, commune,
        district: district || null,
        // GPS coordinates from LocationPicker (only if user used the map).
        // These are ENCRYPTED server-side via encryptJSON → geoLocationEnc.
        // NEVER stored in plaintext, NEVER returned to buyers.
        // NOTE: send `undefined` (not `null`) when no coords — Zod schema
        // is `z.number().optional()` which accepts undefined but rejects null.
        ...(pickedLat !== null ? { latitude: pickedLat } : {}),
        ...(pickedLng !== null ? { longitude: pickedLng } : {}),
        areaSqm: Number(areaSqm),
        bedrooms: isLand ? null : Number(bedrooms),
        bathrooms: isLand ? null : Number(bathrooms),
        floor: isLand ? null : (floor ? Number(floor) : null),
        facades: facades ? Number(facades) : null,
        legalStatus,
        // عقود التعمير — null when not applicable (AGRICULTURAL_LAND)
        urbanPermitStatus: urbanPermitStatus || null,
        offerTitle,
        description: description || null,
        // SELL / RENT pricing
        askingPrice: isSeasonal ? undefined : Number(askingPrice),
        secretMinPrice: isSeasonal ? undefined : Number(secretMinPrice),
        // SEASONAL_RENT pricing
        pricePerNight: isSeasonal ? Number(pricePerNight) : undefined,
        secretMinPricePerNight: isSeasonal ? Number(secretMinPricePerNight) : undefined,
        minStayNights: isSeasonal ? Number(minStayNights || 1) : undefined,
        availableFrom: isSeasonal ? availableFrom : undefined,
        availableTo: isSeasonal ? availableTo : undefined,
        accountType, fullName, phone,
        photos,
      };
      const res = await fetch("/api/seller/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Robust JSON parsing — server may return empty body or HTML on hard errors
      let json: { ok?: boolean; error?: string; message?: string; issues?: { path: string[]; message: string }[] } | null = null;
      const text = await res.text();
      if (text) {
        try { json = JSON.parse(text); } catch { json = null; }
      }
      if (!res.ok) {
        // If server returned Zod issues, show the first one for clarity.
        // NOTE: the server already joins the Zod path array into a string
        // (e.g. "askingPrice" instead of ["askingPrice"]), so we use it
        // directly here. Calling .join() on it would throw "path.join is
        // not a function" because strings don't have a join method.
        const firstIssue = json?.issues?.[0];
        const errorMsg = firstIssue
          ? `${firstIssue.message}${firstIssue.path ? ` (${firstIssue.path})` : ""}`
          : json?.error || (res.status >= 500 ? "خطأ داخلي في الخادم" : "فشل النشر");
        throw new Error(errorMsg);
      }
      toast({ title: "تم النشر ✓", description: json?.message || "" });
      setPublished(true);
    } catch (e) {
      toast({
        title: "فشل النشر",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Published success screen ──────────────────────────────────
  if (published) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/15 mb-6"
        >
          <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        </motion.div>
        <h2 className="text-2xl font-bold text-foreground mb-3">تم نشر عقارك</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
          {t("publish.success")}
        </p>
        <Button onClick={onBackHome} className="gap-2">
          {t("search.backHome")}
        </Button>
      </div>
    );
  }

  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-32 sm:pb-24">
      {/* Mobile sticky progress bar */}
      <div className="md:hidden sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground">
            {t("publish.title")} — {t("publish.step" + step)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {step} / 5
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Header */}
      <button onClick={onBackHome} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> {t("search.backHome")}
      </button>
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-1">{t("publish.title")}</h1>
      <p className="text-muted-foreground text-xs sm:text-sm mb-6">{t("publish.subtitle")}</p>

      {/* Steps breadcrumb — desktop only */}
      <div className="hidden md:flex items-center gap-1 sm:gap-2 mb-8 overflow-x-auto scroll-slim pb-2">
        {stepLabels.map((label, i) => {
          const num = i + 1;
          const active = step === num;
          const done = step > num;
          return (
            <div key={i} className="flex items-center gap-1 sm:gap-2 whitespace-nowrap">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500/15 text-emerald-700" : "bg-secondary text-muted-foreground"
              }`}>
                <span className="w-5 h-5 rounded-full bg-foreground/10 inline-flex items-center justify-center text-[10px] font-bold">
                  {done ? "✓" : num}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < stepLabels.length - 1 && <div className="w-3 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {/* ─── Step 1: Transaction type + property type ─── */}
          {step === 1 && (
            <div className="space-y-8">
              <div>
                <Label className="text-sm font-semibold mb-3 block">{t("publish.transactionType")}</Label>
                <div className="flex flex-col sm:grid sm:grid-cols-3 gap-3 max-w-2xl">
                  <TypeButton active={intent === "SELL"} onClick={() => { setIntent("SELL"); setType(""); }} label={t("publish.sale")} icon={Tag} />
                  <TypeButton active={intent === "RENT"} onClick={() => { setIntent("RENT"); setType(""); }} label={t("publish.rent")} icon={Home} />
                  <TypeButton active={intent === "SEASONAL_RENT"} onClick={() => { setIntent("SEASONAL_RENT"); setType(""); }} label={t("publish.seasonalRent")} icon={Sun} />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-3 block">{t("publish.propertyType")}</Label>
                {intent === "SEASONAL_RENT" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">{t("seasonal.typeRestricted")}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
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
            </div>
          )}

          {/* ─── Step 2: Location + details ─── */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />{t("publish.location")}</h3>

              {/* ── Mode toggle: map vs manual dropdowns ──
                  Always shown — map works with Leaflet (no API key needed)
                  or Google Maps (when API key is configured). */}
              <div className="flex gap-2 p-1 bg-secondary/40 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setLocationMode("map")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      locationMode === "map"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("locationPicker.useMap")}
                  </button>
                <button
                  type="button"
                  onClick={() => setLocationMode("manual")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    locationMode === "manual"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("locationPicker.useManual")}
                </button>
              </div>

              {locationMode === "map" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{hasMapsApiKey ? t("locationPicker.mapHint") : "انقر على الخريطة لتحديد موقع العقار بدقة"}</p>
                  {hasMapsApiKey ? (
                    <LocationPicker
                    initialWilaya={city}
                    initialCommune={commune}
                    initialDistrict={district}
                    onLocationChange={(loc: PickedLocation | null) => {
                      if (!loc) {
                        setPickedLat(null);
                        setPickedLng(null);
                        return;
                      }
                      setPickedLat(loc.lat);
                      setPickedLng(loc.lng);
                      // Sync the admin fields (so the rest of the form
                      // + the demand-estimate query work as before).
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
                        setPickedLat(null);
                        setPickedLng(null);
                        return;
                      }
                      setPickedLat(loc.lat);
                      setPickedLng(loc.lng);
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
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.wilaya")}</Label>
                    <Select value={city} onValueChange={(v) => { setCity(v); setCommune(""); }}>
                      <SelectTrigger className="h-12"><SelectValue placeholder={t("publish.chooseWilaya")} /></SelectTrigger>
                      <SelectContent className="max-h-72">{WILAYAS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.commune")}</Label>
                    <Select value={commune} onValueChange={setCommune} disabled={!city}>
                      <SelectTrigger className="h-12"><SelectValue placeholder={t("publish.chooseCommuneFirst")} /></SelectTrigger>
                      <SelectContent className="max-h-72">{communes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs mb-1.5 block">{t("publish.neighbourhood")}</Label>
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={t("publish.neighbourhoodPlaceholder")} className="h-12" />
              </div>

              <h3 className="text-sm font-semibold pt-4 border-t">{t("publish.propertyDetails")}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-1.5 block">{isLand ? t("publish.areaHectare") : t("publish.area")}</Label>
                  <Input type="number" inputMode="numeric" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} placeholder="120" className="h-12 tabular-nums" />
                </div>
                {!isLand && (
                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.rooms")}</Label>
                    <Select value={bedrooms} onValueChange={setBedrooms}>
                      <SelectTrigger className="h-12"><SelectValue placeholder="3" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 7 }).map((_, i) => <SelectItem key={i} value={String(i === 6 ? "6+" : i)}>{i === 6 ? "6+" : i === 0 ? t("common.studio") : i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!isLand && (
                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.floor")}</Label>
                    <Input type="number" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="3" className="h-12 tabular-nums" />
                    <p className="text-[10px] text-muted-foreground mt-1">{t("publish.floorHint")}</p>
                  </div>
                )}
                {!isLand && (
                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.bathrooms")}</Label>
                    <Select value={bathrooms} onValueChange={setBathrooms}>
                      <SelectTrigger className="h-12"><SelectValue placeholder="2" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 6 }).map((_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs mb-1.5 block">{t("publish.facades")}</Label>
                  <Select value={facades} onValueChange={setFacades}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="2" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }).map((_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1.5 block">{t("publish.legalStatus")}</Label>
                  <Select value={legalStatus} onValueChange={(v) => setLegalStatus(v as LegalStatus)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {(["LIVRET_FONCIER","NOTARIZED_ACT","REGISTERED_UNNOTARIZED","ADMIN_DECISION","PRIVATE_ACT","NO_DOCS"] as LegalStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{t(`legal.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* ── عقود التعمير (Urban Permit Status) ──
                    Separate field from legalStatus (which covers ownership docs).
                    Shown for all types EXCEPT AGRICULTURAL_LAND.
                    For BUILDABLE_LAND: only 2 options (no building-yet options).
                */}
                {isUrbanPermitApplicable(type) && (
                  <div className="col-span-2">
                    <Label className="text-xs mb-1.5 block">{t("publish.urbanPermitStatus")}</Label>
                    <Select
                      value={urbanPermitStatus}
                      onValueChange={(v) => setUrbanPermitStatus(v as UrbanPermitStatus)}
                    >
                      <SelectTrigger className="h-12"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {getUrbanPermitOptions(type).map((s) => (
                          <SelectItem key={s} value={s}>{t(`urbanPermit.${s}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="col-span-2">
                  <Label className="text-xs mb-1.5 block">{t("publish.offerTitle")}</Label>
                  <Input value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} placeholder={t("publish.offerTitlePlaceholder")} className="h-12" maxLength={120} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1.5 block">{t("publish.description")}</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("publish.descriptionPlaceholder")} rows={3} maxLength={2000} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Pricing (SEASONAL_RENT vs SELL/RENT) ─── */}
          {step === 3 && (
            <div className="space-y-6">
              {/* ── Demand estimate card (quiet, motivating) ──
                  Shows the count of active buyer requests matching the
                  current criteria. Hidden if no price entered yet or if
                  the API failed (silent failure, doesn't block the form). */}

              {/* SEASONAL_RENT pricing fields */}
              {isSeasonal ? (
                <>
                  {/* SEASONAL_RENT pricing fields */}
                  <div>
                    <Label className="text-xs mb-1.5 block flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-gold" />
                      {t("seasonal.pricePerNight")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={pricePerNight}
                      onChange={(e) => setPricePerNight(e.target.value)}
                      placeholder={t("seasonal.pricePerNightPlaceholder")}
                      className="h-12 tabular-nums"
                    />
                  </div>

                  <div>
                    <Label className="text-xs mb-1.5 block">{t("seasonal.secretMinPricePerNight")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={secretMinPricePerNight}
                      onChange={(e) => setSecretMinPricePerNight(e.target.value)}
                      placeholder={t("seasonal.secretMinPricePerNightPlaceholder")}
                      className="h-12 tabular-nums"
                    />
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{t("seasonal.secretNote")}</span>
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs mb-1.5 block">{t("seasonal.minStayNights")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={minStayNights}
                      onChange={(e) => setMinStayNights(e.target.value)}
                      min={1}
                      max={90}
                      className="h-12 tabular-nums"
                    />
                  </div>

                  <div>
                    <Label className="text-xs mb-1.5 block flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      {t("seasonal.availabilityWindow")}
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1 block">{t("seasonal.availableFrom")}</Label>
                        <Input
                          type="date"
                          value={availableFrom}
                          onChange={(e) => setAvailableFrom(e.target.value)}
                          className="h-12"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1 block">{t("seasonal.availableTo")}</Label>
                        <Input
                          type="date"
                          value={availableTo}
                          onChange={(e) => setAvailableTo(e.target.value)}
                          className="h-12"
                        />
                      </div>
                    </div>
                  </div>

                  {step3Valid && (
                    <>
                    <Card className="p-4 bg-secondary/40">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <div className="font-semibold text-foreground mb-1">{t("publish.transparentFees")}</div>
                          <div className="text-2xl font-bold text-primary tabular-nums">
                            {calculateSellerFee(
                              Number(pricePerNight) * Number(minStayNights || 1),
                              "SEASONAL_RENT",
                            ).toLocaleString("en-US")} {t("common.currency")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            ({t("seasonal.minStay")}: {minStayNights || 1} {t("seasonal.nights")})
                          </div>
                        </div>
                      </div>
                    </Card>
                    <a href="/?view=home#fee-calculator" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                      <Calculator className="w-3.5 h-3.5" />
                      اكتشف كيف تُحسب الرسوم
                    </a>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* SELL / RENT pricing fields */}
                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.askingPrice")}</Label>
                    <Input type="number" inputMode="numeric" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="9,500,000" className="h-12 tabular-nums" />
                  </div>

                  <div>
                    <Label className="text-xs mb-1.5 block">{t("publish.secretMinPrice")}</Label>
                    <Input type="number" inputMode="numeric" value={secretMinPrice} onChange={(e) => setSecretMinPrice(e.target.value)} placeholder="8,000,000" className="h-12 tabular-nums" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{t("publish.secretNote")}</span>
                    </p>
                  </div>

                  {step3Valid && (
                    <>
                    <Card className="p-4 bg-secondary/40">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <div className="font-semibold text-foreground mb-1">{t("publish.transparentFees")}</div>
                          <div className="text-2xl font-bold text-primary tabular-nums">
                            {calculateSellerFee(Number(askingPrice), intent as PropertyIntent).toLocaleString("en-US")} {t("common.currency")}
                          </div>
                        </div>
                      </div>
                    </Card>
                    <a href="/?view=home#fee-calculator" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                      <Calculator className="w-3.5 h-3.5" />
                      اكتشف كيف تُحسب الرسوم
                    </a>
                    </>
                  )}
                </>
              )}

              {/* ── Demand estimate card ──────────────────────────────
                  Quiet info card shown on step 3 once price is entered.
                  • count ≥ 3 → show exact count, motivating tone.
                  • count < 3 (or 0) → neutral-positive message
                    ("we'll notify new buyers automatically"), no number.
                  • Loading state → subtle skeleton, no spinner to avoid
                    drawing attention away from the price input.
                  • Hidden entirely if no price entered yet. */}
              <DemandEstimateCard
                loading={demandLoading}
                estimate={demandEstimate}
                commune={commune}
              />
            </div>
          )}

          {/* ─── Step 4: Account type + Phone verification + Name ─── */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <Label className="text-sm font-semibold mb-3 block">{t("publish.accountType")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <TypeButton active={accountType === "INDIVIDUAL"} onClick={() => setAccountType("INDIVIDUAL")} label={t("publish.individual")} icon={User} small />
                  <TypeButton active={accountType === "AGENCY"} onClick={() => setAccountType("AGENCY")} label={t("publish.agency")} icon={Building2} small />
                  <TypeButton active={accountType === "BROKER"} onClick={() => setAccountType("BROKER")} label={t("publish.broker")} icon={User} small />
                </div>
              </div>

              {/* ── Phone Auth Gate (mandatory) ──
                  Verifies the user's phone via OTP. After verification,
                  phone is auto-filled from session. Name field appears
                  below so the user can type their full name (the OTP
                  flow doesn't collect name — it's a separate field).
              */}
              <PhoneAuthGate
                explanation={t("phoneGate.publishExplanation")}
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
                  <Label className="text-xs mb-1.5 block">{t("publish.fullName")}</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("publish.fullNamePlaceholder")}
                    className="h-12"
                  />
                  <p className="text-xs text-muted-foreground">{t("publish.phoneNote1")}</p>
                </motion.div>
              )}
            </div>
          )}

          {/* ─── Step 5: Photos + account gate ─── */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-1">{t("publish.photos")}</h3>
                <p className="text-xs text-muted-foreground mb-1">{t("publish.photosSubtitle")}</p>
                <p className="text-xs text-muted-foreground">{t("publish.photosNote")}</p>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />

              {/* Photo preview grid */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {photos.map((src, i) => (
                    <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-border">
                      <img
                        src={src}
                        alt={`${t("publish.photos")} ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handlePhotoDelete(i)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Delete photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button area */}
              {photos.length < MAX_PHOTOS ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed border-border p-8 text-center hover:border-primary/40 hover:bg-primary/5 transition cursor-pointer"
                >
                  <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">{t("publish.addPhoto")}</p>
                  <p className="text-xs text-muted-foreground">{t("publish.photosHint")}</p>
                  <p className="text-xs text-primary mt-2 font-medium">
                    {photos.length}/{MAX_PHOTOS} صور
                  </p>
                </button>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center py-2">
                  {t("publish.maxPhotos") || `تم الوصول للحد الأقصى (${MAX_PHOTOS} صور)`}
                </p>
              )}

              {/* Account gate placeholder — shown before final publish */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-foreground mb-1">{t("gate.title")}</div>
                  <p className="text-xs text-muted-foreground mb-2">{t("gate.coming")}</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Missing fields hint — appears when current step is incomplete ── */}
      <MissingFieldsHelper missing={missingFields} className="mt-4" />

      {/* ── Footer nav buttons — fixed bottom on mobile, ABOVE BottomTabBar ──
          BottomTabBar is fixed bottom-0 z-40 h-14 (56px) on mobile.
          This footer must:
            • sit ABOVE it (z-50 > z-40)
            • offset up by 56px on mobile (bottom-14) so it doesn't overlap
            • become static on md+ where BottomTabBar is hidden
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
              <Prev className="w-4 h-4" /> <span className="hidden sm:inline">{t("publish.prev")}</span>
            </Button>
          )}
          {step < 5 ? (
            <Button
              size="lg"
              disabled={!canAdvance}
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="gap-1.5 flex-1 md:flex-none md:min-w-[200px] bg-gold hover:bg-gold/90 text-gold-foreground min-h-[48px]"
            >
              {t("publish.next")} <Next className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={submitting}
              onClick={handleSubmit}
              className="gap-2 flex-1 md:flex-none md:min-w-[200px] bg-emerald-600 hover:bg-emerald-700 text-white min-h-[48px]"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t("publish.publish")}
            </Button>
          )}
        </div>
      </div>
      {/* Spacer to prevent overlap with BottomTabBar on mobile */}
      <div className="h-24 md:hidden" />
    </div>
  );
}

// ── Reusable type-selectable button ──────────────────────────────
function TypeButton({
  active, onClick, label, icon: Icon, small,
}: {
  active: boolean; onClick: () => void; label: string; icon: typeof Home; small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border-2 ${small ? "px-3 py-3" : "px-4 py-4"} text-sm font-medium transition-all min-h-[48px] ${
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
      }`}
    >
      <Icon className={`${small ? "w-4 h-4" : "w-5 h-5"} ${active ? "text-primary" : ""}`} />
      <span className={small ? "text-xs" : ""}>{label}</span>
    </button>
  );
}

// ── Demand estimate card ─────────────────────────────────────────
// Quiet, motivating info card showing the count of active buyer
// requests matching the seller's current criteria. Display rules:
//   • loading=true → subtle skeleton (no spinner)
//   • estimate=null + loading=false → hidden (no price entered yet)
//   • isBelowThreshold=true (count < 3) → neutral-positive message
//     "we'll notify new buyers automatically" — NO number shown
//     (privacy: don't reveal small counts; UX: don't discourage).
//   • count ≥ 3 → show exact number with motivating tone.
function DemandEstimateCard({
  loading,
  estimate,
  commune,
}: {
  loading: boolean;
  estimate: {
    count: number | null;
    bucket: "high" | "medium" | "low" | "none";
    isBelowThreshold: boolean;
  } | null;
  commune?: string;
}) {
  const { t } = useI18n();

  // Loading skeleton — subtle, no spinner
  if (loading) {
    return (
      <Card className="p-3 bg-secondary/30 animate-pulse">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-4 h-4 rounded bg-muted-foreground/20" />
          <div className="h-3 w-32 rounded bg-muted-foreground/20" />
        </div>
      </Card>
    );
  }

  // No estimate yet (no price entered, or fetch failed silently)
  if (!estimate) return null;

  // Below threshold (count < 3) → neutral-positive message
  if (estimate.isBelowThreshold) {
    return (
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-2 text-xs">
          <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-foreground font-medium leading-relaxed">
              {t("demand.willNotify")}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {t("demand.willNotifyHint")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // count ≥ 3 → show exact number with motivating tone
  const count = estimate.count ?? 0;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Card className={`p-4 ${
        estimate.bucket === "high"
          ? "bg-emerald-500/5 border-emerald-500/30"
          : estimate.bucket === "medium"
            ? "bg-primary/5 border-primary/30"
            : "bg-secondary/40 border-border"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            estimate.bucket === "high"
              ? "bg-emerald-500/15 text-emerald-600"
              : estimate.bucket === "medium"
                ? "bg-primary/15 text-primary"
                : "bg-secondary text-muted-foreground"
          }`}>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {t("demand.matching", { n: count })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {commune
                ? t("demand.inCommune", { commune })
                : t("demand.inWilaya")}
            </p>
            <p className="text-xs text-primary font-medium mt-1.5">
              {t("demand.publishNow")}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
