import { StateGraph, END } from "@langchain/langgraph";
import type { AgentName, AgentStep, DemoCommand, GraphState } from "@/lib/agents/types";
import { runAnalyzer } from "@/lib/agents/analyzer";
import { runAIO } from "@/lib/agents/aio";
import { runKnowledge } from "@/lib/agents/knowledge";
import { runTrust } from "@/lib/agents/trust";
import { runGrowth } from "@/lib/agents/growth";
import { runReporter } from "@/lib/agents/reporter";
import { Overlays } from "@/lib/overlays";
import { env } from "@/lib/env";
import { getCustomerByDomain } from "@/lib/domain";
import { writeReceipt } from "@/lib/receipts";
import { attachDebug, type TrustEyeDebug } from "@/lib/debug";
import { generateContentRecommendations } from "@/lib/recommendations";
import { prisma } from "@/lib/db";
import { generateBlogDraft, generateFaqOrTruthDraft, generateProductUpdateDraft, renderProductUpdateToBodyMd } from "@/lib/contentEngine";
import { upsertDraftAssetFromBlog, upsertDraftAssetFromFaqOrTruth } from "@/lib/contentEnginePersist";

/**
 * TrustEye LangGraph orchestrator.
 * Requirements:
 * - DB persistence via Prisma for every flow
 * - Canonical Receipt rows for audit
 * - No simulated providers / fake fallback data
 */

function addStep(state: GraphState, step: any): GraphState {
  return { ...state, steps: [...(state.steps || []), step] };
}

function stepBase(agent: AgentName): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

type ContentStatusCommand = "draft_content" | "approve_content" | "publish_content";

function isContentStatusCommand(command: GraphState["command"]): command is ContentStatusCommand {
  return command === "draft_content" || command === "approve_content" || command === "publish_content";
}

function extractRecommendationId(text: string): string | null {
  const matcher = text.match(/(?:content|recommendation)\s+([a-z0-9]{20,32})/i);
  if (matcher?.[1]) {
    return matcher[1];
  }
  const fallback = text.match(/\b([a-z0-9]{20,32})\b/i);
  return fallback?.[1] ?? null;
}

function extractApprover(text: string): string | null {
  const quoteMatch = text.match(/by\s+"([^"]+)"/i);
  if (quoteMatch?.[1]) return quoteMatch[1].trim();
  const fallbackMatch = text.match(/by\s+([A-Za-z0-9 ]+)/i);
  if (fallbackMatch?.[1]) return fallbackMatch[1].trim();
  return null;
}

type ContentRecommendationStatus = "PROPOSED" | "DRAFTED" | "APPROVED" | "PUBLISHED";

const statusByCommand: Record<ContentStatusCommand, ContentRecommendationStatus> = {
  draft_content: "DRAFTED",
  approve_content: "APPROVED",
  publish_content: "PUBLISHED",
};

function receiptContext(state: GraphState): { domainUsed: string; command: DemoCommand; sessionId: string | null } {
  return {
    domainUsed: state.customerDomain,
    command: state.command,
    sessionId: state.sessionId ?? null,
  };
}

async function handleRecommendContent(
  state: GraphState,
  customer: Awaited<ReturnType<typeof getOrCreateCustomerByDomain>>
): Promise<GraphState> {
  const domain = state.customerDomain || customer.domain;
  const recommendations = await generateContentRecommendations(domain);
  if (!recommendations.length) {
    throw new Error("Unable to generate content recommendations.");
  }

  await writeReceipt({
    customerId: customer.id,
    sessionId: state.sessionId ?? undefined,
    kind: "DECIDE",
    actor: "CONTENT_ENGINE",
    summary: `Generated ${recommendations.length} content recommendations.`,
    input: { ...receiptContext(state), domainUsed: domain },
    output: {
      recommendationIds: recommendations.map((r) => r.id),
      count: recommendations.length,
    },
  });

  const step = stepBase("ContentRecommendationAgent");
  step.read.push("LLM questions + claims + crawl evidence");
  step.decide.push("Recommend ENRICH vs CREATE actions");
  step.do.push("Persist ContentRecommendation rows");
  step.receipts.push({ kind: "DECIDE", summary: "Content recommendations stored", id: recommendations[0]?.id });

  const assistantMessage = `Created ${recommendations.length} content recommendations (ids: ${recommendations
    .map((r) => r.id)
    .join(", ")}).`;

  return {
    customerDomain: state.customerDomain,
    command: state.command,
    userMessage: state.userMessage,
    overlays: [],
    steps: [step],
    assistantMessage,
    debug: {
      lastSuccessfulStep: "recommendations.created",
    },
  };
}

