import { prisma } from "@/lib/db";

export type WriteReceiptInput = {
  customerId: string;
  sessionId?: string | null;
  kind: "READ" | "DECIDE" | "EXECUTE" | "PUBLISH" | "SUPPRESS";
  actor: "CRAWLER" | "ORCHESTRATOR" | "INTENT_ENGINE" | "TRUST_ENGINE" | "CONTENT_ENGINE" | "RULE_ENGINE" | "DELIVERY";
  summary: string;
  input?: unknown;
  output?: unknown;
};

function truncateStrings(value: unknown, maxLen = 2000, maxDepth = 4, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= maxDepth) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => truncateStrings(v, maxLen, maxDepth, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncateStrings(v, maxLen, maxDepth, depth + 1);
    }
    return out;
  }
  return String(value);
}

function safeJson(value: unknown): unknown {
  const truncated = truncateStrings(value);
  try {
    const s = JSON.stringify(truncated);
    if (s.length <= 20_000) return truncated;
    return { truncated: true, preview: s.slice(0, 20_000) };
  } catch {
    return { truncated: true, preview: String(truncated).slice(0, 20_000) };
  }
}

export async function writeReceipt(args: WriteReceiptInput) {
  return prisma.receipt.create({
    data: {
      customerId: args.customerId,
      sessionId: args.sessionId ?? null,
      kind: args.kind as any,
      actor: args.actor as any,
      summary: args.summary,
      input: args.input === undefined ? undefined : (safeJson(args.input) as any),
      output: args.output === undefined ? undefined : (safeJson(args.output) as any),
    },
  });
}

export async function listReceipts({
  customerId,
  limit = 50,
  kind,
  actor,
}: {
  customerId: string;
  limit?: number;
  kind?: WriteReceiptInput["kind"];
  actor?: WriteReceiptInput["actor"];
}) {
  return prisma.receipt.findMany({
    where: {
      customerId,
      ...(kind ? { kind: kind as any } : {}),
      ...(actor ? { actor: actor as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
}


