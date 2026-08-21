import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireSellerOfMatch,
  SessionError,
  sessionErrorResponse,
} from "@/lib/session";
import { encryptJSON } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/negotiation/[matchId]/counter
//
//  Seller responds to a buyer's offer with a counter-offer.
//  Body: { counterOffer: number, note?: string, accept?: boolean }
//
//  Behaviour:
//   • If accept=true: seller accepts the buyer's CURRENT offer →
//     match.status=ACCEPTED, negotiation.revealed=true.
//   • Otherwise: seller.counterOffer is stored, buyer's turn.
//
//  IDOR protection: caller must be the seller of this match.
// ──────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  counterOffer: z
    .number({ message: "العرض المقابل مطلوب" })
    .int()
    .min(10000, "الحد الأدنى 10,000 دج")
    .optional(),
  note: z.string().max(500).optional(),
  accept: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
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

  const { counterOffer, note, accept } = parsed.data;

  let ctx;
  try {
    ctx = await requireSellerOfMatch(matchId);
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
      { error: "هذه المطابقة مغلقة." },
      { status: 400 },
    );
  }

  if (!match.negotiation || match.negotiation.buyerOffer === null) {
    return NextResponse.json(
      { error: "لا يوجد عرض من المشتري للرد عليه." },
      { status: 400 },
    );
  }

  const buyerOffer = match.negotiation.buyerOffer;
  const noteEnc = note ? await encryptJSON({ note }) : null;

  // ── Accept path ───────────────────────────────────────────────
  if (accept) {
    await db.$transaction([
      db.match.update({
        where: { id: matchId },
        data: {
          status: "BUYER_FEE_PAID", // = ACCEPTED (contact revealed)
          sellerConsented: true,
        },
      }),
      db.negotiation.update({
        where: { matchId },
        data: {
          sellerOffer: buyerOffer, // agreed at buyer's offer
          sellerNoteEnc: noteEnc,
          revealed: true,
          buyerTurn: false,
          sellerHandled: true,
        },
      }),
    ]);

    return NextResponse.json({
      matchId,
      status: "BUYER_FEE_PAID", // = ACCEPTED
      agreedPrice: buyerOffer,
      revealed: true,
      message: `قبلت عرض المشتري (${buyerOffer.toLocaleString("en-US")} دج). تم فتح بيانات الاتصال للمشتري.`,
    });
  }

  // ── Counter-offer path ───────────────────────────────────────
  if (!counterOffer) {
    return NextResponse.json(
      { error: "يجب تقديم عرض مقابل أو قبول عرض المشتري." },
      { status: 400 },
    );
  }

  // Auto-accept if seller's counter is within 2% of buyer's offer
  const diff = Math.abs(counterOffer - buyerOffer);
  const tolerance = buyerOffer * 0.02;
  const autoAgree = diff <= tolerance;

  await db.negotiation.update({
    where: { matchId },
    data: {
      sellerOffer: counterOffer,
      sellerNoteEnc: noteEnc,
      buyerTurn: true, // back to buyer
      sellerHandled: true,
      revealed: autoAgree,
    },
  });

  if (autoAgree) {
    await db.match.update({
      where: { id: matchId },
      data: { status: "BUYER_FEE_PAID", sellerConsented: true }, // = ACCEPTED
    });
    return NextResponse.json({
      matchId,
      status: "BUYER_FEE_PAID", // = ACCEPTED
      agreedPrice: Math.round((buyerOffer + counterOffer) / 2),
      revealed: true,
      message: `عروضكما قريبة جداً — تم التوافق تلقائياً على ${Math.round((buyerOffer + counterOffer) / 2).toLocaleString("en-US")} دج.`,
    });
  }

  return NextResponse.json({
    matchId,
    status: "BUYER_NOTIFIED", // awaiting buyer's response
    sellerOffer: counterOffer,
    revealed: false,
    message: `تم إرسال عرضك المقابل (${counterOffer.toLocaleString("en-US")} دج) إلى المشتري — في انتظار رده.`,
  });
}
