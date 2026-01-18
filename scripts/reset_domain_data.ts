/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";

function normalizeDomain(domainOrUrl: string): string {
  const raw = String(domainOrUrl || "").trim();
  if (!raw) return "";
  if (raw.includes("://")) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      // fall through
    }
  }
  const noProto = raw.replace(/^\/\//, "");
  const hostish = noProto.split("/")[0]?.split("?")[0]?.split("#")[0] || noProto;
  return hostish.trim().toLowerCase();
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const domainRaw = arg("domain") || process.env.TRUSTEYE_DOMAIN || "sunnysteps.com";
  const domain = normalizeDomain(domainRaw);
  if (!domain) throw new Error("missing --domain");

  const keepProducts = hasFlag("keep-products") || !hasFlag("delete-products");

  const customer = await prisma.customer.findUnique({ where: { domain } });
  if (!customer) throw new Error(`customer_not_found: ${domain}`);

  console.log("[reset_domain_data]", { domain, customerId: customer.id, keepProducts });

  // Assets + versions
  const assets = await prisma.asset.findMany({ where: { customerId: customer.id }, select: { id: true } });
  const assetIds = assets.map((a) => a.id);
  if (assetIds.length) {
    await prisma.assetVersion.deleteMany({ where: { assetId: { in: assetIds } } });
  }
  await prisma.asset.deleteMany({ where: { customerId: customer.id } });

  // Recommendations
  await prisma.contentRecommendation.deleteMany({ where: { customerId: customer.id } });

  // Questions + gaps/needs
  await prisma.questionGap.deleteMany({ where: { question: { customerId: customer.id } } });
  await prisma.questionNeed.deleteMany({ where: { question: { customerId: customer.id } } });
  await prisma.question.deleteMany({ where: { customerId: customer.id } });

  // Probes + score snapshots
  await prisma.visibilityScoreSnapshot.deleteMany({ where: { customerId: customer.id } });
  await prisma.trustScoreSnapshot.deleteMany({ where: { customerId: customer.id } });
  await prisma.consumerTrustSnapshot.deleteMany({ where: { customerId: customer.id } });
  await prisma.probeRun.deleteMany({ where: { customerId: customer.id } }); // cascades ProbeAnswer

  // Knowledge (claims + evidence)
  await prisma.evidence.deleteMany({ where: { claim: { customerId: customer.id } } });
  await prisma.claim.deleteMany({ where: { customerId: customer.id } });

  // Crawls
  await prisma.crawlPage.deleteMany({ where: { crawlRun: { customerId: customer.id } } });
  await prisma.crawlRun.deleteMany({ where: { customerId: customer.id } });

  // Events + activity
  await prisma.activityEvent.deleteMany({ where: { customerId: customer.id } });
  await prisma.event.deleteMany({ where: { session: { customerId: customer.id } } });
  await prisma.receipt.deleteMany({ where: { customerId: customer.id } });

  // Products (optional)
  await prisma.productPatch.deleteMany({ where: { customerId: customer.id } });
  if (!keepProducts) {
    await prisma.product.deleteMany({ where: { customerId: customer.id } });
  }

  console.log("✅ reset complete for", domain);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

