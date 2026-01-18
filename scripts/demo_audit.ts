// scripts/demo_audit.ts
import "dotenv/config";
import assert from "node:assert";
import { prisma } from "../src/lib/db";

const BASE_URL = process.env.TRUSTEYE_BASE_URL || "http://localhost:3000";
const CHAT_ENDPOINT = `${BASE_URL}/api/chat`;

const argv = process.argv.slice(2);
const SELF_HEAL = argv.includes("--self-heal");
const SKIP_PROVIDERS = argv.includes("--skip-providers") || ["1", "true", "yes"].includes((process.env.DEMO_AUDIT_SKIP_PROVIDERS || "").toLowerCase());
const MAX_ATTEMPTS = Number(process.env.DEMO_AUDIT_MAX_ATTEMPTS || "2"); // bounded
const WAIT_BETWEEN_ATTEMPTS_MS = Number(process.env.DEMO_AUDIT_RETRY_WAIT_MS || "450");

function argValue(name: string) {
  const hit = argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf("=");
  if (eq === -1) return null;
  return hit.slice(eq + 1).trim() || null;
}

const CUSTOMER_DOMAIN =
  argValue("--domain") ||
  (process.env.DEMO_AUDIT_DOMAIN || "").trim() ||
  (process.env.NEXT_PUBLIC_DEMO_DOMAIN || "").trim() ||
  "reliablenissan.com";
const CUSTOMER_NAME = "Reliable Nissan";

type ChatOk = {
  ok: true;
  customerDomain: string;
  command: any;
  overlays: any[];
  steps: any[];
  assistantMessage: string;
  debug?: any;
};

type ChatErr = {
  ok: false;
  error: string;
  message: string;
  customerDomain?: string;
  command?: any;
  overlays?: any[];
  steps?: any[];
  assistantMessage?: string;
  debug?: any; // if you return debug on error later
};

type ChatResponse = ChatOk | ChatErr;

type ChatCallResult =
  | { ok: true; status: number; json: ChatOk }
  | { ok: false; status: number; json?: ChatErr; rawText?: string };

function env(name: string) {
  return (process.env[name] || "").trim();
}
function requireEnv(name: string) {
  const v = env(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postChatRaw(message: string, customerDomain = CUSTOMER_DOMAIN): Promise<ChatCallResult> {
  let res: Response;
  try {
    res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, customerDomain }),
    });
  } catch (e: any) {
    return { ok: false, status: 0, rawText: e?.message || String(e) };
  }

  const status = res.status;
  const text = await res.text();

  let json: ChatResponse | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    // e.g. 400 ConfigError, 500 server error
    return { ok: false, status, json: (json as ChatErr) ?? undefined, rawText: text };
  }

  if (!json) return { ok: false, status, rawText: `Non-JSON response: ${text.slice(0, 1200)}` };

  if (json.ok !== true) {
    return { ok: false, status, json: json as ChatErr, rawText: text };
  }

  return { ok: true, status, json: json as ChatOk };
}

async function assertDbConnected() {
  await prisma.$queryRaw`SELECT 1`;
}

async function getCustomerIdByDomain(domain: string) {
  const c = await prisma.customer.findUnique({ where: { domain } });
  return c?.id || null;
}

async function ensureCustomer(domain: string) {
  let id = await getCustomerIdByDomain(domain);
  if (!id) {
    const created = await prisma.customer.create({
      data: { name: CUSTOMER_NAME, domain },
      select: { id: true },
    });
    id = created.id;
  }
  return id;
}

