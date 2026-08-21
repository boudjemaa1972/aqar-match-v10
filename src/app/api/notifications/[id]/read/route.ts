import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, sessionErrorResponse, SessionError } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  PATCH /api/notifications/[id]/read
//
//  Marks a single notification as read.
//  Auth: requires a session AND the notification must belong to the
//  current user (ownership check on userId — prevents marking
//  someone else's notification).
//
//  Idempotent: marking an already-read notification returns 200
//  without erroring (just no-ops).
//
//  Response:
//    { ok: true, notification: { id, read, readAt } }
// ──────────────────────────────────────────────────────────────────

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "معرّف الإشعار مطلوب" },
      { status: 400 },
    );
  }

  // ── Ownership check: only the recipient can mark their notification ──
  const existing = await db.matchNotification.findUnique({
    where: { id },
    select: { userId: true, read: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "الإشعار غير موجود" },
      { status: 404 },
    );
  }

  if (existing.userId !== user.id) {
    // Don't leak existence — return 404 to prevent enumeration
    return NextResponse.json(
      { error: "الإشعار غير موجود" },
      { status: 404 },
    );
  }

  // Already read → idempotent no-op
  if (existing.read) {
    return NextResponse.json({
      ok: true,
      notification: { id, read: true, readAt: null },
    });
  }

  const updated = await db.matchNotification.update({
    where: { id },
    data: {
      read: true,
      readAt: new Date(),
    },
    select: { id: true, read: true, readAt: true },
  });

  return NextResponse.json({ ok: true, notification: updated });
}
