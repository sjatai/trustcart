import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { env } from "@/lib/env";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { prisma } from "@/lib/db";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runReporter(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("Reporter");
  step.read.push("All agent steps + receipts generated in this run.");
  step.decide.push("Compose a single executive answer with next actions.");
  step.do.push("Return assistant message and overlay cues.");

  const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
  const customer = await getOrCreateCustomerByDomain(domain);

  const [
    crawlRun,
    claimCount,
    topQuestions,
    latestVisibility,
    lastTwoVisibility,
    assets,
    trust,
    campaigns,
    activityCount,
  ] = await Promise.all([
    prisma.crawlRun.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }),
    prisma.claim.count({ where: { customerId: customer.id } }),
    prisma.question.findMany({ where: { customerId: customer.id }, orderBy: { impactScore: "desc" }, take: 3 }),
    prisma.visibilityScoreSnapshot.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }),
    prisma.visibilityScoreSnapshot.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 2 }),
    prisma.asset.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.trustScoreSnapshot.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.activityEvent.count({ where: { customerId: customer.id } }),
  ]);

  const [currentVis, prevVis] = lastTwoVisibility;
  const visDelta = currentVis && prevVis ? currentVis.total - prevVis.total : null;

  const draftAssets = assets.filter((a) => a.status === "DRAFT").length;
  const publishedAssets = assets.filter((a) => a.status === "PUBLISHED").length;

  const topQ = topQuestions.map((q) => `- ${q.text} (${q.impactScore}/100)`).join("\n") || "- (none yet)";

  const assistantMessage =
    state.command === "onboard"
      ? `Onboard complete for ${domain}.\n\nWhat happened:\n- Crawl: ${crawlRun?.status || "—"} (max ${crawlRun?.maxPages ?? "—"} pages)\n- Knowledge: ${claimCount} claims with evidence links\n\nNext:\n- “Generate intent graph for Reliable Nissan (top 20)”\n- “Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score.”`
      : state.command === "intent_graph"
      ? `Intent graph updated for ${domain}.\n\nTop demand blockers:\n${topQ}\n\nNext:\n- “Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score.”`
      : state.command === "probe"
      ? `Probes complete (${latestVisibility ? "snapshot stored" : "no snapshot"}).\n\nAI Visibility:\n- Total: ${latestVisibility?.total ?? "—"}/100\n- Coverage: ${latestVisibility?.coverage ?? "—"} • Specificity: ${latestVisibility?.specificity ?? "—"} • Proof: ${latestVisibility?.proof ?? "—"} • Freshness: ${latestVisibility?.freshness ?? "—"}\n\nNext:\n- “Generate Trust Pack for top 5 gaps and route for approval.”`
      : state.command === "generate_trust_pack"
      ? `Trust Pack drafts generated.\n\nStatus:\n- Draft assets: ${draftAssets}\n- Published assets: ${publishedAssets}\n\nNext:\n- “Approve and publish the top 2 assets.”`
      : state.command === "approve_publish"
      ? `Assets approved and published.\n\nWhat changed:\n- Published assets: ${publishedAssets}\n- Site: /site/faq and /site/blog now render published Trust Pack content\n\nNext:\n- “Re-run probes. Show before/after delta.”`
      : state.command === "reprobe_delta"
      ? `Re-probe complete.\n\nAI Visibility:\n- Current total: ${currentVis?.total ?? "—"}/100\n- Previous total: ${prevVis?.total ?? "—"}/100\n- Delta: ${visDelta !== null ? (visDelta >= 0 ? "+" : "") + visDelta : "—"}\n\nNext:\n- “Launch a test-drive campaign; only if safe. Dry-run if needed.”`
      : state.command === "launch_campaign"
      ? `Growth execution complete (trust-gated).\n\nCampaign:\n- Latest: ${campaigns?.[0]?.name || "—"} (${campaigns?.[0]?.dryRun ? "dry-run" : "send"})\n- Segment size: ${campaigns?.[0]?.segmentSize ?? "—"} • Suppressed: ${campaigns?.[0]?.suppressedSize ?? "—"}\n- Requires approval: ${campaigns?.[0]?.requiresApproval ? "yes" : "no"}\n\nTrust:\n- Trust score: ${trust?.total ?? "—"}/100\n\nNext:\n- If approval is required: click Approve, then Execute safe segment.\n- “Summarize outcomes and next 3 highest ROI moves.”`
      : `Summary for ${domain}\n\nWhat we did:\n- Verified facts (claims): ${claimCount}\n- Demand blockers (intent graph): 20 questions (generated if missing)\n- AI visibility measured: ${latestVisibility?.total ?? "—"}/100\n- Trust gating enforced: trust score ${trust?.total ?? "—"}/100\n- Audit ledger entries: ${activityCount}\n\nNext 3 highest ROI moves:\n1) Close top 5 unanswered questions with approved Trust Pack assets\n2) Re-probe and track score delta week-over-week\n3) Run trust-gated campaigns in dry-run first, then send when safe`;

  return { step, patch: { assistantMessage } };
}
