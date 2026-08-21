"use client";

// ──────────────────────────────────────────────────────────────────
//  BottomTabBar — fixed bottom navigation for mobile (< md).
//  5 tabs: Home • Publish • Search • Dashboard • Account
//  Hidden on md+ where TopNav's horizontal tabs take over.
//
//  Each tab is a 44×44px touch target minimum. Active tab gets
//  primary color + filled icon; inactive tabs are muted.
// ──────────────────────────────────────────────────────────────────

import { Home, PlusCircle, Search, Map, LayoutDashboard, User } from "lucide-react";
import type { NavView } from "./TopNav";

interface Props {
  current: NavView;
  onNavigate: (v: NavView) => void;
}

const TABS: { key: NavView; label: string; icon: typeof Home }[] = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "publish", label: "نشر", icon: PlusCircle },
  { key: "search", label: "بحث", icon: Search },
  { key: "mapSearch", label: "الخريطة", icon: Map },
  { key: "dashboard", label: "لوحتي", icon: LayoutDashboard },
  { key: "account", label: "حسابي", icon: User },
];

export function BottomTabBar({ current, onNavigate }: Props) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch justify-around h-14">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = current === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
            >
              <Icon className={`w-5 h-5 ${active ? "fill-primary/10" : ""}`} />
              <span className={`text-[10px] font-medium leading-none truncate ${active ? "font-bold" : ""}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
