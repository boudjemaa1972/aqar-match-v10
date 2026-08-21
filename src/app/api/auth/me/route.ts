import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { decryptJSON } from "@/lib/crypto";

// GET /api/auth/me
// Returns the current session's user info (no secrets to OTHER users,
// but the owner CAN see their own phone + name).
// Used by the SPA to know whether the user is a verified user or a guest,
// and to auto-fill contact fields after verification.

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  // Fetch name + phone (encrypted at rest) — decrypt for the OWNER only.
  // This is the same privilege rule as seller seeing their own secretMinPrice.
  let name: string | null = null;
  let phone: string | null = null;
  let emailVerified: boolean = false;
  let phoneVerified: boolean = false;
  let hasPassword: boolean = false;
  try {
    const u = await (await import("@/lib/db")).db.user.findUnique({
      where: { id: user.id },
      select: {
        nameEnc: true,
        phoneEnc: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        passwordHash: true,
        email: true,
      },
    });
    if (u?.nameEnc) {
      const decoded = await decryptJSON<{ name?: string }>(u.nameEnc);
      name = decoded?.name || null;
    }
    if (u?.phoneEnc) {
      const decoded = await decryptJSON<{ phone?: string; verified?: boolean }>(u.phoneEnc);
      phone = decoded?.phone || null;
    }
    emailVerified = !!u?.emailVerifiedAt;
    phoneVerified = !!u?.phoneVerifiedAt;
    hasPassword = !!u?.passwordHash;
  } catch {
    // ignore — name/phone are purely cosmetic for display
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email, // NEW: exposed so the UI can show "signed in as X"
      role: user.role,
      isGuest: user.isGuest,
      verified: user.verified,
      emailVerified, // NEW: distinct from `verified` (which is the legacy boolean)
      phoneVerified, // NEW
      hasPassword, // NEW: lets UI know if email-login is available
      systemRole: user.systemRole,
      name,
      phone, // decrypted — owner sees own phone
    },
  });
}

