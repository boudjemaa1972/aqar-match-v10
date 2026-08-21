"use client";

// ──────────────────────────────────────────────────────────────────
//  PasswordInput — password field with show/hide toggle + strength meter.
//
//  The strength meter uses the same logic as the server-side Zod schema
//  (checkPasswordStrength in src/lib/auth/password.ts), so client and
//  server agree on what counts as a "strong" password.
//
//  SECURITY:
//  ─────────
//  • The password is held in component state only — never logged,
//    never persisted to localStorage, never sent to any analytics.
//  • The "show" toggle uses type="text" temporarily — fine because
//    the user explicitly toggled it; they understand the risk.
//  • Autofill is enabled (autocomplete="new-password" / "current-password")
//    so password managers work properly.
// ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Eye, EyeOff, Lock, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: "new-password" | "current-password";
  disabled?: boolean;
  showStrength?: boolean; // default true
  hasError?: boolean;
}

interface StrengthInfo {
  score: 0 | 1 | 2 | 3 | 4;
  ok: boolean;
  issues: string[];
}

// Mirror of checkPasswordStrength in src/lib/auth/password.ts
function checkStrength(pw: string): StrengthInfo {
  const issues: string[] = [];
  if (pw.length < 8) issues.push("PASSWORD_TOO_SHORT");
  if (!/[A-Z]/.test(pw)) issues.push("PASSWORD_NO_UPPERCASE");
  if (!/[a-z]/.test(pw)) issues.push("PASSWORD_NO_LOWERCASE");
  if (!/\d/.test(pw)) issues.push("PASSWORD_NO_DIGIT");
  if (!/[!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]/.test(pw)) issues.push("PASSWORD_NO_SYMBOL");
  const score = Math.max(0, Math.min(4, 4 - issues.length)) as 0 | 1 | 2 | 3 | 4;
  return { score, ok: score >= 3, issues };
}

const STRENGTH_LABELS = ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"];
const STRENGTH_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-primary",
  "bg-emerald-500",
];

const ISSUE_LABELS: Record<string, { ar: string; fr: string }> = {
  PASSWORD_TOO_SHORT: { ar: "8 أحرف على الأقل", fr: "8 caractères min" },
  PASSWORD_NO_UPPERCASE: { ar: "حرف كبير (A-Z)", fr: "1 majuscule" },
  PASSWORD_NO_LOWERCASE: { ar: "حرف صغير (a-z)", fr: "1 minuscule" },
  PASSWORD_NO_DIGIT: { ar: "رقم (0-9)", fr: "1 chiffre" },
  PASSWORD_NO_SYMBOL: { ar: "رمز خاص (!@#$...)", fr: "1 symbole" },
};

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  disabled = false,
  showStrength = true,
  hasError = false,
}: Props) {
  const { t, lang } = useI18n();
  const [show, setShow] = useState(false);
  const strength = checkStrength(value);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Lock className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || t("auth.placeholder.password")}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`ps-9 pe-10 h-12 ${hasError ? "border-destructive" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute top-1/2 -translate-y-1/2 end-3 p-1 text-muted-foreground hover:text-foreground transition"
          aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {showStrength && value && (
        <div className="space-y-2">
          {/* Strength meter bar */}
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < strength.score ? STRENGTH_COLORS[strength.score] : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {lang === "ar" ? "القوة: " : "Force: "}
              <span className="font-medium text-foreground">
                {lang === "ar" ? STRENGTH_LABELS[strength.score] : ["Très faible", "Faible", "Moyenne", "Bonne", "Forte"][strength.score]}
              </span>
            </span>
            {strength.ok && (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {lang === "ar" ? "مقبولة" : "Acceptable"}
              </span>
            )}
          </p>

          {/* Issue checklist — shows what's missing */}
          {strength.issues.length > 0 && (
            <ul className="grid grid-cols-2 gap-1 mt-2">
              {Object.keys(ISSUE_LABELS).map((key) => {
                const missing = strength.issues.includes(key);
                const label = ISSUE_LABELS[key][lang];
                return (
                  <li
                    key={key}
                    className={`text-[10px] flex items-center gap-1 ${
                      missing ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {missing ? (
                      <X className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <Check className="w-3 h-3 flex-shrink-0" />
                    )}
                    {label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
