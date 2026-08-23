"use client";

// ──────────────────────────────────────────────────────────────────
//  Aqar Match — single-page app with 5 view modes:
//   home | publish | search | account | dashboard
//
//  Performance: PublishFlow, SearchFlow, UserDashboard are lazy-loaded
//  so they don't bloat the initial bundle when the user lands on home.
//  Only TopNav + HomePage + PageMeta are in the critical path.
//
//  Auth: PublishFlow requires a verified phone. If the user is a guest,
//  the AuthModal is shown first; on success, navigation proceeds.
//
//  Dashboard: UserDashboard is a SMART ROUTER that decides what to
//  show based on user activity:
//    • Buyer activity (requests/matches) → BuyerDashboard
//    • Listings owned                   → SellerDashboard
//    • Both                             → tabbed Buyer/Seller
//    • Neither                          → empty state with CTAs
// ──────────────────────────────────────────────────────────────────

import { useState, lazy, Suspense, useEffect, useCallback } from "react";
import { TopNav, type NavView } from "@/components/aqar/TopNav";
import { BottomTabBar } from "@/components/aqar/BottomTabBar";
import { HomePage } from "@/components/aqar/HomePage";
import { AccountGate } from "@/components/aqar/AccountGate";
import { PageMeta } from "@/components/aqar/PageMeta";
import { AuthModal } from "@/components/aqar/auth/AuthModal";

// Lazy-load heavy views — only fetched when user navigates to them
const PublishFlow = lazy(() =>
  import("@/components/aqar/PublishFlow").then((m) => ({ default: m.PublishFlow })),
);
const SearchFlow = lazy(() =>
  import("@/components/aqar/SearchFlow").then((m) => ({ default: m.SearchFlow })),
);
const UserDashboard = lazy(() =>
  import("@/components/aqar/UserDashboard").then((m) => ({ default: m.UserDashboard })),
);
const MapSearchView = lazy(() =>
  import("@/components/aqar/MapSearchView").then((m) => ({ default: m.MapSearchView })),
);

// Lightweight loading fallback
function ViewLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export default function Home() {
  // Read initial view from URL query param (?view=mapSearch, ?view=publish, etc.)
  const [view, setView] = useState<NavView>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("view");
      if (q && ["home", "publish", "search", "mapSearch", "account", "dashboard"].includes(q)) {
        return q as NavView;
      }
    }
    return "home";
  });
  const [authPending, setAuthPending] = useState<NavView | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check session status on mount and when auth changes
  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        // User is "authenticated" if they exist and are not a guest
        setIsLoggedIn(!!json?.user && !json?.user?.isGuest);
      } else {
        setIsLoggedIn(false);
      }
    } catch {
      setIsLoggedIn(false);
    }
  }, []);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  function navigate(v: NavView) {
    // Only "dashboard" requires login at the navigation level.
    // "publish" and "search" use INLINE PhoneAuthGate at their respective
    // contact-info steps (step 4 for publish, step 5 for search), so users
    // can browse criteria freely and only verify when ready to commit.
    if (v === "dashboard" && !isLoggedIn) {
      setAuthPending(v);
      return;
    }
    setView(v);
    // Sync URL for deep-linking (?view=mapSearch etc.)
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState({}, "", url.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAuthSuccess() {
    refreshSession();
    if (authPending) {
      const target = authPending;
      setAuthPending(null);
      setView(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <PageMeta view={view} />
      <TopNav current={view} onNavigate={navigate} isLoggedIn={isLoggedIn} onRequireAuth={() => setAuthPending(view)} />

      <div className="flex-1 pb-14 md:pb-0">
        {view === "home" && (
          <HomePage
            onStartSeller={() => navigate("publish")}
            onStartBuyer={() => navigate("search")}
            onNavigate={navigate}
          />
        )}

        {view === "publish" && (
          <Suspense fallback={<ViewLoader />}>
            <PublishFlow onBackHome={() => navigate("home")} />
          </Suspense>
        )}

        {view === "search" && (
          <Suspense fallback={<ViewLoader />}>
            <SearchFlow
              onBackHome={() => navigate("home")}
              onGoToDashboard={() => navigate("dashboard")}
            />
          </Suspense>
        )}

        {view === "mapSearch" && (
          <Suspense fallback={<ViewLoader />}>
            <MapSearchView
              onSelectListing={(listing) => {
                navigate("search");
              }}
              onMatchRequest={(listing) => {
                // Navigate to search with listing data as URL params
                const url = new URL(window.location.href);
                url.searchParams.set("view", "search");
                url.searchParams.set("matchIntent", listing.intent);
                url.searchParams.set("matchType", listing.type);
                url.searchParams.set("matchCity", listing.city);
                if (listing.commune) url.searchParams.set("matchCommune", listing.commune);
                if (listing.district) url.searchParams.set("matchDistrict", listing.district);
                window.history.replaceState({}, "", url.toString());
                setView("search");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </Suspense>
        )}

        {view === "account" && <AccountGate onAuthChanged={refreshSession} />}

        {view === "dashboard" && (
          <Suspense fallback={<ViewLoader />}>
            <UserDashboard
              onSwitchToBuyer={() => navigate("search")}
              onSwitchToSeller={() => navigate("publish")}
              onStartSearch={() => navigate("search")}
              onStartPublish={() => navigate("publish")}
            />
          </Suspense>
        )}
      </div>

      {/* Bottom tab bar — mobile only */}
      <BottomTabBar current={view} onNavigate={navigate} />

      {/* Auth modal — opens when sensitive view is requested without verified session */}
      <AuthModal
        open={authPending !== null}
        onClose={() => setAuthPending(null)}
        onAuthenticated={handleAuthSuccess}
      />
    </main>
  );
}
