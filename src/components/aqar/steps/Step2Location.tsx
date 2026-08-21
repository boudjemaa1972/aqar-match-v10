"use client";

// Step 2 — Wilaya (province) + Commune + Neighbourhood
//
// Flow:
//  1. User selects a wilaya from a dropdown (الجزائر / البليدة / المدية).
//  2. The commune dropdown becomes enabled and populated with the
//     communes of that wilaya (sourced from ONS Algeria).
//  3. User can optionally type a neighbourhood (حي) name.

import { useForm } from "react-hook-form";
import { z } from "zod";
import { MapPin, CheckCircle2, Building, Locate } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StepFooter } from "../SmartWizard";
import {
  WILAYAS,
  COMMUNES_BY_WILAYA,
  step2Schema,
  type Step2Data,
} from "@/lib/schemas";

interface Props {
  form: ReturnType<typeof useForm<Step2Data>>;
  onSubmit: (v: Step2Data) => void;
  onBack: () => void;
}

export function Step2Location({ form, onSubmit, onBack }: Props) {
  const watchedWilaya = form.watch("city");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Wilaya dropdown */}
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary" />
                الولاية
              </FormLabel>
              <Select
                value={field.value || ""}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Reset commune when wilaya changes
                  form.setValue("commune", "");
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="اختر الولاية..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-72">
                  {WILAYAS.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Commune dropdown — appears only after wilaya is selected */}
        <FormField
          control={form.control}
          name="commune"
          render={({ field }) => {
            const communes = watchedWilaya
              ? COMMUNES_BY_WILAYA[watchedWilaya as keyof typeof COMMUNES_BY_WILAYA] || []
              : [];
            const isDisabled = !watchedWilaya;
            return (
              <FormItem>
                <FormLabel className="text-sm font-semibold flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-primary" />
                  البلدية
                  {!isDisabled && (
                    <span className="text-xs text-muted-foreground font-normal">
                      ({communes.length} بلدية)
                    </span>
                  )}
                </FormLabel>
                <Select
                  value={field.value || ""}
                  onValueChange={(v) => field.onChange(v)}
                  disabled={isDisabled}
                >
                  <FormControl>
                    <SelectTrigger
                      className={`h-12 text-base ${
                        isDisabled ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      <SelectValue
                        placeholder={
                          isDisabled
                            ? "اختر الولاية أولاً..."
                            : "اختر البلدية..."
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-72">
                    {communes.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isDisabled && (
                  <p className="text-xs text-muted-foreground mt-1">
                    سيتم تفعيل قائمة البلديات تلقائياً عند اختيار الولاية.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Neighbourhood (free text, optional) */}
        <FormField
          control={form.control}
          name="district"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold flex items-center gap-1.5">
                <Locate className="w-4 h-4 text-primary" />
                الحي
                <span className="text-muted-foreground font-normal">(اختياري)</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="مثال: حيدرة، المرادية، باب الواد... (اتركه فارغاً لأي حي)"
                  className="h-12 text-base"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground mt-1">
                تحديد الحي يرفع دقة المطابقة لكنه يقلل عدد العروض المتاحة.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <StepFooter onBack={onBack} />
      </form>
    </Form>
  );
}
