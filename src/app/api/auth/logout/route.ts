import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { auditLog } from "@/lib/auth/audit-log";
import { getClientIp, getUserAgent } from "@/lib/auth/request";

// ──────────────────────────────────────────────────────────────────
//  POST /api/auth/logout
//
//  Destroys the current session:
//  1. Reads the sessionToken from the cookie.
//  2. Rotates it in the DB (any stolen cookie becomes instantly invalid).
//  3. Deletes the cookie from the browser.
//  4. Audit logs the logout event.
//
//  Note: this handles BOTH email + phone sessions (they share the
//  same sessionToken mechanism). The legacy /api/auth/signout route
//  remains for backward compatibility but redirects here internally.
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = getClientIp(req as NextRequest);
  const ua = getUserAgent(req as NextRequest);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const user = await db.user.findUnique({
      where: { sessionToken: token },
      select: { id: true },
    });
    if (user) {
      // Rotate to invalidate the stolen-token path.
      await db.user.update({
        where: { id: user.id },
        data: { sessionToken: crypto.randomUUID() + "-" + Date.now() },
      });
      await auditLog({
        userId: user.id,
        event: "LOGOUT",
        success: true,
        ip,
        userAgent: ua,
      });
    }
  }

  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
