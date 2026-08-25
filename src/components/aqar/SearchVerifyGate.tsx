"use client";

// ──────────────────────────────────────────────────────────────────
//  SearchVerifyGate — verification gate for the search flow.
//
//  Supports TWO verification methods:
//   • Phone OTP (default) — enter Algerian phone number → OTP → verify
//   • Email OTP — enter email → OTP → verify
//
//  If user is already verified (phone or email), shows a green badge.
//  User can toggle between phone and email verification.
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Phone, KeyRound, Loader2, ArrowLeft, CheckCircle2,
  AlertCircle, RefreshCw, Mail,
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
  onVerified: (user: VerifiedUser) => void;
  explanation?: string;
  compact?: boolean;
}

type VerifyMode = "phone" | "email";
type PhoneStep = "checking" | "verified" | "phone" | "code" | "success";

export function SearchVerifyGate({ onVerified, explanation, compact = false }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<VerifyMode>("phone");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("checking");
  const [phone, setPhone] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("aqar_otp_phone") || "";
    }
    return "";
  });
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("aqar_otp_devCode") || null;
    }
    return null;
  });
  const [resendCooldown, setResendCooldown] = useState(0);

  // Email verification state
  const [emailStep, setEmailStep] = useState<"checking" | "verified" | "email" | "code" | "success">("checking");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailDevCode, setEmailDevCode] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);

  // Persist phone + devCode to sessionStorage
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
        const u = json?.user;
        if (u && !u.isGuest && (u.verified || u.emailVerified || u.phoneVerified)) {
          setPhoneStep("verified");
          setEmailStep("verified");
          onVerified({ name: u.name, phone: u.phone });
          return;
        }
      }
      // Not verified
      if (devCode && phone) {
        setPhoneStep("code");
      } else {
        setPhoneStep("phone");
      }
      setEmailStep("email");
    } catch {
      setPhoneStep("phone");
      setEmailStep("email");
    }
  }, [onVerified, devCode, phone]);

  useEffect(() => { checkSession(); }, [checkSession]);

  // ── Resend cooldown timers ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);
  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const timer = setInterval(() => setEmailResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [emailResendCooldown]);

  // ── Phone: Send OTP ──
  async function handlePhoneSend() {
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
      setResendCooldown(60);
      setPhoneStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  // ── Phone: Verify OTP ──
  async function handlePhoneVerify() {
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
        throw new Error(json?.error || t("auth.error.invalidCode"));
      }
      setPhoneStep("success");
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("aqar_otp_phone");
        sessionStorage.removeItem("aqar_otp_devCode");
      }
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

  // ── Email: Request verification code ──
  async function handleEmailRequest() {
    setEmailError(null);
    if (!email.trim() || !email.includes("@")) {
      setEmailError(t("auth.error.emailInvalid") || "بريد غير صالح");
      return;
    }
    setEmailLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; devCode?: string } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok) {
        // If user not found, try signup-style verification
        // Fall through — the resend endpoint may have sent an OTP
      }
      if (json?.devCode) setEmailDevCode(json.devCode);
      setEmailResendCooldown(60);
      setEmailStep("code");
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : t("auth.error.generic"));
    } finally {
      setEmailLoading(false);
    }
  }

  // ── Email: Verify OTP ──
  async function handleEmailVerify() {
    setEmailError(null);
    if (!/^\d{6}$/.test(emailCode)) {
      setEmailError(t("auth.error.codeFormat"));
      return;
    }
    setEmailLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: emailCode }),
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; user?: { name?: string; phone?: string } } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t("auth.error.invalidCode"));
      }
      setEmailStep("success");
      // After email verification, also set the phoneVerified/verified in session
      // by refreshing /api/auth/me
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (meRes.ok) {
        const meJson = await meRes.json();
        onVerified({
          name: meJson?.user?.name || null,
          phone: meJson?.user?.phone || null,
        });
      } else {
        onVerified({ name: null, phone: null });
      }
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : t("auth.error.generic"));
    } finally {
      setEmailLoading(false);
    }
  }

  // ── Already verified badge ──
  if (phoneStep === "verified" || emailStep === "verified") {
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
        </div>
      </motion.div>
    );
  }

  // ── Success (brief animation) ──
  if (phoneStep === "success" || emailStep === "success") {
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

  // ── Mode toggle ──
  const ModeToggle = () => (
    <div className="flex rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setMode("phone")}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition ${
          mode === "phone" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        <Phone className="w-3.5 h-3.5" />
        {t("auth.title.phone") || "الهاتف"}
      </button>
      <button
        onClick={() => setMode("email")}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition ${
          mode === "email" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mail className="w-3.5 h-3.5" />
        {t("auth.label.email") || "البريد"}
      </button>
    </div>
  );

  // ── Phone verification form ──
  if (mode === "phone") {
    return (
      <div className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5"} space-y-4`}>
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

        <ModeToggle />

        {phoneStep === "checking" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("buyer.dashboard.loading")}
          </div>
        )}

        {phoneStep === "phone" && (
          <>
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
              onClick={handlePhoneSend}
              disabled={loading || phone.trim().length < 10}
              className="w-full h-12"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.btn.sendCode")}
            </Button>
          </>
        )}

        {phoneStep === "code" && (
          <>
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
            </div>
            <Button
              onClick={handlePhoneVerify}
              disabled={loading || code.length !== 6}
              className="w-full h-12"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.btn.verify")}
            </Button>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => { setPhoneStep("phone"); setError(null); setCode(""); }}
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
                  onClick={handlePhoneSend}
                  disabled={loading}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t("phoneGate.resend")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Email verification form ──
  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5"} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">
            {t("auth.title.verifyEmail") || "تأكيد البريد الإلكتروني"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {t("phoneGate.searchExplanation") || "أدخل بريدك الإلكتروني لتأكيد هويتك"}
          </p>
        </div>
      </div>

      <ModeToggle />

      {emailStep === "email" && (
        <>
          {emailError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{emailError}</span>
            </div>
          )}
          <div>
            <Label className="text-xs mb-1.5 block">{t("auth.label.email") || "البريد الإلكتروني"}</Label>
            <div className="relative">
              <Mail className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground start-3" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="h-12 ps-10"
                dir="ltr"
                type="email"
                autoComplete="email"
                disabled={emailLoading}
              />
            </div>
          </div>
          <Button
            onClick={handleEmailRequest}
            disabled={emailLoading || !email.trim() || !email.includes("@")}
            className="w-full h-12"
          >
            {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.btn.sendCode") || "إرسال الرمز"}
          </Button>
        </>
      )}

      {emailStep === "code" && (
        <>
          {emailDevCode && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <span className="font-mono font-bold">{emailDevCode}</span>
              <span>— {t("auth.dev.badge")}</span>
            </div>
          )}
          {emailError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{emailError}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {t("auth.hint.codeSentTo") || "تم إرسال الرمز إلى"} <span dir="ltr" className="font-medium">{email}</span>
          </p>
          <div>
            <Label className="text-xs mb-1.5 block">{t("auth.label.code") || "رمز التحقق"}</Label>
            <div className="relative">
              <KeyRound className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground start-3" />
              <Input
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="------"
                className="h-12 ps-10 font-mono text-center text-xl tracking-[0.5em]"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={emailLoading}
              />
            </div>
          </div>
          <Button
            onClick={handleEmailVerify}
            disabled={emailLoading || emailCode.length !== 6}
            className="w-full h-12"
          >
            {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.btn.verify") || "تأكيد"}
          </Button>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => { setEmailStep("email"); setEmailError(null); setEmailCode(""); }}
              disabled={emailLoading}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              {t("auth.btn.changePhone") || "تغيير البريد"}
            </button>
            {emailResendCooldown > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t("phoneGate.resendIn", { s: emailResendCooldown })}
              </span>
            ) : (
              <button
                onClick={handleEmailRequest}
                disabled={emailLoading}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                {t("phoneGate.resend") || "إعادة الإرسال"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
