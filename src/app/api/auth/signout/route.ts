import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

// POST /api/auth/signout
// Clears session cookie and rotates DB token.

export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}
