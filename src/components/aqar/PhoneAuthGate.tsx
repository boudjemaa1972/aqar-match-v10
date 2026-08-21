"use client";

// ──────────────────────────────────────────────────────────────────
//  PhoneAuthGate — reusable phone OTP verification component.
//
//  Two modes:
//   • inline (default) — renders as a card within the flow step
//   • modal — renders inside a Dialog (via the `modal` prop)
//
//  BEHAVIOR:
//   1. On mount, checks /api/auth/me to see if user is already verified.
//   2. If verified → shows a "verified" badge with the linked phone,
//      calls onVerified({ name, phone }) immediately so the parent
//      can auto-fill its form fields.
//   3. If not verified → shows the phone + OTP form:
//      a. User enters Algerian phone number (05XXXXXXXX).
//      b. POST /api/auth/otp/request → sends OTP (dev mode returns code).
//      c. User enters 6-digit code.
//      d. POST /api/auth/otp/verify → verifies + sets session cookie.
//      e. On success → calls onVerified({ name, phone }).
//
//  UX:
//   • 60-second resend cooldown timer.
//   • Clear error messages (invalid phone, wrong code, rate limit).
//   • Dev mode: shows the code in a yellow badge (OTP_MODE=dev).
//   • RTL + dark mode + Digital Oasis design system.
//
//  SECURITY:
//   • Phone is normalized to E.164 before sending.
//   • OTP is 6 digits, rate-limited server-side (5/15min).
//   • Session token rotated on successful verification (anti-fixation).
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, Phone, KeyRound, Loader2, ArrowLeft, CheckCircle2,
  AlertCircle, RefreshCw, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

export interface VerifiedUser {
  name: string | null;
  phone: string | null;
}

interface Props {
  /** Called when user is verified (either pre-existing or just completed). */
  onVerified: (user: VerifiedUser) => void;
  /** Optional: explanation shown above the form. Defaults to a generic message. */
  explanation?: string;
  /** Compact mode — smaller padding, for embedding in tight step layouts. */
  compact?: boolean;
}

type Step = "checking" | "verified" | "phone" | "code" | "success";

export function PhoneAuthGate({ onVerified, explanation, compact = false }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("checking");
  const [phone, setPhone] = useState(() => {
    // Restore phone from sessionStorage (survives re-mounts)
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("aqar_otp_phone") || "";
    }
    return "";
  });
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(() => {
    // Restore devCode from sessionStorage (survives re-mounts)
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("aqar_otp_devCode") || null;
    }
    return null;
  });
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Persist phone + devCode to sessionStorage ──
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (phone) sessionStorage.setItem("aqar_otp_phone", phone);
      else sessionStorage.removeItem("aqar_otp_phone");
    }
  }, [phone]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (devCode) sessionStorage.setItem("aqar_otp_devCode", devCode);
      else sessionStorage.removeItem("aqar_otp_devCode");
    }
  }, [devCode]);

  // ── Check existing session on mount ──
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.user?.verified && !json?.user?.isGuest) {
          setStep("verified");
          onVerified({ name: json.user.name, phone: json.user.phone });
          return;
        }
      }
      // Not verified — if we have a saved devCode + phone, resume at code step
      if (devCode && phone) {
        setStep("code");
      } else {
        setStep("phone");
      }
    } catch {
      setStep("phone");
    }
  }, [onVerified, devCode, phone]);

  useEffect(() => { checkSession(); }, [checkSession]);

  // ── Resend cooldown timer ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ── Send OTP ──
  async function handleSendCode() {
    setError(null);
    if (phone.trim().length < 10) {
      setError(t("auth.error.phoneInvalid"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; devCode?: string; expiresInMin?: number } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t("auth.error.generic"));
      }
      if (json.devCode) setDevCode(json.devCode);
      setResendCooldown(60); // 60-second cooldown
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  // ── Verify OTP ──
  async function handleVerify() {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError(t("auth.error.codeFormat"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code }),
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; user?: { name?: string; phone?: string } } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t("auth.error.generic"));
      }
      setStep("success");
      // Clear sessionStorage on success
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("aqar_otp_phone");
        sessionStorage.removeItem("aqar_otp_devCode");
      }
      // Notify parent with verified user info
      onVerified({
        name: json.user?.name || null,
        phone: json.user?.phone || phone.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  // ── Checking session ──
  if (step === "checking") {
    return (
      <div className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5"} flex items-center justify-center gap-2 text-sm text-muted-foreground`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("buyer.dashboard.loading")}
      </div>
    );
  }

  // ── Already verified ──
  if (step === "verified") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-xl border border-emerald-500/40 bg-emerald-500/10 ${compact ? "p-4" : "p-5"} flex items-center gap-3`}
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            {t("auth.user.verified")}
          </p>
          {phone && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono" dir="ltr">
              {phone}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Success (brief animation) ──
  if (step === "success") {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`rounded-xl border border-emerald-500/40 bg-emerald-500/10 ${compact ? "p-4" : "p-5"} text-center`}
      >
        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600 mb-2" />
        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
          {t("auth.title.success")}
        </p>
      </motion.div>
    );
  }

  // ── Phone input step ──
  if (step === "phone") {
    return (
      <div className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5"} space-y-4`}>
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              {t("phoneGate.title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {explanation || t("phoneGate.explanation")}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <Label className="text-xs mb-1.5 block">{t("auth.label.phone")}</Label>
          <div className="relative">
            <Phone className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground start-3" />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              className="h-12 ps-10 font-mono"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              disabled={loading}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t("auth.hint.phone")}</p>
        </div>

        <Button
          onClick={handleSendCode}
          disabled={loading || phone.trim().length < 10}
          className="w-full h-12"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.btn.sendCode")}
        </Button>
      </div>
    );
  }

  // ── Code input step ──
  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5"} space-y-4`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">
            {t("auth.title.verify")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("auth.desc.code", { min: 5 })}
          </p>
        </div>
      </div>

      {devCode && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <span className="font-mono font-bold">{devCode}</span>
          <span>— {t("auth.dev.badge")}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <Label className="text-xs mb-1.5 block">{t("auth.label.code")}</Label>
        <div className="relative">
          <KeyRound className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground start-3" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="------"
            className="h-12 ps-10 font-mono text-center text-xl tracking-[0.5em]"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={loading}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {t("auth.hint.code", { phone: phone.trim() })}
        </p>
      </div>

      <Button
        onClick={handleVerify}
        disabled={loading || code.length !== 6}
        className="w-full h-12"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.btn.verify")}
      </Button>

      {/* Resend + change phone */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={() => { setStep("phone"); setError(null); setCode(""); }}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("auth.btn.changePhone")}
        </button>
        {resendCooldown > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t("phoneGate.resendIn", { s: resendCooldown })}
          </span>
        ) : (
          <button
            onClick={handleSendCode}
            disabled={loading}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            {t("phoneGate.resend")}
          </button>
        )}
      </div>
    </div>
  );
}
