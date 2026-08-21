import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { negotiationOfferSchema } from "@/lib/schemas";
import { encryptJSON } from "@/lib/crypto";
import {
  requireBuyerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  POST /api/negotiation/offer
//
//  Buyer submits an offer. The offer is stored and the round count is
//  incremented. The seller is NOTIFIED — they must respond via:
//     POST /api/seller/negotiation/[matchId]/counter
//
//  This is true blind negotiation: neither party sees the other's
//  identity until both explicitly agree on a price.
//
//  IDOR protection: caller must be the buyer of this match.
// ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = negotiationOfferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "بيانات غير صالحة",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const { matchId, offer, note } = parsed.data;

  // ── Ownership check ───────────────────────────────────────────
  let ctx;
  try {
    ctx = await requireBuyerOfMatch(matchId);
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  const { match } = ctx;

  if (match.status === "REJECTED" || match.status === "EXPIRED") {
    return NextResponse.json(
      { error: "هذه المطابقة مغلقة — لا يمكن التفاوض عليها." },
      { status: 400 },
    );
  }

  const noteEnc = note ? await encryptJSON({ note }) : null;

  // Create or update negotiation row — buyer just submitted, now seller's turn
  const negotiation = await db.negotiation.upsert({
    where: { matchId },
    create: {
      matchId,
      buyerOffer: offer,
      buyerNoteEnc: noteEnc,
      buyerTurn: false, // seller's turn now
      rounds: 1,
      revealed: false,
    },
    update: {
      buyerOffer: offer,
      buyerNoteEnc: noteEnc ?? match.negotiation?.buyerNoteEnc ?? null,
      buyerTurn: false,
      rounds: (match.negotiation?.rounds ?? 0) + 1,
    },
  });

  return NextResponse.json({
    matchId,
    status: "UNLOCK_REQ",
    rounds: negotiation.rounds,
    buyerOffer: offer,
    sellerOffer: match.negotiation?.sellerOffer ?? null,
    revealed: false,
    message:
      "تم إرسال عرضك إلى البائع — في انتظار الرد. " +
      "في وضع العرض التوضيحي، بدّل إلى وضع البائع للرد على العرض.",
  });
}
