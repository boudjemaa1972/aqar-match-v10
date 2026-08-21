"use client";

// ──────────────────────────────────────────────────────────────────
//  NotificationBell — bell icon + dropdown sheet for notifications.
//
//  Uses useNotifications() hook which polls /api/notifications every
//  45s. On click, opens a dropdown (desktop) or Bottom Sheet (mobile)
//  showing recent notifications with the listing's blind card info.
//
//  Each notification links to the corresponding match via onNavigate
//  to the "dashboard" view (where the buyer sees their matches).
//
//  SCOPE: IN_APP only — no SMS/email in this phase (see roadmap).
// ──────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useNotifications } from "@/components/aqar/useNotifications";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatDZD } from "@/components/aqar/store";
import { TYPE_LABELS, INTENT_LABELS } from "@/lib/schemas";
import type { NavView } from "@/components/aqar/TopNav";

interface Props {
  isVerified: boolean;
  onNavigate: (v: NavView) => void;
}

export function NotificationBell({ isVerified, onNavigate }: Props) {
  const { t, dir } = useI18n();
  const { notifications, unreadCount, markAsRead } = useNotifications(isVerified);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click (desktop only)
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!isVerified) return null;

  function handleNotificationClick(notifId: string, matchId: string | null) {
    markAsRead(notifId);
    setOpen(false);
    // Navigate to dashboard where the buyer can see their matches
    // (the specific match will appear there once seller fee is paid)
    if (matchId) {
      onNavigate("dashboard");
    }
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t("notif.justNow");
    if (min < 60) return t("notif.minutesAgo", { n: min });
    const hours = Math.floor(min / 60);
    if (hours < 24) return t("notif.hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    return t("notif.daysAgo", { n: days });
  }

  const NotificationList = (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto scroll-slim">
      {notifications.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>{t("notif.empty")}</p>
        </div>
      ) : (
        notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleNotificationClick(n.id, n.matchId)}
            className={`w-full text-start p-3 rounded-lg border transition flex items-start gap-3 min-h-[64px] ${
              n.read
                ? "border-border bg-background hover:bg-secondary/50"
                : "border-primary/30 bg-primary/5 hover:bg-primary/10"
            }`}
          >
            {/* Cover photo thumbnail */}
            <div className="w-12 h-12 rounded-lg bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center">
              {n.listing.coverPhoto ? (
                <img
                  src={n.listing.coverPhoto}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Bell className="w-5 h-5 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-2">
                {t("notif.matchFound")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {INTENT_LABELS[n.listing.intent] || n.listing.intent} ·{" "}
                {TYPE_LABELS[n.listing.type] || n.listing.type} ·{" "}
                {n.listing.city}
                {n.listing.commune ? ` / ${n.listing.commune}` : ""}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {n.listing.intent === "SEASONAL_RENT" && n.listing.pricePerNight
                    ? `${Number(n.listing.pricePerNight).toLocaleString()} ${t("common.currency")} / ${t("seasonal.nights")}`
                    : formatDZD(n.listing.askingPrice)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · {timeAgo(n.sentAt)}
                </span>
              </div>
            </div>

            {!n.read && (
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
            )}
          </button>
        ))
      )}
    </div>
  );

  return (
    <>
      {/* Desktop (md+): dropdown */}
      <div className="hidden md:block relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-secondary transition"
          aria-label={t("notif.title")}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className={`absolute top-full mt-2 ${dir === "rtl" ? "left-0" : "right-0"} w-[360px] max-w-[calc(100vw-2rem)] bg-background border rounded-xl shadow-lg overflow-hidden z-50`}
            >
              <div className="flex items-center justify-between p-3 border-b">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">{t("notif.title")}</h3>
                  {unreadCount > 0 && (
                    <Badge variant="default" className="text-[10px] h-5">
                      {unreadCount}
                    </Badge>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:bg-secondary transition"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {NotificationList}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile (< md): bottom sheet via Sheet component */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="md:hidden relative flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-secondary transition"
            aria-label={t("notif.title")}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </SheetTrigger>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          className="w-full sm:w-[400px] p-0"
        >
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              {t("notif.title")}
              {unreadCount > 0 && (
                <Badge variant="default" className="text-[10px] h-5">
                  {unreadCount}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="p-2">{NotificationList}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