async function handleContentStatusCommand(
  state: GraphState,
  customer: Awaited<ReturnType<typeof getOrCreateCustomerByDomain>>
): Promise<GraphState> {
  const domain = state.customerDomain || customer.domain;
  const id = extractRecommendationId(state.userMessage);
  if (!id) {
    throw new Error("command requires a ContentRecommendation ID");
  }

  const recommendation = await prisma.contentRecommendation.findUnique({ where: { id } });
  if (!recommendation) {
    throw new Error(`ContentRecommendation ${id} not found`);
  }
  if (recommendation.customerId !== customer.id) {
    throw new Error("ContentRecommendation does not belong to the requested customer");
  }

  if (!isContentStatusCommand(state.command)) {
    throw new Error("unsupported command");
  }

  const targetStatus = statusByCommand[state.command];
  const approver = extractApprover(state.userMessage);
  // Special case: draft_content generates a JSON-validated Content Engine draft and saves it as an Asset draft.
  if (state.command === "draft_content") {
    const questionText = recommendation.questionText || "";
    const deltaType: "SITE_MISSING" | "LLM_WEAK" | "BOTH" = "BOTH";

    if (String(recommendation.kind) === "PRODUCT_UPDATE") {
      const productSlugOrName = recommendation.productTitle || recommendation.productHandle || "product";
      const out = await generateProductUpdateDraft({
        domain,
        productSlugOrName,
        questionText: questionText || "NEEDS_VERIFICATION: missing question text",
        targetUrl: recommendation.targetUrl || `/site/products/${recommendation.productHandle || ""}`,
      });
      const bodyMd = renderProductUpdateToBodyMd(out);
      await prisma.contentRecommendation.update({
        where: { id },
        data: {
          status: targetStatus,
          suggestedContent: bodyMd,
          llmEvidence: { ...(recommendation.llmEvidence as any), contentEngine: out } as any,
        },
      });
    } else if (String(recommendation.recommendedAssetType || "").toUpperCase() === "BLOG") {
      const out = await generateBlogDraft({
        domain,
        questionText: questionText || recommendation.title || "NEEDS_VERIFICATION: missing question text",
        targetUrl: recommendation.targetUrl || "/site/blog",
      });
      await upsertDraftAssetFromBlog({
        customerId: customer.id,
        questionId: recommendation.questionId,
        title: out.title,
        contentEngineJson: out,
      });
      await prisma.contentRecommendation.update({
        where: { id },
        data: {
          status: targetStatus,
          suggestedContent: out.draftMarkdown,
          llmEvidence: { ...(recommendation.llmEvidence as any), contentEngine: out } as any,
        },
      });
    } else {
      const out = await generateFaqOrTruthDraft({
        domain,
        questionText: questionText || recommendation.title || "NEEDS_VERIFICATION: missing question text",
        deltaType,
        targetUrl: recommendation.targetUrl || "/site/faq",
      });
      await upsertDraftAssetFromFaqOrTruth({
        customerId: customer.id,
        questionId: recommendation.questionId,
        assetType: out.assetType,
        title: out.title,
        contentEngineJson: out,
      });
      await prisma.contentRecommendation.update({
        where: { id },
        data: {
          status: targetStatus,
          suggestedContent: out.draft.shortAnswer,
          llmEvidence: { ...(recommendation.llmEvidence as any), contentEngine: out } as any,
        },
      });
    }
  } else {
    await prisma.contentRecommendation.update({
      where: { id },
      data: { status: targetStatus },
    });
  }

  const summary = `Content recommendation ${id} marked ${targetStatus}${approver ? ` by ${approver}` : ""}.`;

  const ctx = receiptContext(state);
  await writeReceipt({
    customerId: customer.id,
    sessionId: ctx.sessionId || undefined,
    kind: "DECIDE",
    actor: "CONTENT_ENGINE",
    summary,
    input: { ...ctx, recommendationId: id, approver },
    output: { status: targetStatus },
  });

  const step = stepBase("ContentRecommendationAgent");
  step.read.push("Existing ContentRecommendation record");
  step.decide.push(`Transition recommendation ${id} → ${targetStatus}`);
  step.do.push("Update ContentRecommendation status");
  step.receipts.push({ kind: "DECIDE", summary, id });

  return {
    customerDomain: state.customerDomain,
    command: state.command,
    userMessage: state.userMessage,
    overlays: [],
    steps: [step],
    assistantMessage: `Updated recommendation ${id} → ${targetStatus}.`,
    debug: {
      lastSuccessfulStep: "recommendation.status.updated",
    },
  };
}

