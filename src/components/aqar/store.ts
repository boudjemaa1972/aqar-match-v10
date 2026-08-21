"use client";

// ──────────────────────────────────────────────────────────────────
//  Shared types & store for the Aqar matching flow.
//  Zustand holds the wizard state across steps without a server round-trip.
// ──────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { BlindMatch } from "@/lib/schemas";

export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardData {
  // step 1
  intent: "SELL" | "RENT" | null;
  type:
    | "APARTMENT"
    | "VILLA"
    | "STUDIO"
    | "DUPLEX"
    | "LAND"
    | "COMMERCIAL"
    | null;
  // step 2 — wilaya + commune + neighbourhood
  city: string | null; // wilaya
  commune: string;
  district: string; // neighbourhood (free text, optional)
  // step 3
  budgetMin: number | null;
  budgetMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  // step 4
  features: string[];
}

interface AqarState {
  // Wizard state
  step: WizardStep;
  data: WizardData;
  setStep: (s: WizardStep) => void;
  next: () => void;
  prev: () => void;
  patch: (p: Partial<WizardData>) => void;
  reset: () => void;

  // Matching state
  isMatching: boolean;
  matches: BlindMatch[];
  matchError: string | null;
  requestRef: string | null;
  setMatching: (b: boolean) => void;
  setMatches: (m: BlindMatch[], ref: string) => void;
  setMatchError: (e: string | null) => void;
  resetMatch: () => void;
}

const initialData: WizardData = {
  intent: null,
  type: null,
  city: null,
  commune: "",
  district: "",
  budgetMin: null,
  budgetMax: null,
  areaMin: null,
  areaMax: null,
  bedrooms: 2,
  bathrooms: 2,
  parking: 1,
  features: [],
};

export const useAqar = create<AqarState>((set) => ({
  step: 1,
  data: initialData,
  setStep: (s) => set({ step: s }),
  next: () => set((st) => ({ step: Math.min(4, st.step + 1) as WizardStep })),
  prev: () => set((st) => ({ step: Math.max(1, st.step - 1) as WizardStep })),
  patch: (p) => set((st) => ({ data: { ...st.data, ...p } })),
  reset: () => set({ step: 1, data: initialData }),

  isMatching: false,
  matches: [],
  matchError: null,
  requestRef: null,
  setMatching: (b) => set({ isMatching: b }),
  setMatches: (m, ref) => set({ matches: m, requestRef: ref, matchError: null }),
  setMatchError: (e) => set({ matchError: e }),
  resetMatch: () => set({ matches: [], requestRef: null, matchError: null }),
}));

// ─── Helpers ─────────────────────────────────────────────────────
// Currency: Algerian Dinar (DZD).
// to it for backward compatibility with any component still using
// the old name.
export function formatDZD(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "— دج";
  return `${Number(n).toLocaleString("en-US")} دج`;
}

// Backward-compat alias

export function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-primary";
  if (score >= 55) return "text-gold";
  return "text-muted-foreground";
}

export function scoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 70) return "bg-primary";
  if (score >= 55) return "bg-amber-500";
  return "bg-muted-foreground";
}
