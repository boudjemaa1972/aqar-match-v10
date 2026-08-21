"use client";

// Step 3 — Budget + area + rooms (numeric ranges)
// All prices in Algerian Dinar (DZD).

import { useForm } from "react-hook-form";
import { z } from "zod";
import { BedDouble, Bath, Car, Maximize } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepFooter } from "../SmartWizard";
import { formatDZD } from "../store";

// Local schema (kept in sync with lib/schemas.ts step3Schema but with
// local DZD-specific messages so the field-level errors are clear).
export const step3Schema = z
  .object({
    budgetMin: z
      .number({ message: "الحد الأدنى للميزانية مطلوب" })
      .int("يجب أن يكون رقماً صحيحاً")
      .min(1_000_000, "الحد الأدنى 1,000,000 دج"),
    budgetMax: z
      .number({ message: "الحد الأقصى للميزانية مطلوب" })
      .int("يجب أن يكون رقماً صحيحاً")
      .min(2_000_000, "الحد الأقصى 2,000,000 دج"),
    areaMin: z
      .number({ message: "المساحة الدنيا مطلوبة" })
      .int()
      .min(30, "الحد الأدنى 30 م²"),
    areaMax: z
      .number({ message: "المساحة القصوى مطلوبة" })
      .int()
      .min(50, "الحد الأدنى 50 م²"),
    bedrooms: z
      .number({ message: "عدد الغرف مطلوب" })
      .int()
      .min(0, "0 = استوديو")
      .max(15, "الحد الأقصى 15 غرفة"),
    bathrooms: z
      .number({ message: "عدد الحمامات مطلوب" })
      .int()
      .min(1, "حمام واحد على الأقل")
      .max(10),
    parking: z
      .number({ message: "عدد المواقف مطلوب" })
      .int()
      .min(0)
      .max(10),
  })
  .refine((d) => d.budgetMax > d.budgetMin, {
    path: ["budgetMax"],
    message: "الحد الأقصى يجب أن يكون أكبر من الحد الأدنى",
  })
  .refine((d) => d.areaMax > d.areaMin, {
    path: ["areaMax"],
    message: "المساحة القصوى يجب أن تكون أكبر من الدنيا",
  });

export type Step3Data = z.infer<typeof step3Schema>;

interface Props {
  form: ReturnType<typeof useForm<Step3Data>>;
  onSubmit: (v: Step3Data) => void;
  onBack: () => void;
}

// DZD budget quick-adjust steps
const BUDGET_STEP = 500_000; // 500K DZD
const AREA_STEP = 10; // 10 m²

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  step = BUDGET_STEP,
}: {
  label: string;
  value: number | string;
  onChange: (n: number) => void;
  placeholder?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder={placeholder}
          className="h-12 text-base pl-16 tabular-nums"
        />
        {suffix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {/* Quick adjust */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, (Number(value) || 0) - step))}
          className="px-3 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/70 text-secondary-foreground transition"
        >
          − {step.toLocaleString("en-US")}
        </button>
        <button
          type="button"
          onClick={() => onChange((Number(value) || 0) + step)}
          className="px-3 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/70 text-secondary-foreground transition"
        >
          + {step.toLocaleString("en-US")}
        </button>
      </div>
    </div>
  );
}

export function Step3Budget({ form, onSubmit, onBack }: Props) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Budget range */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            الميزانية (دج)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="budgetMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    الحد الأدنى
                  </FormLabel>
                  <FormControl>
                    <NumberField
                      label=""
                      value={field.value ?? ""}
                      onChange={(n) => field.onChange(n)}
                      placeholder="5,000,000"
                      suffix="دج"
                      step={BUDGET_STEP}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="budgetMax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    الحد الأقصى
                  </FormLabel>
                  <FormControl>
                    <NumberField
                      label=""
                      value={field.value ?? ""}
                      onChange={(n) => field.onChange(n)}
                      placeholder="15,000,000"
                      suffix="دج"
                      step={BUDGET_STEP}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {/* Live preview */}
          <div className="mt-3 p-3 rounded-lg bg-secondary/60 text-xs text-muted-foreground">
            نبحث عن عقارات بين{" "}
            <span className="font-bold text-foreground tabular-nums">
              {formatDZD(form.watch("budgetMin") || 0)}
            </span>{" "}
            و{" "}
            <span className="font-bold text-foreground tabular-nums">
              {formatDZD(form.watch("budgetMax") || 0)}
            </span>
          </div>
        </div>

        {/* Area range */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Maximize className="w-4 h-4" />
            المساحة (م²)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="areaMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    من
                  </FormLabel>
                  <FormControl>
                    <NumberField
                      label=""
                      value={field.value ?? ""}
                      onChange={(n) => field.onChange(n)}
                      placeholder="80"
                      suffix="م²"
                      step={AREA_STEP}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="areaMax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    إلى
                  </FormLabel>
                  <FormControl>
                    <NumberField
                      label=""
                      value={field.value ?? ""}
                      onChange={(n) => field.onChange(n)}
                      placeholder="180"
                      suffix="م²"
                      step={AREA_STEP}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Rooms selectors */}
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="bedrooms"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs flex items-center gap-1.5">
                  <BedDouble className="w-3.5 h-3.5" />
                  غرف النوم
                </FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i === 0 ? "استوديو" : `${i}+`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bathrooms"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs flex items-center gap-1.5">
                  <Bath className="w-3.5 h-3.5" />
                  الحمامات
                </FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {i + 1}+
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="parking"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" />
                  المواقف
                </FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i === 0 ? "بدون" : `${i}+`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <StepFooter onBack={onBack} />
      </form>
    </Form>
  );
}
