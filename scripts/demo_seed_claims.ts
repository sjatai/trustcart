/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { writeReceipt } from "@/lib/receipts";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function upsertClaim(customerId: string, key: string, value: string, url: string, snippet: string, confidence = 95) {
  const existing = await prisma.claim.findFirst({ where: { customerId, key } });
  if (existing) {
    const updated = await prisma.claim.update({
      where: { id: existing.id },
      data: { value, confidence, freshnessAt: new Date() },
    });
    await prisma.evidence.create({
      data: { claimId: updated.id, url, snippet },
    });
    return updated;
  }
  return prisma.claim.create({
    data: {
      customerId,
      key,
      value,
      confidence,
      freshnessAt: new Date(),
      evidence: { create: [{ url, snippet }] },
    },
  });
}

async function main() {
  const domain = (arg("domain") || process.env.TRUSTEYE_DOMAIN || "sunnysteps.com").trim();
  if (!domain) throw new Error("missing --domain");

  const customer = await getOrCreateCustomerByDomain(domain);

  // Minimal “verified facts” to unblock at least one publish.
  await upsertClaim(
    customer.id,
    "Store hours (Orchard Road)",
    "SunnyStep Orchard pop-up: Mon–Sun 11:00–21:00 (last entry 20:30).",
    `https://${customer.domain}/locations/orchard`,
    "Orchard pop-up hours: 11am–9pm daily."
  );

  await upsertClaim(
    customer.id,
    "Walk-in policy",
    "Walk-ins welcome. You can try on sizes in-store; popular sizes may sell out.",
    `https://${customer.domain}/faq`,
    "Walk-ins welcome; try sizes in-store."
  );

  await upsertClaim(
    customer.id,
    "Return policy",
    "Returns accepted within 30 days of delivery for unworn items in original packaging. Exchanges available for size changes (subject to stock).",
    `https://${customer.domain}/policies/returns`,
    "30-day returns for unworn items; exchanges for size changes."
  );

  await upsertClaim(
    customer.id,
    "Shipping (Singapore)",
    "Standard delivery in Singapore: 2–4 business days. Express: next business day in most SG zones. Free shipping over SGD 80.",
    `https://${customer.domain}/shipping`,
    "SG shipping: 2–4 business days; express next day; free over SGD 80."
  );

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "ORCHESTRATOR",
    summary: "Seeded demo verified claims (SunnyStep)",
    input: { domain: customer.domain },
    output: { keys: ["Store hours (Orchard Road)", "Walk-in policy", "Return policy", "Shipping (Singapore)"] },
  });

  console.log("seeded claims for", customer.domain);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

