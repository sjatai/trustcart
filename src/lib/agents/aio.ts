import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { env } from "@/lib/env";
import { ensureIntentQuestions } from "@/lib/intentGraph";
import { prisma } from "@/lib/db";
import { runSimulatedProbe } from "@/lib/probes";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runAIO(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("AIOAgent");
  step.read.push("Top questions, knowledge graph claims (if present), probe history (if present).");

  if (state.command === "probe" || state.command === "reprobe_delta") {
    step.decide.push("Run LLM probes (ChatGPT + Gemini) or simulated probes if keys missing.");
    step.do.push("Create a visibility score snapshot and store probe answers.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);

    const topQuestions = await prisma.question.findMany({
      where: { customerId: customer.id },
      orderBy: { impactScore: "desc" },
      take: 8,
    });
    const questions = topQuestions.map((q) => q.text);
    const mode = state.command === "reprobe_delta" ? "reprobe" : "baseline";

    // Deterministic fallback (demo-safe). If keys are present later, swap to real providers.
    const probe = await runSimulatedProbe({ customerId: customer.id, mode, questions });

    step.receipts.push(receipt("probe_run", `Probe run created (${mode}, simulated).`, probe.probeRunId));
    step.receipts.push(receipt("visibility_score", `AI Visibility score: ${probe.snapshot.total}/100.`, probe.snapshotId));

    await prisma.activityEvent.create({
      data: {
        customerId: customer.id,
        kind: "probe",
        summary: `Probe ${mode} completed (simulated). Total score ${probe.snapshot.total}/100.`,
        payload: { probeRunId: probe.probeRunId, snapshotId: probe.snapshotId },
      },
    });
  } else if (state.command === "intent_graph") {
    step.decide.push("Generate/update intent/question graph and node states.");
    step.do.push("Compute impact and missing-proof gaps per question.");
    const domain = state.customerDomain || env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com";
    const customer = await getOrCreateCustomerByDomain(domain);
    const qs = await ensureIntentQuestions(customer.id);
    step.receipts.push(receipt("intent_graph", `Intent graph updated with ${qs.length} questions.`, customer.id));
  } else {
    step.decide.push("No AIO actions required for this command.");
  }

  return { step, patch: {} };
}
