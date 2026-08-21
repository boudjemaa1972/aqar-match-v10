// ──────────────────────────────────────────────────────────────────
//  Aqar Match — Meeting Agreement API Route
//
//  GET  /api/matches/{matchId}/meeting-agreement
//    Returns the current meeting agreement status + proposals
//
//  POST /api/matches/{matchId}/meeting-agreement
//    Body: { proposedDate: string, role: "buyer" | "seller", action: "propose" | "approve" }
//    Processes a meeting agreement action
//
//  Legal basis: Algerian Civil Code, Article 207 (resolutory condition).
//  Success = both parties agree on a meeting date via the platform.
// ──────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  processMeetingAgreement,
  getMeetingAgreementStatus,
} from "@/lib/match/service";

// ══════════════════════════════════════════════════════════════════
//  GET — Fetch meeting agreement status
// ══════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;

  try {
    const status = await getMeetingAgreementStatus(matchId);

    if (!status) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error("GET meeting-agreement error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ══════════════════════════════════════════════════════════════════
//  POST — Process meeting agreement action
// ══════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;

  try {
    const body = await request.json();
    const { proposedDate, role, action } = body;

    // Validate required fields
    if (!proposedDate || !role || !action) {
      return NextResponse.json(
        { error: "Missing required fields: proposedDate, role, action" },
        { status: 400 },
      );
    }

    // Validate role
    if (role !== "buyer" && role !== "seller") {
      return NextResponse.json(
        { error: "Invalid role: must be 'buyer' or 'seller'" },
        { status: 400 },
      );
    }

    // Validate action
    if (action !== "propose" && action !== "approve") {
      return NextResponse.json(
        { error: "Invalid action: must be 'propose' or 'approve'" },
        { status: 400 },
      );
    }

    // Validate proposedDate is a valid ISO string
    const date = new Date(proposedDate);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "Invalid proposedDate format" },
        { status: 400 },
      );
    }

    // Process the meeting agreement action
    const result = await processMeetingAgreement(
      matchId,
      role,
      action,
      proposedDate,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 },
      );
    }

    // If agreed, send completion notification
    if (result.status === "Agreed" && result.agreedDate) {
      const { sendCompletionNotification } = await import(
        "@/lib/matching/completion-notification"
      );
      const match = await db.match.findUnique({ where: { id: matchId } });
      if (match?.agreementConfirmedAt) {
        await sendCompletionNotification(
          matchId,
          result.agreedDate,
          match.agreementConfirmedAt,
        );
      }
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      agreedDate: result.agreedDate,
    });
  } catch (error) {
    console.error("POST meeting-agreement error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
