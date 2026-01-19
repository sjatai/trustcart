import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { env } from "@/lib/env";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { crawlDomain } from "@/lib/crawler";
import { buildClaimsFromCrawl, buildClaimsFromStore } from "@/lib/knowledge";
import { prisma } from "@/lib/db";
import type { Asset, AssetVersion } from "@prisma/client";
import { approveAndPublishTopDrafts, generateTrustPackDrafts } from "@/lib/trustPack";
import { writeReceipt } from "@/lib/receipts";

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function getEnvAny(key: string): string | undefined {
  // Prefer typed env helper if present, but fall back to process.env.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e: any = env as any;
  return (e?.[key] as string | undefined) || process.env[key];
}

async function postSlack(customerId: string, text: string, extra?: Record<string, unknown>) {
  const url = getEnvAny("SLACK_WEBHOOK_URL");
  if (!url) {
    await writeReceipt({
      customerId,
      kind: "DECIDE",
      actor: "ORCHESTRATOR",
      summary: "Slack webhook not configured; skipping notification",
      input: { text },
    });
    return;
  }

  const payload = {
    text,
    ...(extra ? { attachments: [{ color: "#2eb67d", fields: Object.entries(extra).map(([title, value]) => ({ title, value: String(value), short: true })) }] } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  await writeReceipt({
    customerId,
    kind: res.ok ? "EXECUTE" : "SUPPRESS",
    actor: "DELIVERY",
    summary: res.ok ? "Slack notification delivered" : "Slack notification failed",
    input: { text },
    output: { status: res.status },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }
}

async function publishAssetsToCMS(args: {
  customerId: string;
  customerDomain: string;
  assetIds: string[];
}): Promise<{ published: number; externalUrls: string[] }>
{
  const provider = (getEnvAny("CMS_PROVIDER") || "").toLowerCase();
  if (!provider) {
    await writeReceipt({
      customerId: args.customerId,
      kind: "DECIDE",
      actor: "CONTENT_ENGINE",
      summary: "CMS publish skipped (CMS_PROVIDER not set).",
      input: { assetIds: args.assetIds },
    });
    return { published: 0, externalUrls: [] };
  }

  if (provider !== "webhook") {
    await writeReceipt({
      customerId: args.customerId,
      kind: "SUPPRESS",
      actor: "CONTENT_ENGINE",
      summary: `CMS publish skipped (unsupported provider: ${provider}). Use CMS_PROVIDER=webhook.`,
      input: { provider },
    });
    return { published: 0, externalUrls: [] };
  }

  const webhookUrl = getEnvAny("CMS_WEBHOOK_URL");
  if (!webhookUrl) {
    throw new Error("CMS_PROVIDER is set to webhook but CMS_WEBHOOK_URL is missing.");
  }

  // Fetch latest version content for each asset.
  const assets = await prisma.asset.findMany({
    where: { id: { in: args.assetIds } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const externalUrls: string[] = [];
  let published = 0;

  for (const a of assets as (Asset & { versions: AssetVersion[] })[]) {
    const v = a.versions?.[0];
    const payload = {
      customerDomain: args.customerDomain,
      assetId: a.id,
      type: a.type,
      title: a.title,
      slug: a.slug,
      status: a.status,
      content: v?.content || "",
      meta: a.meta || {},
      publishedAt: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text().catch(() => "");
    let externalUrl: string | undefined;
    try {
      const parsed = JSON.parse(bodyText);
      externalUrl = parsed?.externalUrl || parsed?.url;
    } catch {
      // ignore
    }

    await writeReceipt({
      customerId: args.customerId,
      kind: res.ok ? "PUBLISH" : "SUPPRESS",
      actor: "CONTENT_ENGINE",
      summary: res.ok ? "Published asset to external CMS" : "External CMS publish failed",
      input: { provider, webhookUrl, assetId: a.id, slug: a.slug },
      output: { status: res.status, externalUrl: externalUrl || null },
    });

    if (res.ok) {
      published += 1;
      if (externalUrl) externalUrls.push(externalUrl);
    } else {
      throw new Error(`External CMS publish failed for asset ${a.id}: ${res.status} ${bodyText}`);
    }
  }

  return { published, externalUrls };
}

export async function runKnowledge(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("KnowledgeAgent");
  step.read.push("Crawl corpus + extracted facts/claims (if present).");

  if (state.command === "onboard") {
    step.decide.push("Run domain-limited crawl and extract claims + evidence.");
    step.do.push("Persist CrawlRun, CrawlPages, Claims, Evidence; update audit ledger.");

    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnystep.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    // Allow "shadow customers" for demo/testing that still crawl the real public site.
    // Example: reliablenissan.com-test -> crawl reliablenissan.com
    const crawlHost = domain.endsWith("-test") ? domain.replace(/-test$/, "") : domain;

    // sunnystep.com is Cloudflare-protected; server-side crawl returns “Just a moment…”.
    // For the demo, we treat the DB-seeded store content as the “discovered” source of truth.
    if (domain === "sunnystep.com") {
      step.decide.push("Build claims from DB-seeded store FAQs/products (Cloudflare-safe).");
      step.do.push("Persist Claims + Evidence from seeded store content; attach claimId to QuestionNeed rows.");

      const kg = await buildClaimsFromStore({ customerId: customer.id });
      step.receipts.push(receipt("knowledge_graph", `Claims built from seeded store content (${kg.createdClaimIds.length}).`));

      await writeReceipt({
        customerId: customer.id,
        kind: "DECIDE",
        actor: "CONTENT_ENGINE",
        summary: "Claims extracted from store seed",
        input: { domain },
        output: { createdClaims: kg.createdClaimIds.length },
      });
    } else {
      // Default onboarding: crawl the public site and build claims from evidence.
      const maxPages = 12;
      const crawl = await crawlDomain({ customerId: customer.id, domain: crawlHost, maxPages });
      if (crawl.status !== "COMPLETED") {
        throw new Error(
          `Crawl failed. status=${crawl.status}, storedPages=${crawl.storedPages}. Ensure outbound internet access and that ${crawlHost} is reachable.`
        );
      }
      if (crawl.storedPages < 10) {
        step.decide.push(`Crawl completed but only ${crawl.storedPages} page(s) stored — proceeding with partial evidence.`);
        await writeReceipt({
          customerId: customer.id,
          kind: "SUPPRESS",
          actor: "CRAWLER",
          summary: "Crawl below target depth; proceeding with partial evidence",
          input: { domain, crawlHost },
          output: { crawlRunId: crawl.crawlRunId, storedPages: crawl.storedPages, failures: crawl.failures },
        });
      }
      step.receipts.push(
        receipt("crawl_run", `Crawl ${crawl.status.toLowerCase()}: ${crawl.storedPages} pages (${crawl.failures} failures).`, crawl.crawlRunId)
      );

      const kg = await buildClaimsFromCrawl({ customerId: customer.id, crawlRunId: crawl.crawlRunId });
      step.receipts.push(
        receipt("knowledge_graph", `Claims built with evidence. Phones: ${kg.phonesFound}, hours lines: ${kg.hoursLinesFound}.`)
      );

      await writeReceipt({
        customerId: customer.id,
        kind: "DECIDE",
        actor: "CONTENT_ENGINE",
        summary: "Claims extracted from crawl",
        input: { crawlRunId: crawl.crawlRunId, domain },
        output: { createdClaims: kg.createdClaimIds.length, phonesFound: kg.phonesFound, hoursLinesFound: kg.hoursLinesFound, emailsFound: kg.emailsFound },
      });

      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "onboard",
          summary: `Onboard completed for ${domain} (crawl ${crawl.status.toLowerCase()}, ${crawl.storedPages} pages).`,
          payload: { crawl },
        },
      });

      await postSlack(
        customer.id,
        `TrustEye onboard complete for ${domain} — crawled ${crawl.storedPages} pages, extracted claims with evidence.`,
        { domain, pages: crawl.storedPages, failures: crawl.failures, crawlRunId: crawl.crawlRunId }
      );
    }

    await prisma.activityEvent.create({
      data: {
        customerId: customer.id,
        kind: "onboard",
        summary: `Onboard completed for ${domain} (seed-based knowledge extraction).`,
        payload: { mode: domain === "sunnystep.com" ? "seed" : "crawl" },
      },
    });

    await postSlack(customer.id, `TrustEye onboard complete for ${domain} — knowledge extracted.`, { domain });
  } else if (state.command === "generate_trust_pack" || state.command === "approve_publish") {
    step.decide.push("Generate Trust Assets (FAQ/blog/truth blocks) from gaps and claims; route for approval.");
    step.do.push("Create draft assets; on approval publish to /site routes.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "sunnystep.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    if (state.command === "generate_trust_pack") {
      const drafts = await generateTrustPackDrafts(customer.id);
      step.receipts.push(receipt("assets", `Draft content assets created: ${drafts.length}. Approval required.`));
      await writeReceipt({
        customerId: customer.id,
        kind: "EXECUTE",
        actor: "CONTENT_ENGINE",
        summary: "Draft content assets generated",
        output: { count: drafts.length, assetIds: drafts.map((d) => d.id) },
      });
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "trust_pack_draft",
          summary: `Generated ${drafts.length} draft content assets (approval required).`,
          payload: { drafts },
        },
      });

      await postSlack(
        customer.id,
        `Draft content assets ready for approval — ${drafts.length} items for ${domain}.`,
        { domain, drafts: drafts.length }
      );
    } else {
      const pub = await approveAndPublishTopDrafts(customer.id);
      step.receipts.push(receipt("assets", `Published ${pub.count} assets to /site (customer-facing).`, pub.publishedAssetIds[0]));
      await writeReceipt({
        customerId: customer.id,
        kind: "PUBLISH",
        actor: "CONTENT_ENGINE",
        summary: "Assets approved and published",
        output: { count: pub.count, publishedAssetIds: pub.publishedAssetIds },
      });
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "trust_pack_publish",
          summary: `Approved and published ${pub.count} content assets.`,
          payload: pub,
        },
      });

      // Optional: publish the same assets to the customer’s external CMS via a connector (webhook provider).
      const cms = await publishAssetsToCMS({
        customerId: customer.id,
        customerDomain: domain,
        assetIds: pub.publishedAssetIds,
      });

      await postSlack(
        customer.id,
        `Published ${pub.count} content assets for ${domain}. External CMS published: ${cms.published}.`,
        { domain, publishedToSite: pub.count, publishedToCMS: cms.published, externalUrls: cms.externalUrls.slice(0, 3).join(" | ") }
      );
    }
  } else {
    step.decide.push("No Knowledge actions required for this command.");
  }

  return { step, patch: {} };
}
