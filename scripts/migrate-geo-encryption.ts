// ──────────────────────────────────────────────────────────────────
//  scripts/migrate-geo-encryption.ts
//
//  ONE-TIME data migration — moves GPS coordinates from the deprecated
//  raw columns (latitude, longitude, locationAccuracy) into the new
//  encrypted column geoLocationEnc (AES-256-GCM JSON {lat,lng,accuracy?}).
//
//  RUN ORDER (read carefully):
//   1. Schema migration 1 has already added geoLocationEnc AND kept the
//      old latitude/longitude/locationAccuracy columns.
//   2. Run THIS script: it reads old columns, encrypts, writes new column.
//   3. Verify all rows migrated (count before == count after).
//   4. Schema migration 2 then drops the old columns.
//
//  In the current dev DB there are 0 listings with GPS data, so this
//  script is a no-op locally — but it is production-ready.
//
//  Run via:  npx bun scripts/migrate-geo-encryption.ts
//  (bun handles TS natively without needing ts-node or tsx)
// ──────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { encryptJSON } from "../src/lib/crypto";

const db = new PrismaClient();

interface OldListing {
  id: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  geoLocationEnc: string | null;
}

async function main() {
  console.log("\n📦 AqarMatch — Geo Location Encryption Migration\n");

  // ── Step 0: check if old columns still exist ─────────────────
  // The Prisma client no longer types latitude/longitude after migration 2
  // drops them. We use a graceful probe to detect whether migration 1
  // (which keeps them) or migration 2 (which drops them) has been applied.
  let oldColumnsExist = true;
  try {
    await db.$queryRaw`SELECT latitude FROM Listing LIMIT 1`;
  } catch {
    oldColumnsExist = false;
  }

  if (!oldColumnsExist) {
    console.log("  ✓ Old GPS columns (latitude/longitude/locationAccuracy) no longer exist.");
    console.log("  ✓ Migration already completed (or never had raw GPS data). Nothing to do.");
    return;
  }

  // ── Step 1: count rows with raw GPS data ──────────────────────
  // We use $queryRaw because the Prisma client no longer types the old
  // columns (they were removed from the schema in migration 1).
  const rows = await db.$queryRaw<OldListing[]>`
    SELECT id, latitude, longitude, locationAccuracy, geoLocationEnc
    FROM Listing
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;

  const total = rows.length;
  console.log(`  Found ${total} listing(s) with raw GPS coordinates to migrate.\n`);

  if (total === 0) {
    console.log("  ✓ Nothing to migrate. Exiting.");
    return;
  }

  // ── Step 2: encrypt + update each row ─────────────────────────
  let migrated = 0;
  const errors: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      // Skip if already migrated (idempotent — safe to re-run)
      if (row.geoLocationEnc) {
        console.log(`  ⊘ Listing ${row.id} already has geoLocationEnc — skipping.`);
        migrated++;
        continue;
      }

      const encrypted = await encryptJSON({
        lat: row.latitude,
        lng: row.longitude,
        accuracy: row.locationAccuracy ?? null,
      });

      await db.$executeRaw`
        UPDATE Listing
        SET geoLocationEnc = ${encrypted}
        WHERE id = ${row.id}
      `;

      migrated++;
      console.log(`  ✓ Migrated listing ${row.id} (lat=${row.latitude}, lng=${row.longitude})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ id: row.id, error: msg });
      console.log(`  ✗ Failed listing ${row.id}: ${msg}`);
    }
  }

  // ── Step 3: summary ───────────────────────────────────────────
  console.log("\n────────────────────────────────────────");
  console.log(`  Total rows to migrate: ${total}`);
  console.log(`  Successfully migrated: ${migrated}`);
  console.log(`  Errors:                ${errors.length}`);

  if (errors.length > 0) {
    console.log("\n  Error details:");
    for (const e of errors) {
      console.log(`    • ${e.id}: ${e.error}`);
    }
  }

  // ── Step 4: verify no rows were missed ────────────────────────
  const remaining = await db.$queryRaw<OldListing[]>`
    SELECT id FROM Listing
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      AND geoLocationEnc IS NULL
  `;
  if (remaining.length > 0) {
    console.log(`\n  ⚠ WARNING: ${remaining.length} row(s) still have raw GPS but no geoLocationEnc!`);
    process.exit(1);
  } else {
    console.log("\n  ✓ Verification passed: all GPS rows migrated.");
  }

  if (errors.length > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ Migration complete. Safe to run schema migration 2 (drop old columns).");
    process.exit(0);
  }
}

main()
  .catch((e) => {
    console.error("Migration crashed:", e);
    process.exit(2);
  })
  .finally(async () => {
    await db.$disconnect();
  });
