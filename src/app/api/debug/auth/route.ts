import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

// GET /api/debug/auth — shows full session state for debugging
export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  
  const result: Record<string, unknown> = {
    hasCookie: !!token,
    cookieName: SESSION_COOKIE,
    cookieValue: token ? token.substring(0, 20) + "..." : null,
    cookies: Array.from(store.getAll()).map(c => ({ name: c.name, value: c.value.substring(0, 20) + "..." })),
  };

  if (token) {
    const user = await db.user.findUnique({
      where: { sessionToken: token },
      select: {
        id: true,
        email: true,
        role: true,
        isGuest: true,
        verified: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        sessionToken: true,
        lockedUntil: true,
      },
    });
    result.user = user ? {
      id: user.id,
      email: user.email,
      role: user.role,
      isGuest: user.isGuest,
      verified: user.verified,
      emailVerified: !!user.emailVerifiedAt,
      phoneVerified: !!user.phoneVerifiedAt,
      sessionTokenMatch: user.sessionToken === token,
      locked: user.lockedUntil ? user.lockedUntil > new Date() : false,
    } : "NOT_FOUND";
  } else {
    result.user = "NO_COOKIE";
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
