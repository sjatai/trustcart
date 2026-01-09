import type { DemoCommand } from "@/lib/agents/types";

export function parseDemoCommand(userMessage: string): DemoCommand {
  const msg = userMessage.toLowerCase();

  if (msg.includes("onboard") || msg.includes("crawl")) return "onboard";
  if (msg.includes("intent graph") || msg.includes("intent")) return "intent_graph";
  if (msg.includes("probe") || msg.includes("chatgpt") || msg.includes("gemini")) return "probe";
  if (msg.includes("trust pack") || msg.includes("generate") && msg.includes("faq")) return "generate_trust_pack";
  if (msg.includes("approve") || msg.includes("publish")) return "approve_publish";
  if (msg.includes("re-probe") || msg.includes("delta") || msg.includes("before/after")) return "reprobe_delta";
  if (msg.includes("campaign") || msg.includes("launch") || msg.includes("test-drive")) return "launch_campaign";
  if (msg.includes("summarize") || msg.includes("next 3")) return "summarize";

  // default to summarize for exec-friendliness
  return "summarize";
}
