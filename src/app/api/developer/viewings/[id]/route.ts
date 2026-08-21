import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSecret } from "@/lib/admin-guard";

// ──────────────────────────────────────────────────────────────────
//  PATCH /api/developer/viewings/[id]
//  Admin-only: updates viewing outcome after the viewing happens.
//  Protected by CRON_SECRET.
//
//  Body: { outcome: "completed" | "no_show_buyer" | "no_show_seller" | "cancelled", notes?: string }
//  This feeds into commission tracking: only "completed" viewings
//  can lead to deal closure and commission settlement.
// ──────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  outcome: z.enum(["completed", "no_show_buyer", "no_show_seller", "cancelled"]),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = requireAdminSecret(req);
  if (guard) return guard;

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "النتيجة غير صالحة" }, { status: 422 });
  }

  const viewing = await db.viewing.findUnique({ where: { id } });
  if (!viewing) {
    return NextResponse.json({ error: "المعاينة غير موجودة" }, { status: 404 });
  }

  // Map outcome to status
  const newStatus =
    parsed.data.outcome === "completed" ? "COMPLETED"
    : parsed.data.outcome === "cancelled" ? "CANCELLED"
    : "NO_SHOW";

  const updated = await db.viewing.update({
    where: { id },
    data: {
      status: newStatus,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes || viewing.notes,
    },
  });

  return NextResponse.json({
    ok: true,
    viewing: {
      id: updated.id,
      status: updated.status,
      outcome: updated.outcome,
    },
  });
}
