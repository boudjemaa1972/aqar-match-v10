"use client";

// ──────────────────────────────────────────────────────────────────
//  SmartWizard — 4-step blind-matching intake.
//
//  Step 1: Intent (buy / rent) + property type
//  Step 2: City + district (location)
//  Step 3: Budget + area + rooms (numeric ranges)
//  Step 4: Desired features (multi-select)
//
//  • Mobile-first, RTL-aware, animations via framer-motion.
//  • Uses React Hook Form + Zod per step.
//  • On step 4 submit → POST /api/match → onMatched(matches).
// ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAqar } from "./store";
import { Step1Intent, step1Schema, type Step1Data } from "./steps/Step1Intent";
import { Step2Location } from "./steps/Step2Location";
import { step2Schema, type Step2Data } from "@/lib/schemas";
import { Step3Budget, step3Schema, type Step3Data } from "./steps/Step3Budget";
import { Step4Features, step4Schema, type Step4Data } from "./steps/Step4Features";
import { MatchingLoader } from "./MatchingLoader";
import { matchRequestSchema } from "@/lib/schemas";
import type { BlindMatch } from "@/lib/schemas";

const STEP_TITLES = [
  "ماذا تريد؟",
  "أين تريد؟",
  "الميزانية والمساحة",
  "مزايا إضافية",
];

interface Props {
  onMatched: (matches: BlindMatch[], requestRef: string) => void;
}

export function SmartWizard({ onMatched }: Props) {
  const { step, data, next, prev, patch, reset } = useAqar();
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  // ── Per-step form instances ──────────────────────────────────
  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      intent: data.intent ?? undefined,
      type: data.type ?? undefined,
    },
    mode: "onChange",
  });

  const form2 = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      city: (data.city as Step2Data["city"]) ?? undefined,
      commune: data.commune ?? "",
      district: data.district ?? "",
    },
    mode: "onChange",
  });

  const form3 = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      budgetMin: data.budgetMin ?? 5_000_000,
      budgetMax: data.budgetMax ?? 15_000_000,
      areaMin: data.areaMin ?? 80,
      areaMax: data.areaMax ?? 180,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      parking: data.parking,
    },
    mode: "onChange",
  });

  const form4 = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: { features: data.features },
    mode: "onChange",
  });

  // ── Submit handlers per step ─────────────────────────────────
  async function onSubmitStep1(v: Step1Data) {
    patch({ intent: v.intent, type: v.type });
    next();
  }
  async function onSubmitStep2(v: Step2Data) {
    patch({
      city: v.city,
      commune: v.commune ?? "",
      district: v.district ?? "",
    });
    next();
  }
  async function onSubmitStep3(v: Step3Data) {
    patch({
      budgetMin: v.budgetMin,
      budgetMax: v.budgetMax,
      areaMin: v.areaMin,
      areaMax: v.areaMax,
      bedrooms: v.bedrooms,
      bathrooms: v.bathrooms,
      parking: v.parking,
    });
    next();
  }

  async function onSubmitStep4(v: Step4Data) {
    patch({ features: v.features });
    // Build the full payload using patched store data
    const finalData = {
      ...data,
      ...v,
      intent: data.intent!,
      type: data.type!,
      city: data.city!,
      commune: data.commune || undefined,
      district: data.district || undefined,
      budgetMin: data.budgetMin!,
      budgetMax: data.budgetMax!,
      areaMin: data.areaMin!,
      areaMax: data.areaMax!,
    };

    // Final Zod check across all four steps combined
    const parsed = matchRequestSchema.safeParse(finalData);
    if (!parsed.success) {
      setMatchError("يرجى مراجعة المدخلات — بعض الحقول غير مكتملة.");
      return;
    }

    setIsMatching(true);
    setMatchError(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok) {
        setMatchError(json?.error || "تعذّر إجراء المطابقة، حاول مرة أخرى.");
        setIsMatching(false);
        return;
      }
      // Brief artificial delay so the loader animation can play
      setTimeout(() => {
        setIsMatching(false);
        onMatched(json.matches as BlindMatch[], json.requestRef as string);
      }, 1800);
    } catch {
      setMatchError("خطأ في الشبكة. تأكد من اتصالك وحاول مجدداً.");
      setIsMatching(false);
    }
  }

  // ── Re-render form defaults when navigating back ─────────────
  // (form values persist via RHF internal state; we sync the store
  //  via patch() on every step submit, so this is mainly for safety.)

  function handleReset() {
    reset();
    form1.reset();
    form2.reset();
    form3.reset();
    form4.reset();
  }

  const progress = (step / 4) * 100;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 sm:pb-12">
      {/* Header — step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs">
              {step}
            </span>
            <span>من 4 خطوات</span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إعادة البدء
          </button>
        </div>
        <Progress value={progress} className="h-2 bg-secondary" />
        <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-foreground">
          {STEP_TITLES[step - 1]}
        </h2>
      </div>

      {/* Steps */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {step === 1 && (
            <Step1Intent form={form1} onSubmit={onSubmitStep1} />
          )}
          {step === 2 && (
            <Step2Location
              form={form2}
              onSubmit={onSubmitStep2}
              onBack={prev}
            />
          )}
          {step === 3 && (
            <Step3Budget form={form3} onSubmit={onSubmitStep3} onBack={prev} />
          )}
          {step === 4 && (
            <Step4Features
              form={form4}
              onSubmit={onSubmitStep4}
              onBack={prev}
              isMatching={isMatching}
              matchError={matchError}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Shared form footer (back / next buttons) ───────────────────
export function StepFooter({
  onBack,
  isSubmitting,
  isLast,
  submitLabel,
}: {
  onBack?: () => void;
  isSubmitting?: boolean;
  isLast?: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="mt-8 flex items-center gap-3">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onBack}
          className="gap-1"
          disabled={isSubmitting}
        >
          <ChevronRight className="w-4 h-4" />
          السابق
        </Button>
      )}
      <Button
        type="submit"
        size="lg"
        className="gap-2 flex-1 sm:flex-none sm:min-w-[200px]"
        disabled={isSubmitting}
      >
        {isLast ? (
          <>
            <Sparkles className="w-4 h-4" />
            {submitLabel || "ابدأ المطابقة الذكية"}
          </>
        ) : (
          <>
            التالي
            <ChevronLeft className="w-4 h-4" />
          </>
        )}
      </Button>
    </div>
  );
}
