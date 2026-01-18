import { prisma } from "@/lib/db";
import { requireEnvVars } from "@/lib/errors";

function scoreAnswer(answer: string, citations: unknown) {
  const len = answer.trim().length;
  const specificity = Math.max(20, Math.min(100, Math.round((len / 280) * 100)));
  const proof = Array.isArray(citations) ? Math.min(100, citations.length * 22) : 0;
  const hedgingWords = ["maybe", "might", "could", "possibly", "generally", "often"];
  const hedging = hedgingWords.reduce((acc, w) => (answer.toLowerCase().includes(w) ? acc + 10 : acc), 30);
  const unverifiable = /^not_verifiable\s*:/i.test(answer) || answer.includes("NOT_VERIFIABLE:");
  if (unverifiable) {
    return { specificity: 25, proof: 0, hedging: 95 };
  }
  return { specificity, proof, hedging: Math.min(100, hedging) };
}

function extractJsonObject(text: string): any | null {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  // Fast path: already JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // continue
  }
  // Try to locate a JSON object inside the text
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const chunk = trimmed.slice(start, end + 1);
    try {
      const parsed = JSON.parse(chunk);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

async function callOpenAIJson(args: { question: string; domain: string; model: string }) {
  requireEnvVars(
    ["OPENAI_API_KEY"],
    "Get an OpenAI API key, set `OPENAI_API_KEY`, then re-run the probe command."
  );

  const prompt =
    `You are evaluating whether ${args.domain}'s public web presence answers a consumer ecommerce question.\n` +
    `Context: assume the shopper is in Singapore (Orchard / Marina Bay Sands) when the question is about locality.\n\n` +
    `Hard rules:\n` +
    `- If you cannot verify the answer from known information, return an answer that starts with:\n` +
    `  NOT_VERIFIABLE: <exact missing info needed>\n` +
    `- Do NOT invent facts, policies, prices, delivery times, store locations, or availability.\n` +
    `- Return ONLY valid JSON with this schema:\n` +
    `  {"answer": string, "citations": string[]}\n\n` +
    `Question: ${args.question}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: "Return ONLY JSON. No prose. No markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI probe failed (${res.status}). ${t.slice(0, 500)}`);
  }

  const json = (await res.json()) as any;
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJsonObject(content);
  const answer = String(parsed?.answer ?? content ?? "").trim();
  const citations = Array.isArray(parsed?.citations) ? parsed.citations.map((c: any) => String(c)) : [];
  return { answer, citations };
}

