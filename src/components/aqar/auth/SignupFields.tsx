"use client";

// ──────────────────────────────────────────────────────────────────
//  SignupFields — email + password + name (+ optional phone) signup.
//
//  Uses LoginFields' password input (with strength meter) but adds
//  name + optional phone fields. On submit, calls /api/auth/signup.
// ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Mail, User, Phone, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { PasswordInput } from "./PasswordInput";

interface Props {
  onSubmit: (vals: {
    email: string;
    password: string;
    fullName: string;
    nin: string;
    phone?: string;
    rememberMe: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  loading?: boolean;
  onSwitchToLogin?: () => void;
  onUsePhone?: () => void;
}

export function SignupFields({
  onSubmit,
  loading = false,
  onSwitchToLogin,
  onUsePhone,
}: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [nin, setNin] = useState("");
  const [phone, setPhone] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit({
        email,
        password,
        fullName,
        nin,
        phone: phone || undefined,
        rememberMe,
      });
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
      {/* Full name */}
      <div className="space-y-1.5">
        <Label htmlFor="fullName" className="text-xs">{t("auth.label.fullName")}</Label>
        <div className="relative">
          <User className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("auth.placeholder.fullName")}
            className="ps-9 h-12"
            required
            minLength={3}
            maxLength={80}
            disabled={busy}
          />
        </div>
      </div>

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

      {/* NIN (National ID — required) */}
      <div className="space-y-1.5">
        <Label htmlFor="nin" className="text-xs">
          {t("auth.label.nin")}
        </Label>
        <div className="relative">
          <CreditCard className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="nin"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, "").slice(0, 18))}
            placeholder={t("auth.placeholder.nin")}
            className="ps-9 h-12 bg-muted/50 cursor-not-allowed"
            required
            pattern="\d{18}"
            minLength={18}
            maxLength={18}
            disabled
            readOnly
            aria-readonly="true"
            dir="ltr"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">{t("auth.hint.nin")}</p>
      </div>

      {/* Phone (optional) */}
      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-xs">
          {t("auth.label.phone")} <span className="text-muted-foreground">({t("common.optional")})</span>
        </Label>
        <div className="relative">
          <Phone className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05XXXXXXXX"
            className="ps-9 h-12"
            disabled={busy}
            dir="ltr"
          />
        </div>
      </div>

      {/* Password (with strength meter) */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs">{t("auth.label.password")}</Label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength={true}
          disabled={busy}
        />
      </div>

      {/* Remember-me */}
      <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
        <Checkbox
          checked={rememberMe}
          onCheckedChange={(v) => setRememberMe(v === true)}
          disabled={busy}
        />
        {t("auth.rememberMe")}
      </label>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" disabled={busy} className="w-full h-12 gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {t("auth.btn.signup")}
      </Button>

      {/* Switch to phone signup */}
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

      {/* Switch to login */}
      {onSwitchToLogin && (
        <p className="text-xs text-center text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary hover:underline font-medium"
            disabled={busy}
          >
            {t("auth.btn.login")}
          </button>
        </p>
      )}
    </form>
  );
}