export function buildTrustEyeGraph() {
  const graph = new StateGraph<GraphState>({
    channels: {
      customerDomain: null,
      command: null,
      userMessage: null,
      overlays: null,
      steps: null,
      assistantMessage: null,
      debug: null,
    } as any,
  });

  graph.addNode("Analyzer", async (state) => {
    const { step, patch } = await runAnalyzer(state);
    return addStep({ ...state, ...patch }, step);
  });

  graph.addNode("AIO", async (state) => {
    const { step, patch } = await runAIO(state);
    return addStep({ ...state, ...patch }, step);
  });

  graph.addNode("Knowledge", async (state) => {
    const { step, patch } = await runKnowledge(state);
    return addStep({ ...state, ...patch }, step);
  });

  graph.addNode("Trust", async (state) => {
    const { step, patch } = await runTrust(state);
    return addStep({ ...state, ...patch }, step);
  });

  graph.addNode("Growth", async (state) => {
    const { step, patch } = await runGrowth(state);
    return addStep({ ...state, ...patch }, step);
  });

  graph.addNode("Reporter", async (state) => {
    const { step, patch } = await runReporter(state);

    // Overlay cues tied to command
    const overlays =
      state.command === "onboard"
        ? [Overlays.authority()]
        : state.command === "intent_graph"
        ? [Overlays.demandAnswers()]
        : state.command === "probe"
        ? [Overlays.testAI()]
        : state.command === "generate_trust_pack" || state.command === "approve_publish"
        ? [Overlays.publishAnswers()]
        : state.command === "reprobe_delta"
        ? [Overlays.measurable()]
        : state.command === "launch_campaign"
        ? [Overlays.gated(), Overlays.birdeyeSOR()]
        : [Overlays.birdeyeSOR()];

    // Preserve upstream execution context from earlier agents by prefixing it
    // to the Reporter executive summary. Reporter owns the final message but shouldn't
    // erase important context (e.g., config errors, gating decisions).
    const upstream = (state.assistantMessage || "").trim();
    const reporterMsg = (patch.assistantMessage || "").trim();
    const assistantMessage = upstream ? `${upstream}\n\n${reporterMsg}` : reporterMsg;

    return addStep({ ...state, ...patch, assistantMessage, overlays }, step);
  });

  // simple linear flow for demo
  // NOTE: LangGraph's TS types can be overly strict when using dynamic channels;
  // cast for wiring to keep the demo build clean.
  const g = graph as any;
  g.setEntryPoint("Analyzer");
  g.addEdge("Analyzer", "AIO");
  g.addEdge("AIO", "Knowledge");
  g.addEdge("Knowledge", "Trust");
  g.addEdge("Trust", "Growth");
  g.addEdge("Growth", "Reporter");
  g.addEdge("Reporter", END);

  return graph.compile();
}



export async function runTrustEye(state: GraphState): Promise<GraphState> {
  console.log("[TrustEye] domain:", state.customerDomain);
  const debug: TrustEyeDebug = {};

  // Canonical orchestration receipts (audit trail).
  const domain = String(state.customerDomain || "").trim();
  if (!domain) throw new Error("missing_customerDomain");
  const customer = await getCustomerByDomain(domain);

  try {
    debug.lastSuccessfulStep = "orchestrator.received";

    const ctx = receiptContext(state);

    // Ensure session exists if a sessionId is provided; otherwise receipts that include sessionId
    // can violate the Receipt_sessionId_fkey constraint.
    if (ctx.sessionId) {
      await prisma.session.upsert({
        where: { id: ctx.sessionId },
        update: {},
        create: { id: ctx.sessionId, customerId: customer.id },
      });
    }

    const r0 = await writeReceipt({
      customerId: customer.id,
      sessionId: ctx.sessionId || undefined,
      kind: "READ",
      actor: "ORCHESTRATOR",
      summary: "Orchestrator received command",
      input: { ...ctx, userMessage: state.userMessage },
    });
    debug.lastReceiptId = r0?.id;

    if (state.command === "recommend_content") {
      return handleRecommendContent(state, customer);
    }

    if (isContentStatusCommand(state.command)) {
      return handleContentStatusCommand(state, customer);
    }

    const app = buildTrustEyeGraph();
    debug.lastSuccessfulStep = "graph.invoke.started";

    const out = (await app.invoke(state)) as GraphState;

    debug.lastSuccessfulStep = "graph.invoke.completed";

    const r1 = await writeReceipt({
      customerId: customer.id,
      sessionId: ctx.sessionId || undefined,
      kind: "DECIDE",
      actor: "ORCHESTRATOR",
      summary: "Orchestrator completed run",
      input: { ...ctx, overlays: out?.overlays?.map((o: any) => o?.id || o?.kind || "overlay") },
      output: { command: state.command },
    });
    debug.lastReceiptId = r1?.id;

    // Ensure a consistent debug object is returned upstream
    return {
      ...out,
      debug: {
        ...(out as any)?.debug,
        ...debug,
      },
    } as GraphState;
  } catch (err) {
    // Best-effort: infer agent name from known error shapes / messages
    debug.failedAgent =
      (err as any)?.agent ??
      (err as any)?.actor ??
      (err as any)?.failedAgent ??
      (err as any)?.name ??
      undefined;

    debug.errorStage = debug.lastSuccessfulStep || "unknown";

    // Optional: write a failure receipt without masking original error
    try {
      const ctxFail = receiptContext(state);
      const rFail = await writeReceipt({
        customerId: customer.id,
        sessionId: ctxFail.sessionId || undefined,
        kind: "SUPPRESS",
        actor: "ORCHESTRATOR",
        summary: `Run failed at ${debug.errorStage}${debug.failedAgent ? ` (agent: ${debug.failedAgent})` : ""}`,
        input: { ...ctxFail, userMessage: state.userMessage },
        output: { error: err instanceof Error ? err.message : String(err) },
      });
      debug.lastReceiptId = rFail?.id;
    } catch {
      // ignore
    }

    throw attachDebug(err, debug);
  }
}