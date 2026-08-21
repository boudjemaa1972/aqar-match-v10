"use client";

// Step 4 — Desired features (multi-select) + submit

import { useForm } from "react-hook-form";
import { z } from "zod";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROPERTY_FEATURES } from "@/lib/schemas";
import { StepFooter } from "../SmartWizard";

export const step4Schema = z.object({
  features: z.array(z.string()).max(10, "حد أقصى 10 مزايا"),
});

export type Step4Data = z.infer<typeof step4Schema>;

interface Props {
  form: ReturnType<typeof useForm<Step4Data>>;
  onSubmit: (v: Step4Data) => void;
  onBack: () => void;
  isMatching: boolean;
  matchError: string | null;
}

export function Step4Features({
  form,
  onSubmit,
  onBack,
  isMatching,
  matchError,
}: Props) {
  const { handleSubmit, watch, setValue } = form;
  const selected = watch("features") || [];

  function toggle(feature: string) {
    const has = selected.includes(feature);
    const next = has
      ? selected.filter((f) => f !== feature)
      : [...selected, feature];
    setValue("features", next, { shouldValidate: true });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-foreground">
            ما المزايا المهمة لك؟
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {selected.length} / 10
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          اختر المزايا التي ترفع قيمة العقار بالنسبة لك — كلما زادت المطابقة،
          ارتفعت نسبة التوافق.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {PROPERTY_FEATURES.map((f) => {
            const active = selected.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggle(f)}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all ${
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-md border ${
                      active
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {active && (
                      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none">
                        <path
                          d="M3 8l3.5 3.5L13 5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {f}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Privacy notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex gap-3">
          <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-foreground mb-1">
              جاهز لإطلاق محرك المطابقة؟
            </p>
            <p className="text-muted-foreground leading-relaxed">
              لن تظهر أي قوائم عقارات تقليدية. سيقوم محركنا الخوارزمي بمسح جميع
              العروض المتاحة في الخلفية ومطابقتها بمعاييرك بدقة، ثم يعرض لك أفضل
              <span className="font-medium text-foreground"> 6 نتائج عمياء</span>{" "}
              — دون كشف أي معلومات اتصال.
            </p>
          </div>
        </div>
      </div>

      {matchError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{matchError}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onBack}
          disabled={isMatching}
        >
          السابق
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={isMatching}
          className="gap-2 flex-1 sm:flex-none sm:min-w-[260px]"
        >
          {isMatching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري المطابقة الذكية...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              ابدأ المطابقة الذكية
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