async function counts(customerId: string) {
  const [
    crawlRuns,
    crawlPages,
    claims,
    evidence,
    questions,
    probeRuns,
    probeAnswers,
    visSnapshots,
    trustSnapshots,
    consumerTrustSnapshots,
    assets,
    assetVersions,
    assetEvidence,
    rulesets,
    segmentSnapshots,
    campaigns,
    sendReceipts,
    receipts,
  ] = await Promise.all([
    prisma.crawlRun.count({ where: { customerId } }),
    prisma.crawlPage.count({ where: { crawlRun: { customerId } } }),
    prisma.claim.count({ where: { customerId } }),
    prisma.evidence.count({ where: { claim: { customerId } } }),
    prisma.question.count({ where: { customerId } }),
    prisma.probeRun.count({ where: { customerId } }),
    prisma.probeAnswer.count({ where: { probeRun: { customerId } } }),
    prisma.visibilityScoreSnapshot.count({ where: { customerId } }),
    prisma.trustScoreSnapshot.count({ where: { customerId } }),
    prisma.consumerTrustSnapshot.count({ where: { customerId } }),
    prisma.asset.count({ where: { customerId } }),
    prisma.assetVersion.count({ where: { asset: { customerId } } }),
    prisma.assetEvidence.count({ where: { asset: { customerId } } }),
    prisma.ruleSet.count({ where: { customerId } }),
    prisma.segmentSnapshot.count({ where: { customerId } }),
    prisma.campaign.count({ where: { customerId } }),
    prisma.sendReceipt.count({ where: { campaign: { customerId } } }),
    prisma.receipt.count({ where: { customerId } }),
  ]);

  return {
    crawlRuns,
    crawlPages,
    claims,
    evidence,
    questions,
    probeRuns,
    probeAnswers,
    visSnapshots,
    trustSnapshots,
    consumerTrustSnapshots,
    assets,
    assetVersions,
    assetEvidence,
    rulesets,
    segmentSnapshots,
    campaigns,
    sendReceipts,
    receipts,
  };
}

function delta(before: Record<string, number>, after: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const k of Object.keys(after)) out[k] = (after[k] ?? 0) - (before[k] ?? 0);
  return out;
}
function requireMinAfter(after: Record<string, number>, key: string, min: number) {
  const v = after[key] ?? 0;
  if (v < min) throw new Error(`Expected ${key} to be >= ${min} after flow, got ${v}`);
}

type Flow = {
  name: string;
  command: string;
  expect: Partial<Record<keyof Awaited<ReturnType<typeof counts>>, number>>;
  needsProviders?: boolean;
  postCheck?: "publishedAssets";
  // Optional “heal variants” for parsing issues:
  healVariants?: string[];
};

const FLOWS: Flow[] = [
  {
    name: "Flow 1 — Onboard / Crawl / Claims",
    command: `Onboard ${CUSTOMER_DOMAIN}`,
    expect: { crawlRuns: 1, crawlPages: 5, claims: 10, evidence: 10, receipts: 2 },
    healVariants: [
      `Onboard domain ${CUSTOMER_DOMAIN}`,
      `Crawl ${CUSTOMER_DOMAIN} and build knowledge graph`,
    ],
  },
  {
    name: "Flow 2 — Intent Graph",
    command: `Generate intent graph for ${CUSTOMER_NAME} (top 20)`,
    expect: { questions: 10, receipts: 1 },
    healVariants: [
      `Generate top 20 customer questions for ${CUSTOMER_NAME}`,
      `Create intent graph (20) for ${CUSTOMER_NAME}`,
    ],
  },
  {
    name: "Flow 3 — LLM Probe + Visibility Score (REAL)",
    command: `Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score.`,
    needsProviders: true,
    expect: { probeRuns: 1, probeAnswers: 8, visSnapshots: 1, receipts: 1 },
    healVariants: [
      `Probe OpenAI + Gemini for 8 questions and compute AI visibility score`,
    ],
  },
  {
    name: "Flow 4 — Content Assets",
    command: `Generate approved-ready FAQ + blog assets for top 5 gaps (with evidence blocks). Route for approval.`,
    expect: { assets: 3, assetVersions: 3, receipts: 1 },
    healVariants: [
      `Generate 5 draft FAQ/blog assets to address top gaps; include evidence blocks; send for approval`,
    ],
  },
  {
    name: "Flow 5 — Approve + Publish",
    command: `Approve and publish the top 2 assets.`,
    expect: { receipts: 1 },
    postCheck: "publishedAssets",
    healVariants: [
      `Approve 2 newest assets and publish them`,
    ],
  },
  {
    name: "Flow 6 — Governed Growth (Rules + Campaign Dry-run)",
    command:
      `Create campaign rule: select customers with rating >= 5 and positive sentiment who have not received referral campaign; ` +
      `dry-run only; show eligible vs suppressed with reasons.`,
    expect: { rulesets: 1, segmentSnapshots: 1, campaigns: 1, sendReceipts: 1, receipts: 2 },
    healVariants: [
      `Create referral campaign rule: rating>=5 AND positive sentiment AND not previously contacted; dry-run; show eligible vs suppressed with reasons`,
    ],
  },
  {
    name: "Flow 7 — Summary",
    command:
      `Summarize what changed today: AI visibility delta, assets published, campaign readiness. Recommend next 3 highest ROI moves.`,
    expect: { receipts: 1 },
    healVariants: [
      `Summarize today's work: scores, published assets, campaign readiness; top 3 next moves`,
    ],
  },
];

