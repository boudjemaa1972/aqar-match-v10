import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// GET /api/admin/offers — list all offers
export async function GET() {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }
  const offers = await db.promotionalOffer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  return NextResponse.json({ offers });
}

// POST /api/admin/offers — create new offer
const createSchema = z.object({
  code: z.string().min(3).max(50),
  category: z.enum(["INDIVIDUAL", "AGENCY", "DEVELOPER"]),
  discountType: z.enum(["PERCENTAGE", "FIXED_WAIVER", "FREE_TRIAL_DAYS"]),
  discountValue: z.number().min(0),
  maxRedemptions: z.number().int().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export async function POST(req: Request) {
  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "البيانات غير صالحة", issues: parsed.error.issues }, { status: 422 });
  }
  const d = parsed.data;
  const offer = await db.promotionalOffer.create({
    data: {
      code: d.code,
      category: d.category,
      discountType: d.discountType,
      discountValue: d.discountValue,
      maxRedemptions: d.maxRedemptions ?? null,
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      active: true,
    },
  });
  return NextResponse.json({ ok: true, offer });
}
