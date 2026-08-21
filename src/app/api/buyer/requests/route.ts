import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import { decryptJSON } from "@/lib/crypto";

// ──────────────────────────────────────────────────────────────────
//  GET /api/buyer/requests
//
//  Returns all MatchRequests created by the current user (as a buyer).
//  Each request includes a count of matches it generated.
//
//  IDOR protection: filter by userId = session.user.id
//  SECURITY:
//    • maxBudget is stored encrypted (maxBudgetEnc). We decrypt it
//      here because the buyer is the OWNER of this data — same rule
//      as seller seeing their own secretMinPrice.
//    • We never return the raw maxBudgetEnc ciphertext.
// ──────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getOrCreateSession();

  const requests = await db.matchRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: {
        select: { matches: true },
      },
    },
  });

  const out = await Promise.all(
    requests.map(async (r) => {
      // Decrypt the buyer's own max budget
      let maxBudget: number | null = null;
      if (r.maxBudgetEnc) {
        const decoded = await decryptJSON<{ maxBudget: number }>(r.maxBudgetEnc);
        maxBudget = decoded?.maxBudget ?? null;
      }

      return {
        id: r.id,
        intent: r.intent,
        type: r.type,
        city: r.city,
        commune: r.commune,
        district: r.district,
        maxBudget, // decrypted — buyer sees own budget
        status: r.status, // OPEN / FULFILLED / CLOSED
        createdAt: r.createdAt,
        matchesCount: r._count.matches,
      };
    }),
  );

  return NextResponse.json({ requests: out });
}
