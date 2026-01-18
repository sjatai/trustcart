/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { getCustomerByDomain } from "@/lib/domain";
import { writeReceipt } from "@/lib/receipts";

type Args = {
  domain: string;
  industry: string;
  geo: string;
  language: string;
  persona: string;
  top: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = argv.findIndex((a) => a === `--${k}`);
    return i >= 0 ? argv[i + 1] : d;
  };

  return {
    domain: get("domain", process.env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnysteps.com")!,
    industry: get("industry", "ecommerce_footwear")!,
    geo: get("geo", "SG-SG-Orchard-MBS")!,
    language: get("language", "en")!,
    persona: get("persona", "consumer")!,
    top: Number(get("top", "50")),
  };
}

// Deterministic mapping from question text → claim keys needed.
// Keep this simple; expand over time.
function inferClaimKeys(q: string): string[] {
  const s = q.toLowerCase();
  const keys: string[] = [];

  // Availability / local
  if (s.includes("available") || s.includes("in singapore")) keys.push("availability.sg.now");
  if (s.includes("orchard") || s.includes("mbs") || s.includes("marina bay")) keys.push("availability.sg.orchard_mbs");
  if (s.includes("reserve") || s.includes("pick up") || s.includes("pickup")) keys.push("pickup.bopis");
  if (s.includes("restock")) keys.push("availability.restock_policy");
  if (s.includes("physical store") || (s.includes("store") && s.includes("singapore"))) keys.push("store.sg.locations");
  if (s.includes("store hours") || (s.includes("hours") && s.includes("singapore"))) keys.push("store.sg.hours");

  // Delivery / shipping
  if (s.includes("delivery") || s.includes("shipping") || s.includes("ship")) keys.push("policy.shipping.sg");
  if (s.includes("how long") || (s.includes("delivery") && s.includes("singapore"))) keys.push("policy.shipping.time_sg");
  if (s.includes("next-day") || s.includes("next day")) keys.push("policy.shipping.next_day_sg");
  if (s.includes("same-day") || s.includes("same day")) keys.push("policy.shipping.same_day_sg");
  if (s.includes("delivery fee") || s.includes("shipping cost") || s.includes("how much")) keys.push("policy.shipping.fee_sg");
  if (s.includes("orchard") || s.includes("downtown") || s.includes("cbd")) keys.push("policy.shipping.regions_sg");

  // Returns / exchanges
  if (s.includes("return policy") || (s.includes("return") && s.includes("policy"))) keys.push("policy.returns.window");
  if (s.includes("returns free")) keys.push("policy.returns.free_sg");
  if (s.includes("exchange") || s.includes("exchanges")) keys.push("policy.exchanges.process");
  if (s.includes("refund")) keys.push("policy.refunds.time");
  if (s.includes("return in store") || (s.includes("return") && s.includes("store"))) keys.push("policy.returns.in_store");

  // Sizing / fit
  if (s.includes("true-to-size") || s.includes("true to size")) keys.push("product.fit.true_to_size");
  if (s.includes("narrow") || s.includes("wide")) keys.push("product.fit.width_notes");
  if (s.includes("wide feet")) keys.push("product.fit.wide_feet");
  if (s.includes("size guide") || s.includes("us/eu") || s.includes("uk conversion")) keys.push("size.guide.conversion");
  if (s.includes("walking all day") || s.includes("all-day") || s.includes("all day")) keys.push("product.comfort.all_day");

  // Materials / care
  if (s.includes("material")) keys.push("product.materials");
  if (s.includes("breathable") || s.includes("singapore weather")) keys.push("product.breathable_sg");
  if (s.includes("water-resistant") || s.includes("water resistant") || s.includes("waterproof")) keys.push("product.water_resistant");
  if (s.includes("clean") || s.includes("care")) keys.push("product.care.cleaning");
  if (s.includes("machine wash")) keys.push("product.care.machine_wash");

  // Occasions
  if (s.includes("office") || s.includes("work")) keys.push("product.occasions.office");
  if (s.includes("wedding") || s.includes("party")) keys.push("product.occasions.events");
  if (s.includes("travel")) keys.push("product.occasions.travel");
  if (s.includes("standing")) keys.push("product.occasions.standing");

  // Trust / proof
  if (s.includes("customers say") || s.includes("reviews")) keys.push("reviews.summary");
  if (s.includes("verified")) keys.push("reviews.verified");
  if (s.includes("trust") && s.includes("sizing")) keys.push("product.fit.sizing_trust");
  if (s.includes("complaints")) keys.push("reviews.common_complaints");
  if (s.includes("alternative") || s.includes("out of stock")) keys.push("product.alternatives.out_of_stock");

  // Promotions
  if (s.includes("discount") || s.includes("promotion")) keys.push("promo.current");

  return Array.from(new Set(keys));
}

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

async function main() {
  const args = parseArgs();
  console.log(`[apply_bank_to_customer] target domain: ${args.domain}, NEXT_PUBLIC_DEMO_DOMAIN=${process.env.NEXT_PUBLIC_DEMO_DOMAIN}`);

  const customer = await getCustomerByDomain(normalizeDomain(args.domain));

  const intentDomain = await prisma.intentDomain.findUnique({
    where: {
      industry_geo_language_persona: {
        industry: args.industry,
        geo: args.geo,
        language: args.language,
        persona: args.persona,
      },
    } as any,
  });

  if (!intentDomain) {
    throw new Error(`IntentDomain not found for ${args.industry}/${args.geo}/${args.language}/${args.persona}. Run discovery:bank first.`);
  }

  const bank = await prisma.questionBankEntry.findMany({
    where: { intentDomainId: intentDomain.id },
    orderBy: { weight: "desc" },
    take: Math.min(200, Math.max(1, args.top)),
  });

  const upserts: any[] = [];
  let created = 0;
  let updated = 0;

  for (const b of bank) {
    const existing = await prisma.question.findFirst({
      where: { customerId: customer.id, text: b.questionText },
      select: { id: true },
    });

    const impactScore = Math.max(35, Math.min(95, b.weight));

    if (!existing) {
      created += 1;
      upserts.push(
        prisma.question.create({
          data: {
            customerId: customer.id,
            taxonomy: b.taxonomy,
            text: b.questionText,
            impactScore,
            state: "UNANSWERED" as any,
            recommendedAssetType: "FAQ" as any,
          },
        })
      );
    } else {
      updated += 1;
      upserts.push(
        prisma.question.update({
          where: { id: existing.id },
          data: { taxonomy: b.taxonomy, impactScore },
        })
      );
    }
  }

  const results = await prisma.$transaction(upserts);

  // Now upsert needs for each question
  for (const q of results) {
    const claimKeys = inferClaimKeys(q.text);
    for (const ck of claimKeys) {
      await prisma.questionNeed.upsert({
        where: { questionId_claimKey: { questionId: q.id, claimKey: ck } } as any,
        update: { required: true },
        create: { questionId: q.id, claimKey: ck, required: true },
      });
    }
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "INTENT_ENGINE",
    summary: `Applied Question Bank to domain ${args.domain}.`,
    input: { industry: args.industry, geo: args.geo, top: args.top },
    output: { intentDomainId: intentDomain.id, bankCount: bank.length, created, updated },
  });

  console.log(`✅ Applied bank to ${args.domain}: ${bank.length} questions (created=${created}, updated=${updated})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});