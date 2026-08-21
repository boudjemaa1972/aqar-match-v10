// ──────────────────────────────────────────────────────────────────
//  scripts/create-admin.ts
//
//  CLI script to promote a user to ADMIN role.
//  Run manually from the server:
//    npx bun scripts/create-admin.ts <user-email-or-id>
//
//  This is the ONLY way to grant admin access — no web endpoint
//  can do it, preventing privilege escalation via API.
// ──────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error("Usage: npx bun scripts/create-admin.ts <user-email-or-id>");
    console.error("Example: npx bun scripts/create-admin.ts phone+abc123@aqarmatch.dz");
    process.exit(1);
  }

  // Find user by email or id
  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { id: identifier },
      ],
    },
    select: { id: true, email: true, systemRole: true, verified: true, isGuest: true },
  });

  if (!user) {
    console.error(`❌ User not found: ${identifier}`);
    console.error("Make sure the user has registered via OTP first.");
    process.exit(1);
  }

  if (user.systemRole === "ADMIN") {
    console.log(`✓ User ${user.email} is already an admin.`);
    process.exit(0);
  }

  if (user.isGuest || !user.verified) {
    console.error(`❌ User ${user.email} is not verified (guest or unverified).`);
    console.error("The user must complete OTP verification first.");
    process.exit(1);
  }

  await db.user.update({
    where: { id: user.id },
    data: { systemRole: "ADMIN" },
  });

  console.log(`✅ User ${user.email} promoted to ADMIN successfully.`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   They can now access /admin`);
  process.exit(0);
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(2);
  })
  .finally(async () => {
    await db.$disconnect();
  });
