"use client";

// ──────────────────────────────────────────────────────────────────
//  AuthModal — multi-mode auth dialog.
//
//  Modes:
//  ─────
//  • "login"     → email + password
//  • "signup"    → email + password + name (+ optional phone)
//  • "phone"     → phone number → OTP → verify (legacy phone flow)
//  • "forgot"    → email → send password reset link
//  • "reset"     → new password form (after clicking the reset link)
//  • "verify-email-otp" → 6-digit email verification code (post-signup)
//
//  The modal handles transitions between modes (e.g., "login → forgot"
//  via the "forgot password?" link). The parent caller doesn't need
//  to know which mode the user ended up in — they just get the
//  onAuthenticated() callback when auth succeeds.
//
//  INITIAL MODE:
//  ────────────
//  The parent can set `initialMode` to open the modal directly in a
//  specific mode (e.g., the reset-password URL opens it in "reset"
//  mode with the token already in the URL). Defaults to "login".
//
//  SECURITY:
//  ────────
//  • All transitions are client-side — no extra HTTP requests until
//    the user submits a form.
//  • The reset mode reads the token from the URL on mount (via
//    initialToken prop) — never from localStorage.
//  • On successful auth, the modal closes + calls onAuthenticated().
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ArrowLeft, CheckCircle2, ShieldCheck, Phone, KeyRound } from "lucide-react";
import { LoginFields } from "./LoginFields";
import { SignupFields } from "./SignupFields";
import { PasswordInput } from "./PasswordInput";
import { OtpInput } from "./OtpInput";

export type AuthMode =
  | "login"
  | "signup"
  | "phone"
  | "phone-otp"
  | "forgot"
  | "reset"
  | "verify-email-otp";

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  initialMode?: AuthMode;
  // For "reset" mode — the token from the email link (?token=...)
  initialToken?: string;
  // For "verify-email-otp" mode — the email to verify
  initialEmail?: string;
}

