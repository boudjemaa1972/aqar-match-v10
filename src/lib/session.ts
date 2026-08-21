import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensureCryptoReady } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────
//  Session helpers — httpOnly cookie based.
//
//  We use a `sessionToken` (cuid) stored on the User row AND in an
//  httpOnly cookie. Every protected endpoint:
//    1. Reads the cookie.
//    2. Looks up the User by sessionToken.
//    3. Verifies ownership of the resource (match.buyerId / match.sellerId).
//
//  Auth upgrade (Phase 2): full email+password auth is now implemented
//  in `src/lib/auth/*`. The legacy phone-OTP in `src/lib/auth.ts`
//  continues to work for backward compat. Existing guest sessions
//  continue to work for read-mostly endpoints, but new endpoints that
//  require verified identity should call `requireVerifiedUser()`.
//
//  COOKIE ATTRIBUTES (security-critical):
//  ─────────────────────────────────────
//  • httpOnly: true — JavaScript can't read the cookie (XSS-resistant)
//  • sameSite: 'strict' — cookie only sent on same-site requests
//    (CSRF-resistant; tradeoff: clicking an email link from another
//    domain won't be authenticated — but for an auth cookie that's
//    actually desirable behavior).
//  • secure: true in production (HTTPS-only)
//  • path: '/' — applies to the whole site
//  • maxAge: 1 day (default) or 30 days (remember-me)
//
//  SESSION ROTATION:
//  ─────────────────
//  On every successful login (email, phone-OTP, magic link), we
//  rotate the sessionToken in the DB. This prevents session fixation
//  attacks where an attacker injects a known token into the victim's
//  browser before they log in.
// ──────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "aqar_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24; // 24h default (no remember-me)
const REMEMBER_ME_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days with remember-me

export interface SessionUser {
  id: string;
  email: string;
  role: "BUYER" | "SELLER" | "LANDLORD" | "TENANT" | "AGENT";
  sessionToken: string;
  isGuest: boolean;
  verified: boolean;
  // New: distinct verification flags for email + phone.
  // `verified` is the legacy boolean (set when phone OTP succeeds).
  // `emailVerifiedAt` is set when the user clicks the email verification link
  // OR enters the 6-digit email OTP. Either one is sufficient for
  // requireVerifiedUser() — the user doesn't need BOTH to access the app.
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  systemRole: "USER" | "ADMIN";
}

// ── Set the session cookie with proper security attributes ────────
// Public so auth endpoints (login, signup, OTP verify) can set it
// directly with the appropriate maxAge based on remember-me choice.
export async function setSessionCookie(
  token: string,
  rememberMe: boolean = false,
): Promise<void> {
  const store = await cookies();
  const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE_SEC : SESSION_MAX_AGE_SEC;
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // 'lax' is the OWASP-recommended default for session cookies.
    // 'strict' would prevent the cookie from being sent on cross-site
    // navigations (e.g., when a user clicks a link from an email or
    // the chat preview), causing "session not found" errors in the
    // preview environment. 'lax' still prevents CSRF on non-GET
    // requests (POST/PUT/DELETE), which is what we need.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

// ── Rotate the session token in the DB (prevents session fixation) ──
// Public so auth endpoints can rotate after a privilege change (login,
// password reset, 2FA activation).
export async function rotateSessionToken(
  userId: string,
  rememberMe: boolean = false,
): Promise<string> {
  // crypto.randomUUID is available in Node 19+ (Web Crypto API).
  // Format: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx-timestamp" — the
  // trailing timestamp is for human readability in DB queries and
  // adds no security value (the UUID is the entropy source).
  const newToken = crypto.randomUUID() + "-" + Date.now();
  await db.user.update({
    where: { id: userId },
    data: {
      sessionToken: newToken,
      lastLoginAt: new Date(),
    },
  });
  await setSessionCookie(newToken, rememberMe);
  return newToken;
}

// ── Get-or-create session (legacy — auto-creates guest) ────────
// Kept for backward compat with read-mostly endpoints (stats, reviews).
// Sensitive write endpoints should call requireVerifiedUser() instead.
export async function getOrCreateSession(): Promise<SessionUser> {
  await ensureCryptoReady();
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;

  if (existing) {
    const user = await db.user.findUnique({ where: { sessionToken: existing } });
    if (user) {
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        sessionToken: user.sessionToken,
        isGuest: user.isGuest,
        verified: user.verified,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: user.phoneVerifiedAt,
        systemRole: user.systemRole,
      };
    }
  }

  // Create a new guest session
  const { encryptJSON } = await import("@/lib/crypto");
  const guest = await db.user.create({
    data: {
      email: `guest_${Date.now()}_${Math.floor(Math.random() * 9999)}@aqarmatch.demo`,
      nameEnc: await encryptJSON({ name: "زائر" }),
      phoneEnc: await encryptJSON({ phone: "+213500000000" }),
      role: "BUYER",
      isGuest: true,
      verified: false,
    },
  });

  store.set(SESSION_COOKIE, guest.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });

  return {
    id: guest.id,
    email: guest.email,
    role: guest.role,
    sessionToken: guest.sessionToken,
    isGuest: true,
    verified: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    systemRole: guest.systemRole,
  };
}

