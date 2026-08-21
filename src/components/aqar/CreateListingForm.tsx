"use client";

// CreateListingForm — modal form for sellers/landlords to publish
// a new listing. Calls POST /api/seller/listings.
//
// Validation: client-side Zod (mirror of server schema). Server is
// the source of truth — client errors are advisory.

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Building2, MapPin, Phone, Tag, CheckCircle2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  WILAYAS,
  COMMUNES_BY_WILAYA,
  PROPERTY_FEATURES,
  INTENT_LABELS,
  TYPE_LABELS,
} from "@/lib/schemas";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

const PROPERTY_TYPES = Object.keys(TYPE_LABELS) as Array<
  keyof typeof TYPE_LABELS
>;

export function CreateListingForm({ open, onOpenChange, onCreated }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Form state
  const [intent, setIntent] = useState<"SELL" | "RENT">("SELL");
  const [type, setType] = useState<string>("APARTMENT");
  const [city, setCity] = useState<string>("");
  const [commune, setCommune] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [areaSqm, setAreaSqm] = useState<string>("");
  const [bedrooms, setBedrooms] = useState<string>("3");
  const [bathrooms, setBathrooms] = useState<string>("2");
  const [parking, setParking] = useState<string>("1");
  const [ageYears, setAgeYears] = useState<string>("0");
  const [floor, setFloor] = useState<string>("");
  const [features, setFeatures] = useState<string[]>([]);
  const [contactPhone, setContactPhone] = useState<string>("");
  const [contactWhatsapp, setContactWhatsapp] = useState<string>("");
  const [addressStreet, setAddressStreet] = useState<string>("");

  const communes = city
    ? COMMUNES_BY_WILAYA[city as keyof typeof COMMUNES_BY_WILAYA] || []
    : [];

  function toggleFeature(f: string) {
    setFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  function resetForm() {
    setIntent("SELL");
    setType("APARTMENT");
    setCity("");
    setCommune("");
    setDistrict("");
    setPrice("");
    setAreaSqm("");
    setBedrooms("3");
    setBathrooms("2");
    setParking("1");
    setAgeYears("0");
    setFloor("");
    setFeatures([]);
    setContactPhone("");
    setContactWhatsapp("");
    setAddressStreet("");
  }

  async function handleSubmit() {
    // Basic client validation
    if (!city || !commune) {
      toast({
        title: "بيانات ناقصة",
        description: "الرجاء اختيار الولاية والبلدية.",
        variant: "destructive",
      });
      return;
    }
    const priceN = Number(price);
    const areaN = Number(areaSqm);
    if (!priceN || priceN < 100_000) {
      toast({
        title: "سعر غير صالح",
        description: "الحد الأدنى للسعر 100,000 دج.",
        variant: "destructive",
      });
      return;
    }
    if (!areaN || areaN < 20) {
      toast({
        title: "مساحة غير صالحة",
        description: "الحد الأدنى للمساحة 20 م².",
        variant: "destructive",
      });
      return;
    }
    if (!contactPhone || contactPhone.length < 10) {
      toast({
        title: "هاتف غير صالح",
        description: "رقم هاتف صحيح مطلوب (10 أرقام على الأقل).",
        variant: "destructive",
      });
      return;
    }
    if (!addressStreet || addressStreet.length < 5) {
      toast({
        title: "عنوان غير صالح",
        description: "العنوان الدقيق مطلوب (5 أحرف على الأقل).",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        intent,
        type,
        city,
        commune,
        district: district || undefined,
        price: priceN,
        areaSqm: areaN,
        bedrooms: Number(bedrooms),
        bathrooms: Number(bathrooms),
        parking: Number(parking),
        ageYears: Number(ageYears) || 0,
        floor: floor ? Number(floor) : null,
        features,
        contactPhone,
        contactWhatsapp: contactWhatsapp || undefined,
        addressStreet,
      };
      const res = await fetch("/api/seller/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "فشل النشر");
      }
      toast({
        title: "تم نشر الإعلان ✓",
        description: json.message,
      });
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast({
        title: "فشل النشر",
        description: e instanceof Error ? e.message : "خطأ غير معروف",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto scroll-slim p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            إضافة عقار جديد
          </DialogTitle>
          <DialogDescription>
            املأ التفاصيل التالية. ستبقى معلومات الاتصال والعنوان الدقيق مشفّرة
            ولن تُكشف إلا بعد موافقتك الصريحة على طلب فتح من مشترٍ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Intent + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">نوع العملية</Label>
              <Select value={intent} onValueChange={(v) => setIntent(v as "SELL" | "RENT")}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELL">{INTENT_LABELS.SELL}</SelectItem>
                  <SelectItem value="RENT">{INTENT_LABELS.RENT}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع العقار</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Wilaya + Commune */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                الولاية
              </Label>
              <Select
                value={city}
                onValueChange={(v) => {
                  setCity(v);
                  setCommune("");
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="اختر الولاية" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {WILAYAS.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                البلدية
                {city && (
                  <span className="text-muted-foreground">
                    ({communes.length})
                  </span>
                )}
              </Label>
              <Select
                value={commune}
                onValueChange={setCommune}
                disabled={!city}
              >
                <SelectTrigger className="h-11">
                  <SelectValue
                    placeholder={city ? "اختر البلدية" : "اختر الولاية أولاً"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {communes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* District (optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs">الحي <span className="text-muted-foreground">(اختياري)</span></Label>
            <Input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="مثال: حيدرة العليا"
              maxLength={60}
              className="h-11"
            />
          </div>

          {/* Price + Area */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Tag className="w-3 h-3" />
                السعر (دج)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="9,500,000"
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المساحة (م²)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={areaSqm}
                onChange={(e) => setAreaSqm(e.target.value)}
                placeholder="120"
                className="h-11 tabular-nums"
              />
            </div>
          </div>

          {/* Rooms grid */}
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">غرف النوم</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الحمامات</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المواقف</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={parking}
                onChange={(e) => setParking(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الطابق</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="—"
                className="h-11 tabular-nums"
              />
            </div>
          </div>

          {/* Age */}
          <div className="space-y-1.5">
            <Label className="text-xs">عمر العقار (سنوات)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={ageYears}
              onChange={(e) => setAgeYears(e.target.value)}
              className="h-11 tabular-nums max-w-[140px]"
            />
          </div>

          {/* Features */}
          <div className="space-y-1.5">
            <Label className="text-xs">المزايا</Label>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_FEATURES.map((f) => {
                const active = features.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFeature(f)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {active && <CheckCircle2 className="inline w-3 h-3 ml-1" />}
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sensitive: contact + address */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              معلومات حساسة — مشفّرة AES-256
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">رقم الهاتف</Label>
                <Input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+213555..."
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  واتساب <span className="text-muted-foreground">(اختياري)</span>
                </Label>
                <Input
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                  placeholder="+213555..."
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                العنوان الدقيق
              </Label>
              <Textarea
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="مثال: شارع ديدوش مراد، رقم 45، الطابق 3"
                maxLength={200}
                rows={2}
              />
              <p className="text-[10px] text-muted-foreground">
                يُخزّن مشفّراً ولن يُكشف إلا بعد موافقتك على طلب فتح من مشترٍ.
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="gap-1.5"
          >
            <X className="w-4 h-4" />
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 flex-1"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري النشر...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                نشر الإعلان
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
