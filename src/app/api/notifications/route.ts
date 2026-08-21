import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, sessionErrorResponse, SessionError } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  GET /api/notifications
//
//  Returns the current user's notifications (newest first).
//  Auth: requires a session (guests get 401 — they have no requests).
//
//  Query params:
//   • ?unread=true  → return only unread notifications
//   • ?limit=20     → cap (max 100, default 20)
//
//  Response shape:
//    {
//      notifications: [
//        {
//          id, matchId, sentAt, read,
//          listing: { intent, type, city, commune, askingPrice,
//                     pricePerNight, areaSqm, bedrooms, coverPhoto? }
//          request: { intent, type, city, commune }
//        }
//      ],
//      unreadCount: number
//    }
//
//  SECURITY:
//  • Only notifications belonging to the current user are returned
//    (filtered by userId from session, not from URL).
//  • No seller contact info, location, or photos are returned —
//    only the BLIND CARD fields (public price, area, type, etc.)
//    so the buyer can decide whether to engage with the match.
//  • coverPhoto is the FIRST photo of the listing (same convention
//    as /api/match) — it's public from the first moment.
// ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  let user;
  try {
    user = await getSession();
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }
  if (!user) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول للمتابعة" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const onlyUnread = url.searchParams.get("unread") === "true";
  const limitRaw = Number(url.searchParams.get("limit") || "20");
  const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));

  const where = {
    userId: user.id,
    ...(onlyUnread ? { read: false } : {}),
  };

  const notifications = await db.matchNotification.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: limit,
    include: {
      listing: {
        select: {
          id: true,
          intent: true,
          type: true,
          city: true,
          commune: true,
          askingPrice: true,
          pricePerNight: true,
          areaSqm: true,
          bedrooms: true,
          bathrooms: true,
          photosEnc: true, // we decrypt only the FIRST photo below
        },
      },
      request: {
        select: {
          intent: true,
          type: true,
          city: true,
          commune: true,
          createdAt: true,
        },
      },
    },
  });

  const unreadCount = await db.matchNotification.count({
    where: { userId: user.id, read: false },
  });

  // Decrypt cover photos in parallel (first photo of each listing only).
  // We do this here (server-side) so the client doesn't have to do
  // another round-trip per notification.
  const { decryptJSON } = await import("@/lib/crypto");

  const enrichedNotifications = await Promise.all(
    notifications.map(async (n) => {
      let coverPhoto: string | null = null;
      try {
        const photos = await decryptJSON<string[]>(n.listing.photosEnc);
        if (photos && photos.length > 0) {
          coverPhoto = photos[0];
        }
      } catch {
        // Skip — leave coverPhoto as null
      }
      // Don't leak photosEnc back to client
      const { photosEnc: _omit, ...listingSafe } = n.listing;
      return {
        id: n.id,
        matchId: n.matchId,
        sentAt: n.sentAt,
        read: n.read,
        listing: { ...listingSafe, coverPhoto },
        request: n.request,
      };
    }),
  );

  return NextResponse.json({
    notifications: enrichedNotifications,
    unreadCount,
  });
}
