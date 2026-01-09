import { StateGraph, END } from "@langchain/langgraph";
import type { GraphState } from "@/lib/agents/types";
import { runAnalyzer } from "@/lib/agents/analyzer";
import { runAIO } from "@/lib/agents/aio";
import { runKnowledge } from "@/lib/agents/knowledge";
import { runTrust } from "@/lib/agents/trust";
import { runGrowth } from "@/lib/agents/growth";
import { runReporter } from "@/lib/agents/reporter";
import { Overlays } from "@/lib/overlays";

/**
 * Minimal, demo-safe LangGraph.
 * - Deterministic stubs now
 * - Later: replace agent internals with DB/crawler/probe/campaign implementations
 */

function addStep(state: GraphState, step: any): GraphState {
  return { ...state, steps: [...(state.steps || []), step] };
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

    // Preserve upstream deterministic notes (e.g., SIMULATED probe mode) by prefixing them
    // to the Reporter executive summary. Reporter owns the final message but shouldn't
    // erase important execution context from earlier agents.
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

export async function runTrustEye(state: GraphState) {
  const app = buildTrustEyeGraph();
  return app.invoke(state);
}