type FlowResult = {
  name: string;
  pass: boolean;
  attempts: number;
  finalCommand?: string;
  error?: string;
  assistantPreview?: string;
  deltas?: Record<string, number>;
  debug?: any;
};

type FailureClass =
  | "MISSING_KEYS"
  | "DB_UNAVAILABLE"
  | "PARSE_OR_UNKNOWN_COMMAND"
  | "TRANSIENT_SERVER"
  | "HARD_SERVER"
  | "UNKNOWN";

function classifyFailure(r: ChatCallResult): FailureClass {
  const json = (r as any).json as ChatErr | undefined;
  const status = r.status;
  const rawText = "rawText" in r ? r.rawText : undefined;

  // If you use dbUnavailablePayload, it should have a stable error code
  const errCode = json?.error || "";
  const msg = `${json?.message || ""} ${json?.assistantMessage || ""} ${rawText || ""}`.toLowerCase();

  if (msg.includes("missing required env var") || msg.includes("missing") && msg.includes("api_key")) {
    return "MISSING_KEYS";
  }
  if (errCode.includes("db_unavailable") || msg.includes("db unavailable") || msg.includes("database")) {
    return "DB_UNAVAILABLE";
  }
  if (errCode.includes("unknown") || msg.includes("unknown command") || msg.includes("could not parse") || errCode.includes("parse")) {
    return "PARSE_OR_UNKNOWN_COMMAND";
  }
  if (status === 0 || msg.includes("fetch failed") || msg.includes("timeout") || msg.includes("econnreset")) {
    return "TRANSIENT_SERVER";
  }
  if (status >= 500) return "HARD_SERVER";
  return "UNKNOWN";
}

async function runOneFlow(flow: Flow, customerId: string): Promise<FlowResult> {
  if (flow.needsProviders) {
    // NO MOCKS
    if (SKIP_PROVIDERS) {
      return {
        name: flow.name,
        pass: true,
        attempts: 0,
        finalCommand: flow.command,
        assistantPreview: "SKIPPED (missing providers; run without --skip-providers and set OPENAI_API_KEY + GEMINI_API_KEY).",
      };
    }
    requireEnv("OPENAI_API_KEY");
    requireEnv("GEMINI_API_KEY");
  }

  const before = await counts(customerId);

  const commandsToTry = [flow.command, ...(flow.healVariants || [])];
  const maxAttempts = SELF_HEAL ? Math.min(MAX_ATTEMPTS, commandsToTry.length) : 1;

  let lastErr = "";
  let lastDebug: any = undefined;
  let lastAssistantPreview = "";
  let lastDeltas: Record<string, number> | undefined = undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const cmd = commandsToTry[attempt];

    const res = await postChatRaw(cmd, CUSTOMER_DOMAIN);

    if (!res.ok) {
      const cls = classifyFailure(res);
      const j = (res as any).json as ChatErr | undefined;

      lastErr = j ? `${j.error}: ${j.message}` : (res.rawText || `HTTP ${res.status}`);
      lastDebug = j?.debug;

      // Bounded “self-heal” rules
      if (!SELF_HEAL) {
        return { name: flow.name, pass: false, attempts: attempt + 1, finalCommand: cmd, error: lastErr, debug: lastDebug };
      }

      // Stop immediately for infra/config issues (don’t retry)
      if (cls === "MISSING_KEYS" || cls === "DB_UNAVAILABLE") {
        return { name: flow.name, pass: false, attempts: attempt + 1, finalCommand: cmd, error: lastErr, debug: lastDebug };
      }

      // Retry only for parse/unknown or transient/hard server, up to bounds
      await sleep(WAIT_BETWEEN_ATTEMPTS_MS);
      continue;
    }

    // Success call
    const ok = res.json;
    lastAssistantPreview = (ok.assistantMessage || "").slice(0, 500);
    lastDebug = ok.debug;

    await sleep(350);

    const after = await counts(customerId);
    const d = delta(before as any, after as any);
    lastDeltas = d;

    // Validate expectations
    try {
      for (const [k, min] of Object.entries(flow.expect)) {
        requireMinAfter(after as any, k, min as number);
      }

      if (flow.postCheck === "publishedAssets") {
        const published = await prisma.asset.findMany({
          where: { customerId, status: "PUBLISHED" as any },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, type: true, title: true, slug: true },
        });
        if (published.length < 1) throw new Error("Expected at least 1 PUBLISHED asset after publish step.");
      }

      return {
        name: flow.name,
        pass: true,
        attempts: attempt + 1,
        finalCommand: cmd,
        assistantPreview: lastAssistantPreview,
        deltas: d,
        debug: lastDebug,
      };
    } catch (e: any) {
      lastErr = e?.message || String(e);

      // If expectations fail, treat as hard fail (don’t keep hammering),
      // unless in self-heal and we have another command variant to try.
      if (!SELF_HEAL) {
        return { name: flow.name, pass: false, attempts: attempt + 1, finalCommand: cmd, error: lastErr, debug: lastDebug, assistantPreview: lastAssistantPreview, deltas: d };
      }

      await sleep(WAIT_BETWEEN_ATTEMPTS_MS);
      continue;
    }
  }

  return {
    name: flow.name,
    pass: false,
    attempts: maxAttempts,
    finalCommand: commandsToTry[Math.max(0, maxAttempts - 1)],
    error: lastErr || "Failed after bounded attempts",
    assistantPreview: lastAssistantPreview || undefined,
    deltas: lastDeltas,
    debug: lastDebug,
  };
}

