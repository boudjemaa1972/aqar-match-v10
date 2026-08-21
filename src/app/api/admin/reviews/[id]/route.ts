import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, SessionError, sessionErrorResponse } from "@/lib/session";

// ──────────────────────────────────────────────────────────────────
//  PATCH /api/admin/reviews/[id]
//  Approve or reject a pending review. Protected by requireAdmin().
//  Body: { status: "APPROVED" | "REJECTED" }
// ──────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try { await requireAdmin(); } catch (e) {
    if (e instanceof SessionError) { const r = sessionErrorResponse(e); return NextResponse.json(r.body, { status: r.status }); }
    throw e;
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalid" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 422 });
  }

  const review = await db.review.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({
    ok: true,
    reviewId: review.id,
    status: review.status,
  });
}
