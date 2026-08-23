"use client";

// ──────────────────────────────────────────────────────────────────
//  useNotifications — polling hook for in-app notifications.
//
//  Polls GET /api/notifications every 45 seconds when the user is
//  verified. Returns the unread count + the full list, and a
//  markAsRead() helper that also updates local state optimistically.
//
//  SCOPE DECISION (Phase 1):
//    • IN_APP notifications only — no SMS / email in this phase.
//    • Polling interval: 45s (sufficient for a real-estate context
//      where buyers don't need sub-minute latency; minimizes load).
//    • WebSocket/SSE deferred to a later phase — polling is the
//      simplest reliable mechanism for the current scale.
//
//  Visibly refreshes on:
//    • Tab focus (visibilitychange) — fetch immediately on return
//    • Manual refresh() call
//    • Interval tick (45s)
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";

export interface NotificationListing {
  id: string;
  intent: string;
  type: string;
  city: string;
  commune: string | null;
  askingPrice: number | null;
  pricePerNight: number | null;
  areaSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  coverPhoto: string | null;
}

export interface NotificationItem {
  id: string;
  matchId: string | null;
  sentAt: string;
  read: boolean;
  listing: NotificationListing;
  request: {
    intent: string;
    type: string;
    city: string;
    commune: string | null;
    createdAt: string;
  };
}

interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 45_000; // 45 seconds

export function useNotifications(isLoggedIn: boolean): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in — silently return, no error toast
          setNotifications([]);
          setUnreadCount(0);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setNotifications(json.notifications || []);
      setUnreadCount(json.unreadCount || 0);
    } catch (e) {
      // Silent failure — don't disrupt the UI with error banners
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update — flip the local state immediately
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      // No need to re-fetch — local state is already correct.
      // If the server rejects (404), the optimistic update stays —
      // worst case the notification shows as read on next refresh.
    } catch {
      // Silent failure — the next refresh will correct the state.
    }
  }, []);

  // ── Mount + isLoggedIn change: fetch once + start interval ──
  useEffect(() => {
    if (!isLoggedIn) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    refresh();

    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);

    // Refresh on tab focus (user returns to the tab — fetch latest)
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isLoggedIn, refresh]);

  return { notifications, unreadCount, loading, error, refresh, markAsRead };
}
