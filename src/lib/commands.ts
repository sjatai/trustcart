import type { DemoCommand } from "@/lib/agents/types";

export function parseDemoCommand(userMessage: string): DemoCommand {
  const msg = userMessage.toLowerCase();

  // Prefer delta/reprobe if user is explicitly asking for change-over-time.
  if (msg.includes("re-probe") || msg.includes("reprobe") || msg.includes("delta") || msg.includes("change since") || msg.includes("before/after")) {
    return "reprobe_delta";
  }

  if (msg.includes("onboard") || msg.includes("crawl")) return "onboard";
  // Probe/visibility intent should win over generic "top questions" phrasing.
  if (msg.includes("probe") || msg.includes("chatgpt") || msg.includes("gemini") || msg.includes("visibility score") || msg.includes("ai readiness"))
    return "probe";
  if (msg.includes("intent graph") || msg.includes("top questions") || msg.includes("clusters")) return "intent_graph";
  if (msg.includes("trust pack") || msg.includes("generate") && msg.includes("faq")) return "generate_trust_pack";
  if (msg.includes("approve") || msg.includes("publish")) return "approve_publish";
  if (msg.includes("campaign") || msg.includes("launch") || msg.includes("test-drive")) return "launch_campaign";
  if (msg.includes("summarize") || msg.includes("next 3")) return "summarize";

  // default to summarize for exec-friendliness
  return "summarize";
}
