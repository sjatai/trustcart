import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { env } from "@/lib/env";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { crawlDomain } from "@/lib/crawler";
import { buildClaimsFromCrawl } from "@/lib/knowledge";
import { prisma } from "@/lib/db";
import { approveAndPublishTopDrafts, generateTrustPackDrafts } from "@/lib/trustPack";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runKnowledge(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("KnowledgeAgent");
  step.read.push("Crawl corpus + extracted facts/claims (if present).");

  if (state.command === "onboard") {
    step.decide.push("Run domain-limited crawl and extract claims + evidence.");
    step.do.push("Persist CrawlRun, CrawlPages, Claims, Evidence; update audit ledger.");

    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    // Demo-friendly: keep onboarding fast and deterministic.
    const crawl = await crawlDomain({ customerId: customer.id, domain, maxPages: 8 });
    step.receipts.push(receipt("crawl_run", `Crawl ${crawl.status.toLowerCase()}: ${crawl.storedPages} pages (${crawl.failures} failures).`, crawl.crawlRunId));

    const kg = await buildClaimsFromCrawl({ customerId: customer.id, crawlRunId: crawl.crawlRunId });
    step.receipts.push(
      receipt(
        "knowledge_graph",
        crawl.status === "FAILED"
          ? `Crawl failed; deterministic baseline claims written for demo safety.`
          : `Claims built with evidence. Phones: ${kg.phonesFound}, hours lines: ${kg.hoursLinesFound}.`
      )
    );

    await prisma.activityEvent.create({
      data: {
        customerId: customer.id,
        kind: "onboard",
        summary: `Onboard completed for ${domain} (crawl ${crawl.status.toLowerCase()}, ${crawl.storedPages} pages).`,
        payload: { crawl },
      },
    });
  } else if (state.command === "generate_trust_pack" || state.command === "approve_publish") {
    step.decide.push("Generate Trust Pack assets (FAQ/blog/truth blocks) from gaps and claims; route for approval.");
    step.do.push("Create draft assets; on approval publish to /site routes.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    if (state.command === "generate_trust_pack") {
      const drafts = await generateTrustPackDrafts(customer.id);
      step.receipts.push(receipt("assets", `Trust Pack drafts created: ${drafts.length}. Approval required.`));
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "trust_pack_draft",
          summary: `Generated ${drafts.length} Trust Pack drafts (approval required).`,
          payload: { drafts },
        },
      });
    } else {
      const pub = await approveAndPublishTopDrafts(customer.id);
      step.receipts.push(receipt("assets", `Published ${pub.count} assets to /site.`, pub.publishedAssetIds[0]));
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "trust_pack_publish",
          summary: `Approved and published ${pub.count} Trust Pack assets.`,
          payload: pub,
        },
      });
    }
  } else {
    step.decide.push("No Knowledge actions required for this command.");
  }

  return { step, patch: {} };
}
