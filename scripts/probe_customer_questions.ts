/* eslint-disable no-console */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { getOrCreateCustomerByDomain } from "@/lib/customer";
import { writeReceipt } from "@/lib/receipts";
import OpenAI from "openai";

type Args = {
  domain: string;
  provider: "OPENAI" | "GEMINI";
  mode: string;
  top: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = argv.findIndex((a) => a === `--${k}`);
    return i >= 0 ? argv[i + 1] : d;
  };

  return {
    domain: get("domain")!,
    provider: (get("provider", "OPENAI") as any),
    mode: get("mode", "brand_discovery")!,
    top: Number(get("top", "40")),
  };
}

async function askOpenAI(question: string, domain: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
Answer the question about the brand ${domain}.
Context: assume the shopper is in Singapore (Orchard / Marina Bay Sands) when the question is about locality.

Hard rules:
- If you cannot verify, return:
  NOT_VERIFIABLE: <missing info needed>
- Do NOT invent facts, policies, prices, delivery times, store locations, or availability.

Question: ${question}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  return res.choices[0]?.message?.content || "";
}

async function main() {
  const args = parseArgs();
  if (!args.domain) throw new Error("--domain is required");

  const customer = await getOrCreateCustomerByDomain(args.domain);

  const questions = await prisma.question.findMany({
    where: { customerId: customer.id },
    orderBy: { impactScore: "desc" },
    take: Math.min(100, Math.max(1, args.top)),
  });

  console.log(
    `[probe] ${args.provider} → ${args.domain} (${questions.length} questions)`
  );

  const probeRun = await prisma.probeRun.create({
    data: {
      customerId: customer.id,
      provider: args.provider,
      mode: args.mode,
      questions: questions.map((q) => q.text),
    },
  });

  for (const q of questions) {
    let answer = "";

    if (args.provider === "OPENAI") {
      answer = await askOpenAI(q.text, args.domain);
    } else {
      // Gemini stub (safe for now)
      answer = "Gemini probe placeholder – to be implemented";
    }

    // very conservative scoring
    const hedging =
      /not sure|depends|varies|may|might|unclear/i.test(answer) ? 80 : 20;

    await prisma.probeAnswer.create({
      data: {
        probeRunId: probeRun.id,
        question: q.text,
        answer,
        hedging,
        correctness: answer ? 70 : 30,
      },
    });
  }

  await writeReceipt({
    customerId: customer.id,
    kind: "EXECUTE",
    actor: "INTENT_ENGINE",
    summary: `Ran LLM probe (${args.provider}) for ${questions.length} questions`,
    input: {
      provider: args.provider,
      mode: args.mode,
      top: args.top,
    },
    output: {
      probeRunId: probeRun.id,
      questionCount: questions.length,
    },
  });

  console.log(
    `✅ Probe completed: ${args.provider} → ${args.domain} (run=${probeRun.id})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});