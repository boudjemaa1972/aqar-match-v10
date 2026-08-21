import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { filterMessageContent } from "@/lib/message-filter";

// ──────────────────────────────────────────────────────────────────
//  GET /api/messages/[matchId]
//  Returns the conversation messages for a match.
//  Only the buyer or seller of the match can access this.
//  Blocked messages (blocked=true) are NEVER returned to either party —
//  they exist only for internal audit/monitoring.
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Find the match — verify the user is a participant
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { buyerId: true, sellerId: true },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }
  if (match.buyerId !== user.id && match.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  // Get or create conversation
  let conversation = await db.conversation.findUnique({
    where: { matchId },
    include: {
      messages: {
        where: { blocked: false }, // NEVER return blocked messages
        orderBy: { sentAt: "asc" },
        take: 100,
      },
    },
  });

  if (!conversation) {
    // Auto-create conversation with a system welcome message
    conversation = await db.conversation.create({
      data: {
        matchId,
        participants: { connect: [{ id: match.buyerId }, { id: match.sellerId }] },
        messages: {
          create: {
            senderId: user.id, // system message attributed to the opening user
            content: "🔒 لأسباب أمنية، لا يمكن مشاركة أرقام الهاتف أو معلومات التواصل عبر هذه المحادثة. المنصة ستنظّم موعد المعاينة نيابة عنكما.",
            flagged: false,
          },
        },
      },
      include: {
        messages: {
          where: { blocked: false },
          orderBy: { sentAt: "asc" },
          take: 100,
        },
      },
    });
  }

  // Mark messages from the OTHER party as read
  await db.message.updateMany({
    where: {
      conversationId: conversation.id,
      senderId: { not: user.id },
      readAt: null,
      blocked: false,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    conversationId: conversation.id,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      content: m.content,
      flagged: m.flagged,
      sentAt: m.sentAt,
      isMine: m.senderId === user.id,
    })),
  });
}

// ──────────────────────────────────────────────────────────────────
//  POST /api/messages/[matchId]
//  Sends a message in the match conversation.
//  Content is filtered server-side — phone numbers, WhatsApp links,
//  emails, social media handles are BLOCKED (message rejected entirely).
//  Contact phrases (Arabic) are flagged but allowed.
//
//  If blocked: the message is stored with blocked=true + blockedReason
//  for internal audit, but NEVER shown to the recipient.
// ──────────────────────────────────────────────────────────────────

const sendSchema = z.object({
  content: z.string().min(1).max(1000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Verify user is a participant
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { buyerId: true, sellerId: true, status: true },
  });
  if (!match) {
    return NextResponse.json({ error: "المطابقة غير موجودة" }, { status: 404 });
  }
  if (match.buyerId !== user.id && match.sellerId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "المحتوى مطلوب" }, { status: 422 });
  }

  // ── Filter message content (MANDATORY server-side) ──
  const filterResult = filterMessageContent(parsed.data.content);

  // Get or create conversation
  let conversation = await db.conversation.findUnique({
    where: { matchId },
    select: { id: true },
  });
  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        matchId,
        participants: { connect: [{ id: match.buyerId }, { id: match.sellerId }] },
      },
      select: { id: true },
    });
  }

  // Store the message — even if blocked, we store it with blocked=true
  // for internal audit. Blocked messages are never returned in GET.
  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      content: parsed.data.content,
      flagged: filterResult.flagged,
      blocked: !filterResult.allowed,
      blockedReason: filterResult.blockedReason || null,
    },
  });

  // If blocked, return 422 with the rejection reason
  if (!filterResult.allowed) {
    return NextResponse.json(
      { error: filterResult.reason, blocked: true, reason: filterResult.blockedReason },
      { status: 422 },
    );
  }

  // Message accepted — return it to the sender
  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      senderId: message.senderId,
      content: message.content,
      flagged: message.flagged,
      sentAt: message.sentAt,
      isMine: true,
    },
  });
}
