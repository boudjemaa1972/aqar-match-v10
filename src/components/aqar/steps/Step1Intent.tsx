"use client";

// Step 1 — Intent (buy/rent) + property type

import { useForm } from "react-hook-form";
import { z } from "zod";
import { Home, KeyRound, Building2, Hotel, Layers, Map, Store } from "lucide-react";
import { StepFooter } from "../SmartWizard";

export const step1Schema = z.object({
  intent: z.enum(["SELL", "RENT"]),
  type: z.enum(["APARTMENT", "VILLA", "STUDIO", "DUPLEX", "LAND", "COMMERCIAL"]),
});

export type Step1Data = z.infer<typeof step1Schema>;

const INTENT_OPTIONS: {
  value: "SELL" | "RENT";
  label: string;
  desc: string;
  icon: typeof Home;
}[] = [
  { value: "SELL", label: "شراء", desc: "أبحث عن عقار لامتلاكه", icon: KeyRound },
  { value: "RENT", label: "إيجار", desc: "أبحث عن عقار للإيجار", icon: Home },
];

const TYPE_OPTIONS: {
  value: Step1Data["type"];
  label: string;
  icon: typeof Home;
}[] = [
  { value: "APARTMENT", label: "شقة", icon: Building2 },
  { value: "VILLA", label: "فيلا", icon: Home },
  { value: "STUDIO", label: "استوديو", icon: Hotel },
  { value: "DUPLEX", label: "دوبلكس", icon: Layers },
  { value: "LAND", label: "أرض", icon: Map },
  { value: "COMMERCIAL", label: "تجاري", icon: Store },
];

interface Props {
  form: ReturnType<typeof useForm<Step1Data>>;
  onSubmit: (v: Step1Data) => void;
}

export function Step1Intent({ form, onSubmit }: Props) {
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const selectedIntent = watch("intent");
  const selectedType = watch("type");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Intent */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">
          ما نوع العملية؟
        </label>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {INTENT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selectedIntent === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue("intent", opt.value, { shouldValidate: true })}
                className={`text-right rounded-2xl border-2 p-4 sm:p-5 transition-all ${
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  {active && (
                    <span className="text-xs font-medium text-primary">
                      ✓ مُحدد
                    </span>
                  )}
                </div>
                <div className="text-base font-bold text-foreground">
                  {opt.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
        {errors.intent && (
          <p className="text-sm text-destructive mt-2">
            {errors.intent.message}
          </p>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">
          نوع العقار
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selectedType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue("type", opt.value, { shouldValidate: true })}
                className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 transition-all ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
                <span
                  className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
        {errors.type && (
          <p className="text-sm text-destructive mt-2">
            {errors.type.message}
          </p>
        )}
      </div>

      <StepFooter />
    </form>
  );
}