export function AuthModal({
  open,
  onClose,
  onAuthenticated,
  initialMode = "login",
  initialToken,
  initialEmail,
}: Props) {
  const { t, dir } = useI18n();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);

  // ── Phone-OTP state (kept from the legacy modal) ──
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [expiresInMin, setExpiresInMin] = useState(5);

  // ── Forgot-password state ──
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // ── Reset-password state ──
  const [resetToken, setResetToken] = useState(initialToken || "");
  const [resetPassword, setResetPassword] = useState("");

  // ── Email verification OTP state ──
  const [verifyEmail, setVerifyEmail] = useState(initialEmail || "");
  const [verifyCode, setVerifyCode] = useState("");

  // ── Shared error + success ──
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync initialMode when the modal opens
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setSuccess(null);
      if (initialToken) setResetToken(initialToken);
      if (initialEmail) {
        setVerifyEmail(initialEmail);
        setForgotEmail(initialEmail);
      }
    }
  }, [open, initialMode, initialToken, initialEmail]);

  function reset() {
    setPhone("");
    setCode("");
    setDevCode(null);
    setForgotEmail("");
    setForgotSent(false);
    setResetPassword("");
    setVerifyCode("");
    setError(null);
    setSuccess(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Phone-OTP handlers (kept from legacy) ──
  async function handlePhoneRequest() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok || !json.ok) {
        const msg = (typeof json?.error === "string" && json.error) || t("auth.error.generic");
        const detail = typeof json?.debugCode === "string" ? ` (${json.debugCode})` : "";
        setError(msg + detail);
        return;
      }
      setExpiresInMin(json.expiresInMin || 5);
      if (json.devCode) setDevCode(json.devCode);
      setMode("phone-otp");
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError(t("auth.error.network"));
      } else {
        setError(t("auth.error.generic") + (e instanceof Error ? `: ${e.message}` : ""));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneVerify() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok || !json.ok) {
        setError((typeof json?.error === "string" && json.error) || t("auth.error.invalidCode"));
        return;
      }
      // Success — close + notify parent
      onAuthenticated();
      handleClose();
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError(t("auth.error.network"));
      } else {
        setError(t("auth.error.generic") + (e instanceof Error ? `: ${e.message}` : ""));
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Email + password handlers ──
  async function handleLoginSubmit(vals: {
    email: string;
    password: string;
    rememberMe: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) {
        return { ok: false, error: (typeof json?.error === "string" && json.error) || t("auth.error.invalidCredentials") };
      }
      onAuthenticated();
      handleClose();
      return { ok: true };
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        return { ok: false, error: t("auth.error.network") };
      }
      return { ok: false, error: t("auth.error.generic") };
    }
  }

  async function handleSignupSubmit(vals: {
    email: string;
    password: string;
    fullName: string;
    nin: string;
    phone?: string;
    rememberMe: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) {
        const msg = (typeof json?.error === "string" && json.error) || t("auth.error.generic");
        const detail = typeof json?.debugCode === "string" ? ` (${json.debugCode})` : "";
        return { ok: false, error: msg + detail };
      }
    // Signup succeeded — user needs email verification before full access.
    // We auto-login (session cookie set by the API), but show a banner
    // telling them to check their email.
    if (json.devCode) {
      setDevCode(json.devCode);
    }
    setVerifyEmail(vals.email);
    onAuthenticated(); // refresh the session in the parent
    setMode("verify-email-otp");
    setSuccess(t("auth.signupSuccess"));
    return { ok: true };
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        return { ok: false, error: t("auth.error.network") };
      }
      return { ok: false, error: t("auth.error.generic") + (e instanceof Error ? `: ${e.message}` : "") };
    }
  }

  // ── Forgot password ──
  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) {
        const msg = (typeof json?.error === "string" && json.error) || t("auth.error.generic");
        const detail = typeof json?.debugCode === "string" ? ` (${json.debugCode})` : "";
        setError(msg + detail);
        return;
      }
      setForgotSent(true);
      if (json.devLink) {
        // Dev mode — show the reset link directly
        setSuccess(json.devLink);
      }
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError(t("auth.error.network"));
      } else {
        setError(t("auth.error.generic") + (e instanceof Error ? `: ${e.message}` : ""));
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Reset password ──
  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: resetPassword }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) {
        setError((typeof json?.error === "string" && json.error) || t("auth.error.invalidResetToken"));
        return;
      }
      setSuccess(t("auth.resetSuccess"));
      // Auto-login after 1.5s
      setTimeout(() => {
        onAuthenticated();
        handleClose();
      }, 1500);
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError(t("auth.error.network"));
      } else {
        setError(t("auth.error.generic") + (e instanceof Error ? `: ${e.message}` : ""));
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Email verification OTP ──
  async function handleVerifyEmailOtp() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, code: verifyCode }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) {
        setError((typeof json?.error === "string" && json.error) || t("auth.error.invalidCode"));
        return;
      }
      setSuccess(t("auth.emailVerified"));
      onAuthenticated();
      setTimeout(() => handleClose(), 1500);
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError(t("auth.error.network"));
      } else {
        setError(t("auth.error.generic") + (e instanceof Error ? `: ${e.message}` : ""));
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──
  const title = {
    login: t("auth.title.login"),
    signup: t("auth.title.signup"),
    phone: t("auth.title.phone"),
    "phone-otp": t("auth.title.phoneOtp"),
    forgot: t("auth.title.forgot"),
    reset: t("auth.title.reset"),
    "verify-email-otp": t("auth.title.verifyEmail"),
  }[mode];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">{title}</DialogTitle>
          {mode !== "phone-otp" && mode !== "verify-email-otp" && (
            <DialogDescription className="text-center text-xs text-muted-foreground">
              {t("auth.subtitle." + mode)}
            </DialogDescription>
          )}
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: dir === "rtl" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
            transition={{ duration: 0.2 }}
            className="pt-2"
          >
            {/* ── LOGIN MODE ── */}
            {mode === "login" && (
              <LoginFields
                onSubmit={handleLoginSubmit}
                submitLabel={t("auth.btn.login")}
                loading={loading}
                onForgotPassword={() => setMode("forgot")}
                onUsePhone={() => setMode("phone")}
                onSwitchToSignup={() => setMode("signup")}
              />
            )}

            {/* ── SIGNUP MODE ── */}
            {mode === "signup" && (
              <SignupFields
                onSubmit={handleSignupSubmit}
                loading={loading}
                onSwitchToLogin={() => setMode("login")}
                onUsePhone={() => setMode("phone")}
              />
            )}

            {/* ── PHONE MODE (enter phone) ── */}
            {mode === "phone" && (
              <form
                onSubmit={(e) => { e.preventDefault(); void handlePhoneRequest(); }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="phone-input" className="text-xs">{t("auth.label.phone")}</Label>
                  <div className="relative">
                    <Phone className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="phone-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="05XXXXXXXX"
                      className="ps-9 h-12"
                      required
                      disabled={loading}
                      dir="ltr"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{t("auth.hint.phone")}</p>
                </div>

                {error && (
                  <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full h-12 gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                  {t("auth.btn.sendCode")}
                </Button>

                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3 rtl:rotate-180" />
                  {t("auth.useEmailInstead")}
                </button>
              </form>
            )}

            {/* ── PHONE-OTP MODE (enter 6-digit code) ── */}
            {mode === "phone-otp" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground text-center">
                  {t("auth.hint.codeSentTo")} <span dir="ltr" className="font-medium">{phone}</span>
                  <br />
                  {t("auth.hint.expiresIn", { min: expiresInMin })}
                </p>

                {/* ── DEV MODE WARNING — visible to user ──
                    When OTP_MODE=dev, the code is NOT sent via SMS.
                    It's returned in the API response + logged server-side.
                    This badge makes that crystal clear to avoid confusion
                    when real users accidentally hit a dev-mode deployment. */}
                {devCode && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2 text-center">
                      {t("auth.dev.codeLabel")}: <span className="font-bold" dir="ltr">{devCode}</span>
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />
                      {t("auth.dev.warningBadge")}
                    </div>
                  </div>
                )}

                <OtpInput value={code} onChange={setCode} hasError={!!error} disabled={loading} />

                {error && (
                  <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                    {error}
                  </p>
                )}

                <Button
                  onClick={() => void handlePhoneVerify()}
                  disabled={loading || code.length !== 6}
                  className="w-full h-12 gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {t("auth.btn.verify")}
                </Button>

                <button
                  type="button"
                  onClick={() => { setMode("phone"); setError(null); setCode(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3 rtl:rotate-180" />
                  {t("auth.btn.changePhone")}
                </button>
              </div>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {mode === "forgot" && (
              forgotSent ? (
                <div className="space-y-4 text-center py-4">
                  <Mail className="w-12 h-12 mx-auto text-primary" />
                  <p className="text-sm text-foreground">{t("auth.forgotSent")}</p>
                  {success && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2 break-all">
                      <span dir="ltr">{success}</span>
                    </p>
                  )}
                  <Button onClick={() => setMode("login")} variant="outline" className="w-full h-12">
                    {t("auth.btn.backToLogin")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-xs">{t("auth.label.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder={t("auth.placeholder.email")}
                        className="ps-9 h-12"
                        required
                        disabled={loading}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  {error && (
                    <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                      {error}
                    </p>
                  )}
                  <Button type="submit" disabled={loading} className="w-full h-12 gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {t("auth.btn.sendResetLink")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3 rtl:rotate-180" />
                    {t("auth.btn.backToLogin")}
                  </button>
                </form>
              )
            )}

            {/* ── RESET PASSWORD ── */}
            {mode === "reset" && (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <input type="hidden" value={resetToken} />
                <div className="space-y-1.5">
                  <Label htmlFor="reset-password" className="text-xs">{t("auth.label.newPassword")}</Label>
                  <PasswordInput
                    value={resetPassword}
                    onChange={setResetPassword}
                    autoComplete="new-password"
                    showStrength={true}
                    disabled={loading}
                  />
                </div>
                {error && (
                  <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded p-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    {success}
                  </p>
                )}
                <Button type="submit" disabled={loading || resetPassword.length < 8} className="w-full h-12 gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {t("auth.btn.resetPassword")}
                </Button>
              </form>
            )}

            {/* ── EMAIL VERIFICATION OTP ── */}
            {mode === "verify-email-otp" && (
              <div className="space-y-4">
                {success && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded p-2 text-center">
                    {success}
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  {t("auth.hint.codeSentTo")} <span dir="ltr" className="font-medium">{verifyEmail}</span>
                </p>
                {devCode && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2 text-center">
                      {t("auth.dev.codeLabel")}: <span className="font-bold" dir="ltr">{devCode}</span>
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />
                      {t("auth.dev.warningBadge")}
                    </div>
                  </div>
                )}
                <OtpInput value={verifyCode} onChange={setVerifyCode} hasError={!!error} disabled={loading} />
                {error && (
                  <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                    {error}
                  </p>
                )}
                <Button
                  onClick={() => void handleVerifyEmailOtp()}
                  disabled={loading || verifyCode.length !== 6}
                  className="w-full h-12 gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {t("auth.btn.verify")}
                </Button>
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    await fetch("/api/auth/resend-verification", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: verifyEmail }),
                    });
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t("auth.btn.resendCode")}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
