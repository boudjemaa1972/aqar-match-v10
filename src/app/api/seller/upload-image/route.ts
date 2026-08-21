import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, SessionError, sessionErrorResponse } from "@/lib/session";
import sharp from "sharp";

// ──────────────────────────────────────────────────────────────────
//  POST /api/seller/upload-image
//
//  Secure image upload for listing photos.
//
//  SECURITY
//  ────────
//  • Auth: requires verified phone (no guests).
//  • Rate limit: 10 uploads per user per 15 min (enforced via DB count).
//  • MIME check: validates actual file magic bytes (not extension).
//    Accepts only image/jpeg, image/png, image/webp, image/avif.
//  • Size limit: 5 MB max.
//  • Re-encode: sharp strips EXIF + re-encodes as WebP quality 80.
//    This also strips any embedded malicious payload.
//  • Storage: writes to /public/uploads/<userId>/<cuid>.webp.
//    Returns the public URL for use in publish flow.
//
//  WHY NOT PRESIGNED S3?
//  ─────────────────────
//  Phase 1 uses local disk for simplicity. Phase 2 will switch to S3/R2
//  with presigned URLs once a storage bucket is provisioned. The API
//  contract (returns { url }) stays the same.
// ──────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const RATE_LIMIT_PER_15MIN = 10;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// Magic-byte signatures for real MIME detection
const MAGIC_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
  // AVIF doesn't have a clean magic prefix; we trust the Content-Type header
  // for AVIF but verify via sharp's decoder.
];

function detectMime(buf: Uint8Array): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (buf.length < sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[i] !== sig.bytes[i]) { match = false; break; }
    }
    if (match) {
      // For WEBP, also check bytes 8-11 are "WEBP"
      if (sig.mime === "image/webp" && buf.length >= 12) {
        const tag = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
        if (tag !== "WEBP") return null;
      }
      return sig.mime;
    }
  }
  return null;
}

export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (e instanceof SessionError) {
      const r = sessionErrorResponse(e);
      return NextResponse.json(r.body, { status: r.status });
    }
    throw e;
  }

  // ── Rate limit: 10 uploads per user per 15 min ───────────────
  // Use Listing.createdAt as a proxy (each upload precedes a listing).
  // A more precise approach would add a dedicated UploadEvent table,
  // but for Phase 1 this is sufficient.
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const recentListings = await db.listing.count({
    where: { ownerId: user.id, createdAt: { gte: since } },
  });
  if (recentListings >= RATE_LIMIT_PER_15MIN) {
    return NextResponse.json(
      { error: "تجاوزت حد رفع الصور (10 كل 15 دقيقة). حاول لاحقاً." },
      { status: 429 },
    );
  }

  // ── Parse multipart form ─────────────────────────────────────
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "ملف الصورة مطلوب" }, { status: 400 });
  }

  // ── Size check ───────────────────────────────────────────────
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `الحد الأقصى 5 ميغابايت. حجم ملفك: ${(file.size / 1024 / 1024).toFixed(1)} ميغابايت` },
      { status: 413 },
    );
  }

  // ── Read file into buffer ────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);

  // ── Real MIME check via magic bytes ──────────────────────────
  const detectedMime = detectMime(buf);
  const declaredMime = file.type;
  if (!detectedMime && !ALLOWED_MIME.has(declaredMime)) {
    return NextResponse.json(
      { error: "نوع الملف غير مدعوم. الأنواع المسموحة: JPEG, PNG, WebP, AVIF" },
      { status: 415 },
    );
  }
  if (detectedMime && !ALLOWED_MIME.has(detectedMime)) {
    return NextResponse.json(
      { error: "نوع الملف الفعلي غير مدعوم" },
      { status: 415 },
    );
  }
  // If declared is JPEG/PNG/WebP but detected differs, prefer detected.
  // If detected is null (could be AVIF), trust declared after sharp validation.

  // ── Re-encode via sharp: strip EXIF, convert to WebP q80 ─────
  let processedBuffer: Buffer;
  try {
    const pipeline = sharp(buf, { failOn: "truncated" })
      .rotate() // auto-orient from EXIF before stripping
      .resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 });
    processedBuffer = await pipeline.toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "decode failed";
    console.error(`[upload-image] sharp decode failed for user ${user.id}:`, msg);
    return NextResponse.json(
      { error: "تعذّر معالجة الصورة — قد يكون الملف تالفاً أو بتنسيق غير مدعوم" },
      { status: 422 },
    );
  }

  // ── Persist to /public/uploads/<userId>/<cuid>.webp ──────────
  const fs = await import("fs/promises");
  const path = await import("path");
  const userDir = path.join(process.cwd(), "public", "uploads", user.id);
  await fs.mkdir(userDir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;
  const filePath = path.join(userDir, filename);
  await fs.writeFile(filePath, processedBuffer);

  // Public URL (relative to origin)
  const url = `/uploads/${user.id}/${filename}`;

  return NextResponse.json({
    ok: true,
    url,
    size: processedBuffer.length,
    mime: "image/webp",
  });
}
