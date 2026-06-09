/**
 * One-time cleanup: zero out sample balances for the 5 seeded test reps.
 * These were created by seed_full.js with 120 issued per product (480 total each).
 * Run: node scripts/clear_seed_samples.js
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_EMAILS = [
  "rep@kibagrep.dev",
  "rep2@kibagrep.dev",
  "rep3@kibagrep.dev",
  "rep4@kibagrep.dev",
  "rep5@kibagrep.dev",
];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: SEED_EMAILS } },
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log("No seeded rep accounts found — nothing to clear.");
    return;
  }

  console.log(`Found ${users.length} seeded rep(s):`);
  users.forEach(u => console.log(`  ${u.email} (${u.id})`));

  const userIds = users.map(u => u.id);

  const { count } = await prisma.sampleBalance.updateMany({
    where: { user_id: { in: userIds } },
    data: { issued: 0, given: 0 },
  });

  console.log(`\nCleared ${count} sample balance row(s) — issued and given reset to 0.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
