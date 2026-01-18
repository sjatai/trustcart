/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { runRealProbe } from "@/lib/probes";
import { requireEnvVars } from "@/lib/errors";

type Args = {
  industry: string;
  geo: string;
  language: string;
  persona: string;
  limit: number;
  providers: Array<"OPENAI" | "GEMINI">;
  runProbe: boolean;
  domain: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = argv.findIndex((a) => a === `--${k}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const flag = (k: string) => argv.includes(`--${k}`);

  const providersRaw = (get("providers", "OPENAI,GEMINI") || "").toUpperCase();
  const providers = providersRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => p === "OPENAI" || p === "GEMINI") as Array<"OPENAI" | "GEMINI">;

  return {
    industry: get("industry", "auto_dealership")!,
    geo: get("geo", "US-NM-Albuquerque")!,
    language: get("language", "en")!,
    persona: get("persona", "consumer")!,
    limit: Number(get("limit", "120")),
    providers: providers.length ? providers : ["OPENAI", "GEMINI"],
    runProbe: flag("runProbe"),
    domain: get("domain", process.env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com")!,
  };
}

const TAXONOMIES = [
  "AVAILABILITY",
  "SUITABILITY",
  "RISK",
  "COST_VALUE",
  "NEXT_STEP",
] as const;

function baseWeight(taxonomy: (typeof TAXONOMIES)[number]): number {
  // Explainable weighting: availability & next_step drive conversion.
  if (taxonomy === "AVAILABILITY") return 85;
  if (taxonomy === "NEXT_STEP") return 82;
  if (taxonomy === "COST_VALUE") return 72;
  if (taxonomy === "RISK") return 68;
  return 65; // suitability
}

async function generateQuestionsWithLLM(args: Args): Promise<Array<{ taxonomy: any; questionText: string }>> {
  // Deterministic prompt; no fancy chain needed for MVP.
  // You can swap this to a dedicated llm client later.
  requireEnvVars(["OPENAI_API_KEY"], "Set OPENAI_API_KEY to generate the question bank.");

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
You are building a canonical "question bank" for customer discovery on AI/LLM.
Return ONLY JSON array. No markdown.

Context:
- Industry: ${args.industry}
- Geo: ${args.geo}
- Persona: ${args.persona}
- Language: ${args.language}

Goal:
Generate ${args.limit} high-intent consumer questions that matter for conversion.
Cover these taxonomies: AVAILABILITY, SUITABILITY, RISK, COST_VALUE, NEXT_STEP.
Questions must be specific, practical, and commonly asked.

Output format:
[
  {"taxonomy":"AVAILABILITY","questionText":"..."},
  ...
]

Rules:
- No duplicates.
- No brand names.
- Keep each question under 140 characters.
- Prefer questions that lead to action (booking, call, visit).
`;

  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.choices[0]?.message?.content?.trim() || "[]";
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse LLM JSON:", text.slice(0, 500));
    throw e;
  }

  // Basic normalization/dedupe
  const seen = new Set<string>();
  const out: Array<{ taxonomy: any; questionText: string }> = [];
  for (const item of parsed) {
    const q = String(item?.questionText || "").trim();
    const t = String(item?.taxonomy || "").trim().toUpperCase();
    if (!q || !TAXONOMIES.includes(t as any)) continue;
    const key = q.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s?]/g, "").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ taxonomy: t, questionText: q });
  }
  return out.slice(0, args.limit);
}