async function main() {
  console.log("\n=== TrustEye Demo Audit (NO MOCKS) ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`customerDomain: ${CUSTOMER_DOMAIN}`);
  console.log(`selfHeal: ${SELF_HEAL ? "ON" : "OFF"} (maxAttempts=${MAX_ATTEMPTS})`);
  console.log(`skipProviders: ${SKIP_PROVIDERS ? "ON" : "OFF"}`);
  console.log("Env:");
  console.log(`- DATABASE_URL: ${env("DATABASE_URL") ? "PRESENT" : "MISSING"}`);
  console.log(`- OPENAI_API_KEY: ${env("OPENAI_API_KEY") ? "PRESENT" : "MISSING"}`);
  console.log(`- GEMINI_API_KEY: ${env("GEMINI_API_KEY") ? "PRESENT" : "MISSING"}`);

  requireEnv("DATABASE_URL");
  await assertDbConnected();

  const customerId = await ensureCustomer(CUSTOMER_DOMAIN);
  assert(customerId);

  const results: FlowResult[] = [];

  for (const flow of FLOWS) {
    console.log(`\n--- ${flow.name} ---`);
    console.log(`Command: ${flow.command}`);

    try {
      const r = await runOneFlow(flow, customerId);
      results.push(r);

      if (r.pass) {
        console.log(`✅ PASS (attempts=${r.attempts}) cmd="${r.finalCommand}"`);
      } else {
        console.log(`❌ FAIL (attempts=${r.attempts}) cmd="${r.finalCommand}"`);
        console.log(`   Error: ${r.error}`);
      }

      // Print debug highlights if present
      if (r.debug) {
        const agent = r.debug.failedAgent ?? r.debug.lastAgent ?? r.debug.agent;
        const lastReceipt = r.debug.lastReceiptId ?? r.debug.lastReceipt;
        const lastStep = r.debug.lastSuccessfulStep ?? r.debug.lastStep;
        if (agent || lastReceipt || lastStep) {
          console.log("   Debug:", { agent, lastReceipt, lastStep });
        }
      }
    } catch (e: any) {
      results.push({ name: flow.name, pass: false, attempts: 1, error: e?.message || String(e) });
      console.log(`❌ FAIL (fatal): ${e?.message || e}`);
    }
  }

  console.log("\n=== TrustEye E2E Flow Report (NO MOCKS) ===");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name}`);
    console.log(`  Attempts: ${r.attempts}`);
    if (r.finalCommand) console.log(`  Final command: ${r.finalCommand}`);
    if (!r.pass) console.log(`  Error: ${r.error}`);
    if (r.pass) console.log(`  Deltas: ${JSON.stringify(r.deltas)}`);

    // Always print the debug triad if present (this is the key)
    if (r.debug) {
      console.log(`  Debug: ${JSON.stringify(r.debug, null, 2).slice(0, 2000)}${JSON.stringify(r.debug).length > 2000 ? "…" : ""}`);
    }
  }

  const anyFail = results.some((r) => !r.pass);
  process.exitCode = anyFail ? 1 : 0;

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  process.exitCode = 1;
  await prisma.$disconnect();
});