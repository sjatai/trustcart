import type { AgentStep, GraphState, ReceiptRef } from "@/lib/agents/types";

function stepBase(agent: AgentStep["agent"]): AgentStep {
  return { agent, read: [], decide: [], do: [], receipts: [] };
}

function receipt(kind: string, summary: string, id?: string): ReceiptRef {
  return { kind, summary, id };
}

export async function runAnalyzer(state: GraphState): Promise<{ step: AgentStep; patch: Partial<GraphState> }> {
  const step = stepBase("AnalyzerAgent");
  step.read.push("Customer domain, seeded questions, latest trust score snapshot (demo).");
  step.decide.push("Identify what matters: top demand blockers + trust readiness.");
  step.do.push("Prepare a concise executive frame for the requested command.");

  return {
    step,
    patch: {
      debug: { analyzedAt: new Date().toISOString(), domain: state.customerDomain, command: state.command },
    },
  };
}
