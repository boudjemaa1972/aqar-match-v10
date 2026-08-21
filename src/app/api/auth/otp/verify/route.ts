import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtp } from "@/lib/auth";

// POST /api/auth/otp/verify
// Body: { phone: string, code: string }
// On success: sets aqar_session cookie and returns { ok, user }
// On failure: returns 4xx with error message

const schema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "البيانات غير صالحة" }, { status: 422 });
  }

  const result = await verifyOtp(parsed.data.phone, parsed.data.code);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, user: result.user });
}
