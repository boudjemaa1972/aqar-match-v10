// ──────────────────────────────────────────────────────────────────
//  Audit Log helper — records every auth event for security + compliance.
//
//  USAGE:
//  ─────
//    import { auditLog } from "@/lib/auth/audit-log";
//    await auditLog({
//      userId: user.id,
//      event: "LOGIN_EMAIL",
//      success: true,
//      ip: clientIp,
//      userAgent: req.headers.get("user-agent") || null,
//      metadata: "email=u@ex**",
//    });
//
//  SECURITY:
//  ─────────
//  • NEVER log raw passwords, OTP codes, or session tokens.
//  • Mask PII in `metadata` (e.g., "u@ex**" instead of "user@example.com").
//  • Keep logs short (≤ 200 chars metadata) to prevent log injection
//    and storage bloat.
//
//  RETENTION:
//  ─────────
//  Logs are retained for 90 days by default (configurable via
//  AUDIT_LOG_RETENTION_DAYS env var). Cleanup is performed by a
//  cron job (TBD — for now, manual SQL or piggyback on process-expired).
// ──────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import type { AuditEvent } from "@prisma/client";

interface AuditLogInput {
  userId?: string | null;
  event: AuditEvent;
  success?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: string | null;
}

/**
 * Write an audit log entry. Best-effort: failures here are logged to
 * the console but NEVER thrown to the caller — a failed audit write
 * must not break the user flow (e.g., login would fail otherwise).
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        event: input.event,
        success: input.success ?? true,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? null,
      },
    });
  } catch (e) {
    // Don't throw — log to stderr and continue.
    console.error("[audit-log] failed to write entry:", e);
  }
}

// ── PII masking helpers ──────────────────────────────────────────
// Used to safely include partial PII in audit metadata for forensic
// purposes WITHOUT exposing the full identifier (GDPR-compliant).

/**
 * Mask an email address: "user@example.com" → "u@ex**"
 * Keeps the first char of the local part + first 2 chars of the domain.
 */
export function maskEmail(email: string): string {
  try {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "***";
    const maskedLocal = local.length > 1 ? local[0] + "***" : local;
    const maskedDomain = domain.length > 2 ? domain.slice(0, 2) + "***" : "***";
    return `${maskedLocal}@${maskedDomain}`;
  } catch {
    return "***";
  }
}

/**
 * Mask a phone number: "+213551234567" → "+2135***4567"
 * Keeps country code + last 4 digits.
 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return "***";
  const countryCode = phone.slice(0, 5); // e.g. "+2135"
  const last4 = phone.slice(-4);
  return `${countryCode}***${last4}`;
}

// ── Cleanup helper (for cron integration) ─────────────────────────
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Delete audit logs older than the retention period.
 * Intended to be called by a daily cron job.
 *
 * @returns Number of deleted rows.
 */
export async function cleanupOldAuditLogs(): Promise<number> {
  const retentionDays = Number(process.env.AUDIT_LOG_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