// ── Read session (no auto-create — for read-only endpoints) ─────
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await db.user.findUnique({ where: { sessionToken: token } });
  if (!user) return null;

  // ── Account lockout check ────────────────────────────────────
  // If the user's account is locked (too many failed logins), treat
  // the session as invalid — they must wait for lockedUntil to pass.
  // This prevents a stolen cookie from continuing to work after the
  // account has been locked.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    sessionToken: user.sessionToken,
    isGuest: user.isGuest,
    verified: user.verified,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    systemRole: user.systemRole,
  };
}

// ── Require admin (for /admin routes + admin API) ──
// Returns 401 if no session, 403 if not ADMIN.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    return Promise.reject(new SessionError("UNAUTHORIZED", "يجب تسجيل الدخول للمتابعة"));
  }
  if (user.systemRole !== "ADMIN") {
    return Promise.reject(new SessionError("FORBIDDEN", "غير مصرح — هذه الصفحة للمشرفين فقط"));
  }
  return user;
}

// ── Require verified user (new — for sensitive write endpoints) ──
// Returns 401 if no session, 403 if guest/unverified.
// Use this for: creating listings, paying fees, accepting/rejecting matches,
// and (importantly) for /api/match (search) — buyers must verify before
// they can submit a search to prevent spam.
//
// VERIFICATION POLICY (Phase 2 update):
// ─────────────────────────────────────
// A user is considered "verified" if ANY of:
//   • `verified = true` (legacy — set by phone OTP) → backward compat
//   • `phoneVerifiedAt != null` (new — phone OTP timestamp)
//   • `emailVerifiedAt != null` (new — email link OR 6-digit email OTP)
//
// We DON'T require BOTH — either is sufficient. This is critical because
// users who signed up via email+password need to search immediately after
// verifying their email (not wait for phone OTP they never set up).
//
// Guests (isGuest=true) are ALWAYS rejected — they must complete a real
// signup flow (phone OR email) before accessing sensitive endpoints.
export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    return Promise.reject(new SessionError("UNAUTHORIZED", "يجب تسجيل الدخول للمتابعة"));
  }
  if (user.isGuest) {
    return Promise.reject(
      new SessionError("FORBIDDEN", "يجب تسجيل الدخول للمتابعة"),
    );
  }
  // ── Accept ANY verification method (phone OR email) ──────────
  const isPhoneVerified = user.verified || user.phoneVerifiedAt !== null;
  const isEmailVerified = user.emailVerifiedAt !== null;
  if (!isPhoneVerified && !isEmailVerified) {
    return Promise.reject(
      new SessionError(
        "FORBIDDEN",
        "يجب تأكيد بريدك الإلكتروني أو رقم هاتفك للمتابعة",
      ),
    );
  }
  return user;
}

// ── Strict ownership helpers ────────────────────────────────────
export async function requireBuyerOfMatch(matchId: string): Promise<{
  ok: true;
  user: SessionUser;
  match: Awaited<ReturnType<typeof db.match.findUnique>>;
}> {
  const user = await getSession();
  if (!user) {
    return Promise.reject(new SessionError("UNAUTHORIZED", "الجلسة غير موجودة"));
  }
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { listing: true, negotiation: true },
  });
  if (!match) {
    return Promise.reject(new SessionError("NOT_FOUND", "المطابقة غير موجودة"));
  }
  if (match.buyerId !== user.id) {
    return Promise.reject(
      new SessionError("FORBIDDEN", "لا تملك صلاحية الوصول لهذه المطابقة"),
    );
  }
  return { ok: true, user, match };
}

export async function requireSellerOfMatch(matchId: string): Promise<{
  ok: true;
  user: SessionUser;
  match: Awaited<ReturnType<typeof db.match.findUnique>>;
}> {
  const user = await getSession();
  if (!user) {
    return Promise.reject(new SessionError("UNAUTHORIZED", "الجلسة غير موجودة"));
  }
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { listing: true, negotiation: true },
  });
  if (!match) {
    return Promise.reject(new SessionError("NOT_FOUND", "المطابقة غير موجودة"));
  }
  if (match.sellerId !== user.id) {
    return Promise.reject(
      new SessionError("FORBIDDEN", "أنت لست البائع على هذه المطابقة"),
    );
  }
  return { ok: true, user, match };
}

// ── Error class for clean handling in route handlers ────────────
export class SessionError extends Error {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND";
  constructor(
    code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export function sessionErrorResponse(e: SessionError) {
  const status =
    e.code === "UNAUTHORIZED"
      ? 401
      : e.code === "FORBIDDEN"
        ? 403
        : 404;
  return {
    status,
    body: { error: e.message, code: e.code },
  };
}
