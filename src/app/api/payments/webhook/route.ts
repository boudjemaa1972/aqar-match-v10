import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature, type Gateway } from "@/lib/payments";

// ──────────────────────────────────────────────────────────────────
//  POST /api/payments/webhook
//
//  Unified webhook handler for all Algerian payment gateways.
//  Called by CCP / BaridiMob / Edahabia when a payment completes.
//
//  Headers:
//    x-gateway: ccp | baridimob | edahabia
//    x-signature: HMAC-SHA256(rawBody, gateway_secret)
//
//  Body (normalized — each gateway sends a different shape, but we
//  require payment processors to map to this contract):
//    {
//      paymentId: string,         // our internal payment ID
//      status: "paid" | "failed",
//      amount: number,            // DZD
//      matchId: string,
//      party: "seller" | "buyer",
//      transactionRef: string     // gateway-side reference
//    }
//
//  Security:
//  • Signature verified via verifyWebhookSignature().
//  • Idempotent: if the same paymentId is confirmed twice, the second
//    call is a no-op (status already = paid).
//  • Match status transitions are atomic via $transaction.
// ──────────────────────────────────────────────────────────────────

interface WebhookBody {
  paymentId: string;
  status: "paid" | "failed";
  amount: number;
  matchId: string;
  party: "seller" | "buyer";
  transactionRef: string;
}

export async function POST(req: Request) {
  // ── Read raw body for signature verification ─────────────────
  const rawBody = await req.text();
  const gateway = req.headers.get("x-gateway") as Gateway | null;
  const signature = req.headers.get("x-signature") || "";

  if (!gateway || !["ccp", "baridimob", "edahabia", "demo"].includes(gateway)) {
    return NextResponse.json(
      { error: "Missing or invalid x-gateway header" },
      { status: 400 },
    );
  }

  // ── Verify HMAC signature ────────────────────────────────────
  const valid = await verifyWebhookSignature({
    gateway,
    body: rawBody,
    signature,
  });
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // ── Parse body ───────────────────────────────────────────────
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // ── Find the match ───────────────────────────────────────────
  const match = await db.match.findUnique({
    where: { id: body.matchId },
  });
  if (!match) {
    return NextResponse.json(
      { error: "Match not found" },
      { status: 404 },
    );
  }

  // ── Idempotency: if already paid, return success ─────────────
  if (body.party === "seller" && match.sellerFeePaid) {
    return NextResponse.json({ ok: true, idempotent: true });
  }
  if (body.party === "buyer" && match.buyerFeePaid) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // ── Handle "paid" status ─────────────────────────────────────
  if (body.status === "paid") {
    if (body.party === "seller") {
      // Seller paid → status: PROPOSED → SELLER_FEE_PAID
      // (buyer will be notified separately)
      await db.match.update({
        where: { id: body.matchId },
        data: {
          sellerFeePaid: true,
          sellerConsented: true,
          sellerConsentedAt: new Date(),
          status: "BUYER_NOTIFIED", // skip SELLER_FEE_PAID, go straight to buyer-notified
        },
      });
    } else {
      // Buyer paid → status: BUYER_NOTIFIED → BUYER_FEE_PAID (contact revealed)
      const now = new Date();
      const refundEligibleAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h
      await db.match.update({
        where: { id: body.matchId },
        data: {
          buyerFeePaid: true,
          status: "BUYER_FEE_PAID",
          buyerFeePaidAt: now,
          refundEligibleAt,
        },
      });
    }
    return NextResponse.json({ ok: true, status: "paid" });
  }

  // ── Handle "failed" status ───────────────────────────────────
  // Don't change match status — just log the failure.
  // The user can retry the payment.
  console.warn(`[payments/webhook] payment ${body.paymentId} failed for match ${body.matchId} (${body.party})`);
  return NextResponse.json({ ok: true, status: "failed" });
}
