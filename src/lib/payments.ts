// ──────────────────────────────────────────────────────────────────
//  Algerian payment gateway abstraction.
//
//  SUPPORTED GATEWAYS (Phase 2 — to be implemented):
//  ─────────────────────────────────────────────────────────────
//  • CCP (Algérie Poste) — postal account transfer.
//  • BaridiMob — mobile banking app by Algérie Poste.
//  • Edahabia — national bank card (GIE Monétique).
//
//  CURRENT STATUS (Phase 1):
//  ───────────────────────────
//  All three gateways are STUBBED. The `createPaymentIntent` function
//  returns a fake payment URL that simulates the gateway redirect.
//  In production, replace each stub with the real SDK/API call.
//
//  WEBHOOK CONTRACT (same for all gateways):
//  ────────────────────────────────────────
//  POST /api/payments/webhook
//  Headers:
//    x-gateway: ccp | baridimob | edahabia
//    x-signature: HMAC-SHA256(body, gateway_secret)
//  Body (gateway-specific, normalized by the webhook handler):
//    { paymentId, status, amount, currency, matchId, party }
//
//  Security:
//  • Every webhook MUST be signature-verified (HMAC-SHA256).
//  • Payment intents are idempotent — re-paying the same intent
//    returns the existing intent URL.
//  • Status transitions are append-only (PaymentEvent table).
// ──────────────────────────────────────────────────────────────────

export type Gateway = "ccp" | "baridimob" | "edahabia" | "demo";

export interface PaymentIntent {
  id: string;          // internal payment ID (cuid)
  gateway: Gateway;
  gatewayUrl: string;  // URL the user is redirected to
  amount: number;      // DZD
  matchId: string;
  party: "seller" | "buyer";
  status: "pending" | "paid" | "failed" | "refunded";
  createdAt: Date;
  expiresAt: Date;     // 30 min
}

// ── Stub: create a payment intent ──────────────────────────────
// In production, this calls the real gateway's API:
//   • CCP: POST to Algérie Poste's merchant API with merchant_id.
//   • BaridiMob: deeplink URL `baridimob://pay?merchantId=...&amount=...`
//   • Edahabia: GIE Monétique API with merchant_id + terminal_id.
export async function createPaymentIntent(params: {
  gateway: Gateway;
  amount: number;
  matchId: string;
  party: "seller" | "buyer";
}): Promise<PaymentIntent> {
  const id = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min

  // ── Gateway-specific URL generation ──
  let gatewayUrl: string;
  switch (params.gateway) {
    case "ccp":
      // TODO: replace with real CCP merchant API call.
      gatewayUrl = `https://ccp.poste.dz/pay/${id}?amount=${params.amount}`;
      break;
    case "baridimob":
      // TODO: replace with real BaridiMob deeplink.
      gatewayUrl = `baridimob://pay?paymentId=${id}&amount=${params.amount}`;
      break;
    case "edahabia":
      // TODO: replace with real GIE Monétique API.
      gatewayUrl = `https://edahabia.dz/pay/${id}?amount=${params.amount}`;
      break;
    case "demo":
      // Phase 1 demo mode — auto-marks as paid after 2 seconds.
      gatewayUrl = `/api/payments/demo-confirm/${id}`;
      break;
    default:
      throw new Error(`Unsupported gateway: ${params.gateway}`);
  }

  return {
    id,
    gateway: params.gateway,
    gatewayUrl,
    amount: params.amount,
    matchId: params.matchId,
    party: params.party,
    status: "pending",
    createdAt: now,
    expiresAt,
  };
}

// ── Webhook signature verification ─────────────────────────────
// Every gateway sends a different signature header. This function
// normalizes verification across all of them.
export async function verifyWebhookSignature(params: {
  gateway: Gateway;
  body: string;       // raw request body
  signature: string;  // from x-signature header
}): Promise<boolean> {
  const secrets: Record<Gateway, string | undefined> = {
    ccp: process.env.CCP_WEBHOOK_SECRET,
    baridimob: process.env.BARIDIMOB_WEBHOOK_SECRET,
    edahabia: process.env.EDAHABIA_WEBHOOK_SECRET,
    demo: process.env.CRON_SECRET, // demo uses the cron secret
  };
  const secret = secrets[params.gateway];
  if (!secret) return false;

  // HMAC-SHA256
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBuf = new Uint8Array(
    params.signature.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBuf,
    new TextEncoder().encode(params.body),
  );
}

// ── Gateway labels (for UI) ────────────────────────────────────
export const GATEWAY_LABELS: Record<Gateway, { ar: string; fr: string }> = {
  ccp:        { ar: " CCP (بريد الجزائر)",  fr: "CCP (Algérie Poste)" },
  baridimob:  { ar: "BaridiMob",              fr: "BaridiMob" },
  edahabia:   { ar: "Edahabia (الذهبية)",     fr: "Edahabia" },
  demo:       { ar: "تجريبي (Demo)",          fr: "Démo" },
};
