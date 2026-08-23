"use client";

// ──────────────────────────────────────────────────────────────────
//  Aqar Match — single-page app with 5 view modes:
//   home | publish | search | account | dashboard
//
//  Performance: PublishFlow, SearchFlow, UserDashboard, AccountGate
//  are lazy-loaded so they don't bloat the initial bundle.
// ──────────────────────────────────────────────────────────────────

import { useState, lazy, Suspense, useEffect, useCallback, Component, type ReactNode } from "react";
import { TopNav, type NavView } from "@/components/aqar/TopNav";
import { BottomTabBar } from "@/components/aqar/BottomTabBar";
import { HomePage } from "@/components/aqar/HomePage";
import { PageMeta } from "@/components/aqar/PageMeta";

// ── Error Boundary ────────────────────────────────────────────────
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <span className="text-destructive text-xl">⚠</span>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">حدث خطأ</h2>
            <p className="text-sm text-muted-foreground mb-4">حدث خطأ غير متوقع. حاول مرة أخرى.</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              إعادة التحميل
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ── Lazy-loaded heavy views ───────────────────────────────────────
const AccountGate = lazy(() =>
  import("@/components/aqar/AccountGate").then((m) => ({ default: m.AccountGate })),
);
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
const AuthModal = lazy(() =>
  import("@/components/aqar/auth/AuthModal").then((m) => ({ default: m.AuthModal })),
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

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
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
    if (v === "dashboard" && !isLoggedIn) {
      setAuthPending(v);
      return;
    }
    setView(v);
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
        <ErrorBoundary>
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
                onSelectListing={() => { navigate("search"); }}
                onMatchRequest={(listing) => {
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

          {view === "account" && (
            <Suspense fallback={<ViewLoader />}>
              <AccountGate onAuthChanged={refreshSession} />
            </Suspense>
          )}

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
        </ErrorBoundary>
      </div>

      {/* Bottom tab bar — mobile only */}
      <BottomTabBar current={view} onNavigate={navigate} />

      {/* Auth modal — opens when sensitive view is requested without verified session */}
      <ErrorBoundary>
        {authPending !== null && (
          <Suspense fallback={null}>
            <AuthModal
              open={authPending !== null}
              onClose={() => setAuthPending(null)}
              onAuthenticated={handleAuthSuccess}
            />
          </Suspense>
        )}
      </ErrorBoundary>
    </main>
  );
}
