export type DemoCommand =
  | "onboard"
  | "intent_graph"
  | "probe"
  | "generate_trust_pack"
  | "approve_publish"
  | "reprobe_delta"
  | "launch_campaign"
  | "summarize";

export type AgentName =
  | "AnalyzerAgent"
  | "AIOAgent"
  | "KnowledgeAgent"
  | "TrustAgent"
  | "GrowthAgent"
  | "Reporter";

export type OverlayCue = {
  id: string;
  text: string;
};

export type ReceiptRef = {
  kind: string; // e.g. "crawl_run", "asset_published", "campaign_executed"
  id?: string;
  summary: string;
};

export type AgentStep = {
  agent: AgentName;
  read: string[];
  decide: string[];
  do: string[];
  receipts: ReceiptRef[];
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type GraphState = {
  // input
  customerDomain: string;
  command: DemoCommand;
  userMessage: string;

  // outputs
  overlays: OverlayCue[];
  steps: AgentStep[];
  assistantMessage: string;

  // optional debug
  debug?: Record<string, unknown>;
};
