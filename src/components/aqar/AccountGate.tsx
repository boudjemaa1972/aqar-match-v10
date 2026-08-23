"use client";

// ──────────────────────────────────────────────────────────────────
//  AccountGate — placeholder for the future account/registration page.
//
//  Currently every visitor is a "guest" with a sessionToken cookie.
//  This component explains why an account is needed and signals that
//  the registration system is coming soon.
//
//  IMPORTANT: This does NOT break the existing guest session flow.
//  The sessionToken in the httpOnly cookie continues to work and
//  remains the technical basis for any future auth system.
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { User, Lock, Bell, ShieldCheck, Sparkles, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { AuthModal, type AuthMode } from "./auth/AuthModal";

interface UserInfo {
  id: string;
  email: string;
  name?: string;
  verified: boolean;
}

export function AccountGate() {
  const { t } = useI18n();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setUser(d.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  const benefits = [
    {
      icon: ShieldCheck,
      title: t("account.benefit1.title"),
      desc: t("account.benefit1.desc"),
    },
    {
      icon: Bell,
      title: t("account.benefit2.title"),
      desc: t("account.benefit2.desc"),
    },
    {
      icon: Lock,
      title: t("account.benefit3.title"),
      desc: t("account.benefit3.desc"),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Logged-in user → show account info ──
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      window.location.reload();
    } catch {
      setLoggingOut(false);
    }
  }

  if (user) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            {user.name || t("account.title")}
          </h1>
          <p className="text-muted-foreground text-sm" dir="ltr">
            {user.email}
          </p>
          <div className="mt-2">
            {user.verified ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" /> {t("account.verified")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3" /> {t("account.unverified")}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 mb-10">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm">{b.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{b.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Logout button ── */}
        <div className="text-center">
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={loggingOut}
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            {loggingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  // ── Guest / not logged in → show registration prompt ──
  return (
    <>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
            <User className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            {t("account.title")}
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
            {t("account.subtitle")}
          </p>
        </div>

        <div className="space-y-3 mb-10">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm">{b.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{b.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Registration CTA ── */}
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 text-center">
          <Sparkles className="w-8 h-8 mx-auto text-primary mb-3" />
          <h3 className="font-bold text-foreground mb-2">{t("account.register.title")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t("account.register.desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => openAuth("signup")} className="gap-2">
              <User className="w-4 h-4" />
              {t("auth.btn.signup")}
            </Button>
            <Button variant="outline" onClick={() => openAuth("login")} className="gap-2">
              {t("auth.btn.login")}
            </Button>
          </div>
        </div>
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => { setAuthOpen(false); setLoading(true); /* re-fetch user */ }}
        initialMode={authMode}
      />
    </>
  );
}