async function main() {
  const args = parseArgs();

  if (args.providers.includes("OPENAI")) requireEnvVars(["OPENAI_API_KEY"], "Set OPENAI_API_KEY");
  if (args.providers.includes("GEMINI")) requireEnvVars(["GEMINI_API_KEY"], "Set GEMINI_API_KEY");

  console.log(`[build_question_bank] target domain: ${args.domain}, NEXT_PUBLIC_DEMO_DOMAIN=${process.env.NEXT_PUBLIC_DEMO_DOMAIN}`);

  const intentDomain = await prisma.intentDomain.upsert({
    where: {
      industry_geo_language_persona: {
        industry: args.industry,
        geo: args.geo,
        language: args.language,
        persona: args.persona,
      },
    } as any,
    update: {},
    create: {
      industry: args.industry,
      geo: args.geo,
      language: args.language,
      persona: args.persona,
      meta: { createdBy: "build_question_bank.ts", version: 1 },
    },
  });

  // Use your existing demo customer for receipts (or create a special "system" customer later).
  // For now, we store receipts against the demo domain customer if present; safe fallback to skip.
  const demoCustomer = await prisma.customer.findFirst({ where: { domain: process.env.NEXT_PUBLIC_DEMO_DOMAIN || "reliablenissan.com" } });

  const questions = await generateQuestionsWithLLM(args);

  const upserts = [];
  for (const q of questions) {
    upserts.push(
      prisma.questionBankEntry.upsert({
        where: { intentDomainId_questionText: { intentDomainId: intentDomain.id, questionText: q.questionText } } as any,
        update: {
          taxonomy: q.taxonomy,
          weight: baseWeight(q.taxonomy),
          sourceMeta: { source: "LLM_GEN", promptVersion: 1 },
        },
        create: {
          intentDomainId: intentDomain.id,
          questionText: q.questionText,
          taxonomy: q.taxonomy,
          weight: baseWeight(q.taxonomy),
          sourceMeta: { source: "LLM_GEN", promptVersion: 1 },
        },
      })
    );
  }
  await prisma.$transaction(upserts);

  if (demoCustomer) {
    await writeReceipt({
      customerId: demoCustomer.id,
      kind: "DECIDE",
      actor: "INTENT_ENGINE",
      summary: `Question bank built for ${args.industry} / ${args.geo} (${questions.length} questions).`,
      input: { industry: args.industry, geo: args.geo, language: args.language, persona: args.persona, limit: args.limit },
      output: { intentDomainId: intentDomain.id, count: questions.length },
    });
  }

  console.log(`✅ Stored ${questions.length} QuestionBankEntry rows for IntentDomain=${intentDomain.id}`);

  if (!args.runProbe) return;

  // Sample probe answers: run probe on top N questions to store "market memory".
  // Store these as ProbeRun/ProbeAnswer using a synthetic domain label in mode.
  const top = await prisma.questionBankEntry.findMany({
    where: { intentDomainId: intentDomain.id },
    orderBy: { weight: "desc" },
    take: Math.min(12, args.limit),
  });

  const probeQuestions = top.map((t) => t.questionText);
  console.log(`🔎 Running sample probe on ${probeQuestions.length} questions...`);

  // Use the existing probe runner; store against demoCustomer for now.
  if (!demoCustomer) throw new Error("No demo customer found; set NEXT_PUBLIC_DEMO_DOMAIN or create Customer row.");

  const probe = await runRealProbe({
    customerId: demoCustomer.id,
    mode: `bank_sample:${args.industry}:${args.geo}`,
    questions: probeQuestions,
    domain: demoCustomer.domain,
    providers: args.providers,
  });

  // Record signal snapshots based on probe results (simple: higher hedging => higher priority weight).
  const answers = await prisma.probeAnswer.findMany({
    where: { probeRunId: { in: Object.values(probe.runIds).filter(Boolean) as string[] } },
    take: 500,
  });

  for (const a of answers) {
    const hedging = a.hedging ?? 50;
    const delta = hedging >= 70 ? +3 : hedging <= 35 ? -2 : 0; // simple, explainable
    if (!delta) continue;
    await prisma.questionSignalSnapshot.create({
      data: {
        intentDomainId: intentDomain.id,
        questionText: a.question,
        signalType: "PROBE",
        deltaWeight: delta,
        payload: { hedging, probeRunId: a.probeRunId },
      },
    });
    await prisma.questionBankEntry.updateMany({
      where: { intentDomainId: intentDomain.id, questionText: a.question },
      data: { weight: { increment: delta } },
    });
  }

  console.log(`✅ Sample probe complete. SnapshotId=${probe.snapshotId} (customer=${demoCustomer.domain})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});