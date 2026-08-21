"use client";

// ──────────────────────────────────────────────────────────────────
//  LoginFields — email + password form (shared between login & signup).
//
//  Extracted as a reusable sub-component so the login and signup
//  modals can share the same field layout, validation behavior, and
//  show/hide password toggle.
// ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { PasswordInput } from "./PasswordInput";

interface Props {
  // Submit handler — receives the form values + returns a promise
  // that resolves to { ok: true } or { ok: false, error: string }.
  onSubmit: (vals: {
    email: string;
    password: string;
    rememberMe: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  submitLabel: string;
  loading?: boolean;
  // If provided, shown as a link below the submit button
  onForgotPassword?: () => void;
  // If provided, switch to phone-OTP login
  onUsePhone?: () => void;
  // If provided, switch to signup
  onSwitchToSignup?: () => void;
  // Default values (for re-mount after navigation)
  defaultEmail?: string;
}

export function LoginFields({
  onSubmit,
  submitLabel,
  loading = false,
  onForgotPassword,
  onUsePhone,
  onSwitchToSignup,
  defaultEmail = "",
}: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit({ email, password, rememberMe });
      if (!result.ok) {
        setError(result.error || t("auth.error.generic"));
      }
    } catch {
      setError(t("auth.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = loading || submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs">{t("auth.label.email")}</Label>
        <div className="relative">
          <Mail className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.placeholder.email")}
            className="ps-9 h-12"
            required
            disabled={busy}
            dir="ltr"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs">{t("auth.label.password")}</Label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          showStrength={false}
          disabled={busy}
          placeholder={t("auth.placeholder.password")}
        />
      </div>

      {/* Remember-me + forgot password */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
          <Checkbox
            checked={rememberMe}
            onCheckedChange={(v) => setRememberMe(v === true)}
            disabled={busy}
          />
          {t("auth.rememberMe")}
        </label>
        {onForgotPassword && (
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs text-primary hover:underline"
            disabled={busy}
          >
            {t("auth.forgotPassword")}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" disabled={busy} className="w-full h-12 gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {submitLabel}
      </Button>

      {/* Switch to phone login */}
      {onUsePhone && (
        <button
          type="button"
          onClick={onUsePhone}
          className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline"
          disabled={busy}
        >
          {t("auth.usePhoneInstead")}
        </button>
      )}

      {/* Switch to signup */}
      {onSwitchToSignup && (
        <p className="text-xs text-center text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="text-primary hover:underline font-medium"
            disabled={busy}
          >
            {t("auth.btn.signup")}
          </button>
        </p>
      )}
    </form>
  );
}