async function callGeminiJson(args: { question: string; domain: string; model: string }) {
  requireEnvVars(
    ["GEMINI_API_KEY"],
    "Get a Gemini API key, set `GEMINI_API_KEY`, then re-run the probe command."
  );

  const prompt =
    `You are evaluating whether ${args.domain}'s public web presence answers a consumer ecommerce question.\n` +
    `Context: assume the shopper is in Singapore (Orchard / Marina Bay Sands) when the question is about locality.\n\n` +
    `Hard rules:\n` +
    `- If you cannot verify the answer from known information, return an answer that starts with:\n` +
    `  NOT_VERIFIABLE: <exact missing info needed>\n` +
    `- Do NOT invent facts, policies, prices, delivery times, store locations, or availability.\n` +
    `- Return ONLY valid JSON with this schema:\n` +
    `  {"answer": string, "citations": string[]}\n\n` +
    `Question: ${args.question}`;

  // Default to v1 (v1beta has been unstable across model availability for some keys).
  const apiVersion = (process.env.GEMINI_API_VERSION || "v1").trim() || "v1";
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(
    process.env.GEMINI_API_KEY || ""
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini probe failed (${res.status}). ${t.slice(0, 500)}`);
  }

  const json = (await res.json()) as any;
  const content: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") ?? "";
  const parsed = extractJsonObject(content);
  const answer = String(parsed?.answer ?? content ?? "").trim();
  const citations = Array.isArray(parsed?.citations) ? parsed.citations.map((c: any) => String(c)) : [];
  return { answer, citations };
}

async function callGeminiJsonWithFallback(args: { question: string; domain: string; models: string[] }) {
  let lastErr: unknown = null;
  for (const model of args.models) {
    try {
      return await callGeminiJson({ question: args.question, domain: args.domain, model });
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      // Only fall back for "model not found" / 404 errors; otherwise fail fast.
      if (!msg.includes("Gemini probe failed (404)")) throw e;
      continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || "Gemini probe failed"));
}

async function computeFreshnessScore(customerId: string) {
  const latest = await prisma.claim.findFirst({
    where: { customerId, freshnessAt: { not: null } },
    orderBy: { freshnessAt: "desc" },
    select: { freshnessAt: true },
  });
  const ts = latest?.freshnessAt ? latest.freshnessAt.getTime() : 0;
  if (!ts) return 30;
  const days = (Date.now() - ts) / (24 * 60 * 60 * 1000);
  if (days <= 7) return 90;
  if (days <= 30) return 75;
  if (days <= 90) return 55;
  return 35;
}

export async function runRealProbe({
  customerId,
  mode,
  questions,
  domain,
  providers,
}: {
  customerId: string;
  mode: string;
  questions: string[];
  domain: string;
  providers: Array<"OPENAI" | "GEMINI">;
}) {
  if (providers.length === 0) throw new Error("No providers specified for probe.");

  // Provider runs are persisted separately; the visibility score snapshot is aggregated
  // and tied to the first provider run for traceability.
  const runIds: Record<string, string> = {};
  const providerMetrics: Array<{ provider: string; coverage: number; specificity: number; proof: number; aiReadiness: number }> = [];
  const providerErrors: Record<string, string> = {};
  const successfulProviders: string[] = [];

  for (const provider of providers) {
    const probeRun = await prisma.probeRun.create({
      data: {
        customerId,
        provider: provider as any,
        mode,
        questions: questions as any,
      },
    });
    runIds[provider] = probeRun.id;

    try {
      let specificitySum = 0;
      let proofSum = 0;
      let coverageCount = 0;

      for (const q of questions) {
        const { answer, citations } =
          provider === "OPENAI"
            ? await callOpenAIJson({ question: q, domain, model: process.env.OPENAI_MODEL || "gpt-4o-mini" })
            : await callGeminiJsonWithFallback({
                question: q,
                domain,
                models: [
                  // Prefer explicit env override first.
                  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
                  // Try common modern model IDs, then older ones.
                  "gemini-2.0-flash",
                  "gemini-2.0-flash-lite",
                  "gemini-2.0-pro",
                  "gemini-1.5-pro",
                  "gemini-1.5-flash",
                  "gemini-pro",
                ],
              });

        const normalizedCitations = (citations || []).filter(Boolean).slice(0, 8);
        const scored = scoreAnswer(answer, normalizedCitations);
        specificitySum += scored.specificity;
        proofSum += scored.proof;
        const unverifiable = /^not_verifiable\s*:/i.test(answer) || String(answer).includes("NOT_VERIFIABLE:");
        if (answer && !unverifiable && !answer.toLowerCase().includes("i don't know")) coverageCount += 1;

        await prisma.probeAnswer.create({
          data: {
            probeRunId: probeRun.id,
            question: q,
            answer: answer || "",
            citations: normalizedCitations as any,
            hedging: scored.hedging,
            correctness: null,
          },
        });
      }

      const coverage = Math.round((coverageCount / Math.max(1, questions.length)) * 100);
      const specificity = Math.round(specificitySum / Math.max(1, questions.length));
      const proof = Math.round(proofSum / Math.max(1, questions.length));
      const aiReadiness = Math.round((coverage + specificity + proof) / 3);

      providerMetrics.push({ provider, coverage, specificity, proof, aiReadiness });
      successfulProviders.push(provider);
    } catch (e: any) {
      // If one provider fails (e.g. Gemini quota=0), still allow the other real provider(s) to complete.
      providerErrors[provider] = e?.message || String(e);
      continue;
    }
  }

  if (providerMetrics.length === 0) {
    const firstProvider = providers[0] || "UNKNOWN";
    throw new Error(providerErrors[firstProvider] || "All probe providers failed.");
  }

  const freshness = await computeFreshnessScore(customerId);
  const avg = (k: keyof (typeof providerMetrics)[number]) =>
    Math.round(providerMetrics.reduce((acc, m) => acc + Number(m[k] || 0), 0) / Math.max(1, providerMetrics.length));

  const coverage = avg("coverage");
  const specificity = avg("specificity");
  const proof = avg("proof");
  const aiReadiness = Math.round((coverage + specificity + proof + freshness) / 4);
  const total = aiReadiness;

  const snapshot = await prisma.visibilityScoreSnapshot.create({
    data: {
      customerId,
      probeRunId: runIds[successfulProviders[0]] || null,
      total,
      coverage,
      specificity,
      proof,
      freshness,
      aiReadiness,
    },
  });

  return { runIds, snapshotId: snapshot.id, snapshot, providerMetrics, providerErrors };
}
