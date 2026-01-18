/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function parseKeep(): string[] {
  const raw = arg("keep") || process.env.DEMO_KEEP_DOMAINS || "sunnysteps.com";
  return raw
    .split(/,|\n/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const keep = new Set(parseKeep());
  const dryRun = process.argv.includes("--dry-run");

  const customers = await prisma.customer.findMany({ select: { id: true, domain: true, name: true } });
  const toDelete = customers.filter((c) => !keep.has(c.domain.toLowerCase()));

  console.log("[prune_customers]", { keep: Array.from(keep), totalCustomers: customers.length, deleteCount: toDelete.length, dryRun });
  for (const c of toDelete) console.log(" - delete", c.domain, c.id);

  if (dryRun) return;

  // Delete customers; Prisma relations are mostly onDelete: Cascade so this removes their domain data too.
  for (const c of toDelete) {
    await prisma.customer.delete({ where: { id: c.id } });
  }

  console.log("✅ pruned customers; kept:", Array.from(keep));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

