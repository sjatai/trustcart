import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { env } from "@/lib/env";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { crawlDomain } from "@/lib/crawler";
import { buildClaimsFromCrawl } from "@/lib/knowledge";
import { prisma } from "@/lib/db";
import { approveAndPublishVerifiedAnswers, generateVerifiedAnswerDrafts } from "@/lib/trustPack";
import { writeReceipt } from "@/lib/receipts";
import type { WriteReceiptInput } from "@/lib/receipts";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runKnowledge(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("KnowledgeAgent");
  const sessionId = (state as any).sessionId as string | undefined;
  step.read.push("Crawl corpus + extracted facts/claims (if present).");

  if (state.command === "onboard") {
    step.decide.push("Run domain-limited crawl and extract claims + evidence.");
    step.do.push("Persist CrawlRun, CrawlPages, Claims, Evidence; update audit ledger.");

    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    // Demo-friendly: keep onboarding fast and deterministic.
    const crawl = await crawlDomain({ customerId: customer.id, domain, maxPages: 8 });
    step.receipts.push(receipt("crawl_run", `Crawl ${crawl.status.toLowerCase()}: ${crawl.storedPages} pages (${crawl.failures} failures).`, crawl.crawlRunId));

    const kg = await buildClaimsFromCrawl({ customerId: customer.id, crawlRunId: crawl.crawlRunId, sessionId: (state as any).sessionId });
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
    step.decide.push("Generate Verified Answers (FAQ/blog/blocks) from gaps + claims, attach evidence, and route for approval.");
    step.do.push("Create drafts; on approval publish to /site routes with consumer trust cues (proof + freshness).");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    if (state.command === "generate_trust_pack") {
      const drafts = await generateVerifiedAnswerDrafts(customer.id);
      await writeReceipt({
        customerId: customer.id,
        sessionId,
        kind: "DECIDE",
        actor: "CONTENT_ENGINE",
        summary: "Verified Answer drafts generated",
        input: { domain: customer.domain, command: state.command },
        output: { draftsCount: drafts.length },
      } satisfies WriteReceiptInput);
      step.receipts.push(receipt("verified_answers", `Verified Answer drafts created: ${drafts.length}. Approval required.`));
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "verified_answers_draft",
          summary: `Generated ${drafts.length} Verified Answer drafts (approval required).`,
          payload: { drafts },
        },
      });
    } else {
      const pub = await approveAndPublishVerifiedAnswers(customer.id);
      await writeReceipt({
        customerId: customer.id,
        sessionId,
        kind: "PUBLISH",
        actor: "CONTENT_ENGINE",
        summary: "Verified Answers published",
        input: { domain: customer.domain, command: state.command },
        output: {
          count: pub.count,
          publishedAssetIds: pub.publishedAssetIds,
          publishedSlugs: pub.publishedSlugs,
        },
      } satisfies WriteReceiptInput);
      step.receipts.push(receipt("verified_answers", `Published ${pub.count} verified answers to /site.`, pub.publishedAssetIds[0]));
      await prisma.activityEvent.create({
        data: {
          customerId: customer.id,
          kind: "verified_answers_publish",
          summary: `Approved and published ${pub.count} verified answers.`,
          payload: pub,
        },
      });
    }
  } else {
    step.decide.push("No Knowledge actions required for this command.");
  }

  return { step, patch: {} };
}
