"use client";

// ──────────────────────────────────────────────────────────────────
//  TopNav — fixed top navigation.
//
//  Desktop (md+): full horizontal tabs (5 sections) + language switch.
//  Mobile (< md): compact bar (logo + language only). Main navigation
//    is handled by BottomTabBar. Hamburger opens a Sheet with
//    SECONDARY items only (language, blog link, legal links) —
//    NOT the 5 main sections (those are in BottomTabBar).
// ──────────────────────────────────────────────────────────────────

import { useState } from "react";import {
  Home, PlusCircle, Search, Map, User, LayoutDashboard,
  Globe, Menu, BookOpen, Shield, HelpCircle, ShieldCheck, LogIn,
} from "lucide-react";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { NotificationBell } from "@/components/aqar/NotificationBell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type NavView = "home" | "publish" | "search" | "mapSearch" | "account" | "dashboard";

interface Props {
  current: NavView;
  onNavigate: (v: NavView) => void;
  isLoggedIn?: boolean;
  onRequireAuth?: () => void;
}

export function TopNav({ current, onNavigate, isLoggedIn = false, onRequireAuth }: Props) {
  const { t, lang, setLang, dir } = useI18n();
  const [open, setOpen] = useState(false);

  const tabs: { key: NavView; label: string; icon: typeof Home }[] = [
    { key: "home", label: t("nav.home"), icon: Home },
    { key: "publish", label: t("nav.publish"), icon: PlusCircle },
    { key: "search", label: t("nav.search"), icon: Search },
    { key: "mapSearch", label: "الخريطة", icon: Map },
    { key: "account", label: t("nav.account"), icon: User },
    { key: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
  ];

  function handleNavigate(v: NavView) {
    onNavigate(v);
    setOpen(false);
  }

  // Secondary items for the hamburger Sheet (mobile only)
  const secondaryItems = [
    { label: t("nav.blog"), icon: BookOpen, href: "/blog" },
    { label: t("nav.privacy"), icon: Shield, href: "/privacy" },
    { label: t("nav.help"), icon: HelpCircle, href: "#" },
  ];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-background/85 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Brand — always visible, compact on mobile */}
        <button
          onClick={() => handleNavigate("home")}
          className="flex items-center gap-2 hover:opacity-80 transition flex-shrink-0"
        >
          <div className="w-8 h-8 rounded-lg overflow-hidden">
            <Image src="/logo.svg" alt="عقار Match" width={32} height={32} className="w-full h-full" />
          </div>
          <span className="hidden sm:block font-bold text-foreground text-sm leading-tight">
            {t("nav.brand")}
          </span>
        </button>

        {/* Desktop tabs — hidden on mobile (BottomTabBar handles nav) */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = current === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleNavigate(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right cluster: auth status + language + hamburger (mobile) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Auth status pill — click to login if guest */}
          <button
            onClick={() => {
              if (isLoggedIn) {
                onNavigate("account");
              } else if (onRequireAuth) {
                onRequireAuth();
              }
            }}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium min-h-[36px] transition ${
              isLoggedIn
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
            }`}
            title={isLoggedIn ? t("auth.user.verified") : t("auth.user.guest")}
          >
            {isLoggedIn ? <ShieldCheck className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">
              {isLoggedIn ? t("auth.user.verified") : t("auth.btn.sendCode")}
            </span>
          </button>

          {/* Notification bell — visible only for verified users */}
          <NotificationBell isLoggedIn={isLoggedIn} onNavigate={onNavigate} />

          {/* Language switch — always visible */}
          <button
            onClick={() => setLang(lang === "ar" ? "fr" : "ar")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:bg-secondary transition text-sm font-medium min-h-[36px]"
            aria-label="Switch language"
          >
            <Globe className="w-4 h-4" />
            <span>{lang === "ar" ? "FR" : "ع"}</span>
          </button>

          {/* Hamburger — mobile only, secondary items only */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-secondary transition"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              className="w-[260px] p-0"
            >
              <SheetHeader className="p-5 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg overflow-hidden">
                    <Image src="/logo.svg" alt="عقار Match" width={32} height={32} className="w-full h-full" />
                  </div>
                  {t("nav.brand")}
                </SheetTitle>
              </SheetHeader>
              <nav className="p-3 flex flex-col gap-1">
                {/* Secondary items only — main nav is in BottomTabBar */}
                {secondaryItems.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={i}
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition min-h-[48px]"
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </a>
                  );
                })}

                {/* Language toggle inside Sheet too */}
                <div className="mt-2 pt-2 border-t">
                  <button
                    onClick={() => setLang(lang === "ar" ? "fr" : "ar")}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition w-full min-h-[48px]"
                  >
                    <Globe className="w-5 h-5" />
                    <span>{lang === "ar" ? "Français" : "العربية"}</span>
                  </button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
