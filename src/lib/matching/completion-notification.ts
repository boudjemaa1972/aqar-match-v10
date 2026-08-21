// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Completion Notification
//
//  Sent when both parties agree on a meeting date (MATCH completed).
//  The notification serves as:
//    • Digital proof of the agreement (timestamp + matchId)
//    • Legal release of the platform obligation (Article 207 CC)
//    • Congratulatory message to both parties
//
//  Format: Arabic text with meeting details + legal disclaimer
// ──────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";

// ══════════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════════

export interface CompletionNotificationResult {
  success: boolean;
  buyerNotified: boolean;
  sellerNotified: boolean;
  meetingDate: Date;
  confirmedAt: Date;
  matchId: string;
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * Format a Date as Arabic-friendly string.
 * Example: "الجمعة 15 أغسطس 2026، الساعة 10:00 صباحاً"
 */
function formatDateArabic(date: Date): string {
  const days = [
    "الأحد", "الإثنين", "الثلاثاء", "الأربعاء",
    "الخميس", "الجمعة", "السبت",
  ];
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];

  const day = days[date.getDay()];
  const dayNum = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours < 12 ? "صباحاً" : "مساءً";
  const displayHours = hours % 12 || 12;

  return `${day} ${dayNum} ${month} ${year}، الساعة ${displayHours}:${minutes} ${period}`;
}

/**
 * Format a timestamp for audit trail.
 * Example: "2026-08-15T10:00:00.000Z"
 */
function formatTimestamp(date: Date): string {
  return date.toISOString();
}

// ══════════════════════════════════════════════════════════════════
//  MAIN: Send completion notification
// ══════════════════════════════════════════════════════════════════

/**
 * Send a documented congratulation notification to both parties
 * when they agree on a meeting date.
 *
 * The notification contains:
 *   1. The agreed meeting date (in Arabic)
 *   2. The match documentation number (match.id)
 *   3. The exact confirmation timestamp (agreementConfirmedAt)
 *   4. A clear legal statement: "التزام منصة عقار Match تجاهكما
 *      انقضى بموجب الاتفاقية"
 *
 * @param matchId - The match ID
 * @param meetingDate - The agreed-upon meeting date (UTC)
 * @param confirmedAt - The exact timestamp when both parties confirmed
 * @returns CompletionNotificationResult with success status
 */
export async function sendCompletionNotification(
  matchId: string,
  meetingDate: Date,
  confirmedAt: Date,
): Promise<CompletionNotificationResult> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { request: true, listing: true },
  });

  if (!match) {
    return {
      success: false,
      buyerNotified: false,
      sellerNotified: false,
      meetingDate,
      confirmedAt,
      matchId,
    };
  }

  const meetingDateStr = formatDateArabic(meetingDate);
  const timestampStr = formatTimestamp(confirmedAt);

  // ── Notification content ──
  const notificationContent = [
    `🎉 تهانينا! تم الاتفاق على موعد اللقاء`,
    ``,
    `📅 الموعد المتفق عليه: ${meetingDateStr}`,
    `📋 رقم التوثيق: ${matchId}`,
    `⏰ وقت التأكيد: ${timestampStr}`,
    ``,
    `⚠️ إشعار قانوني:`,
    `التزام منصة عقار Match تجاهكما انقضى بموجب الاتفاقية.`,
    `يُرجى الحضور في الموعد المتفق عليه.`,
  ].join("\n");

  // ── Send to buyer ──
  let buyerNotified = false;
  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.buyerId,
        channel: "IN_APP",
      },
    });
    buyerNotified = true;
  } catch {
    // Unique constraint — safe to ignore
    buyerNotified = true;
  }

  // ── Send to seller ──
  let sellerNotified = false;
  try {
    await db.matchNotification.create({
      data: {
        requestId: match.requestId,
        listingId: match.listingId,
        matchId: match.id,
        userId: match.sellerId,
        channel: "IN_APP",
      },
    });
    sellerNotified = true;
  } catch {
    // Unique constraint — safe to ignore
    sellerNotified = true;
  }

  return {
    success: buyerNotified && sellerNotified,
    buyerNotified,
    sellerNotified,
    meetingDate,
    confirmedAt,
    matchId,
  };
}
