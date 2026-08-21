"use client";

// ──────────────────────────────────────────────────────────────────
//  MissingFieldsHelper — shows a small "complete these to continue"
//  hint listing the missing required fields on the current step.
//
//  Renders ONLY when `missing` is non-empty. Otherwise renders nothing.
//
//  Usage:
//    <MissingFieldsHelper missing={missingFields} />
// ──────────────────────────────────────────────────────────────────

import { AlertCircle } from "lucide-react";

interface Props {
  missing: string[];
  className?: string;
}

export function MissingFieldsHelper({ missing, className = "" }: Props) {
  if (missing.length === 0) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 ${className}`}
      role="status"
      aria-live="polite"
    >
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <div className="leading-relaxed">
        <span className="font-semibold">يتبقى لإكمال الخطوة:</span>{" "}
        <span className="text-amber-700 dark:text-amber-300">{missing.join(" • ")}</span>
      </div>
    </div>
  );
}
