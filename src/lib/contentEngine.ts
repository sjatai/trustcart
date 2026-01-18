import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireEnvVars } from "@/lib/errors";
import { extractNeedsVerificationMarkers } from "@/lib/contentSafety";

// -----------------------
// Schema (STRICT)
// -----------------------

const EvidenceSnippetSchema = z
  .object({
    url: z.string(),
    excerpt: z.string(),
  })
  .strict();

const LlmEvidenceSchema = z
  .object({
    provider: z.string(),
    excerpt: z.string(),
    riskNote: z.string(),
  })
  .strict();

const ConflictSchema = z
  .object({
    key: z.string(),
    note: z.string(),
  })
  .strict();

const FactMapSchema = z
  .object({
    usedClaims: z.array(z.string()),
    missingClaims: z.array(z.string()),
    conflicts: z.array(ConflictSchema),
  })
  .strict();

const FaqTruthDraftSchema = z
  .object({
    shortAnswer: z.string(),
    details: z.array(
      z
        .object({
          heading: z.string(),
          body: z.string(),
        })
        .strict()
    ),
    trustSignals: z.array(z.string()),
    cta: z
      .union([
        z.object({ label: z.string(), url: z.string() }).strict(),
        z.object({ label: z.string(), phone: z.string() }).strict(),
        z.null(),
      ])
      .nullable()
      .transform((v) => v ?? null),
    disclosures: z.array(z.string()),
  })
  .strict();

export const FaqOrTruthAssetSchema = z
  .object({
    assetType: z.union([z.literal("FAQ"), z.literal("TRUTH_BLOCK")]),
    title: z.string(),
    slug: z.string(),
    targetUrl: z.string(),
    draft: FaqTruthDraftSchema,
    factMap: FactMapSchema,
    evidence: z
      .object({
        usedSnippets: z.array(EvidenceSnippetSchema),
        llmEvidence: z.array(LlmEvidenceSchema),
      })
      .strict(),
    nextActions: z.array(z.string()),
  })
  .strict();

export const BlogAssetSchema = z
  .object({
    assetType: z.literal("BLOG"),
    title: z.string(),
    slug: z.string(),
    targetUrl: z.string(),
    metaDescription: z.string(),
    outline: z.array(z.string()),
    draftMarkdown: z.string(),
    factMap: FactMapSchema,
    evidence: z
      .object({
        usedSnippets: z.array(EvidenceSnippetSchema),
        llmEvidence: z.array(LlmEvidenceSchema),
      })
      .strict(),
    nextActions: z.array(z.string()),
  })
  .strict();

export const ProductUpdateAssetSchema = z
  .object({
    assetType: z.literal("PRODUCT_UPDATE"),
    productSlug: z.string(),
    targetUrl: z.string(),
    draft: z
      .object({
        heroBullets: z.array(z.string()),
        detailsSections: z.array(z.object({ heading: z.string(), body: z.string() }).strict()),
        faq: z.array(z.object({ q: z.string(), a: z.string() }).strict()),
        trustSignals: z.array(z.string()),
        cta: z.union([z.object({ label: z.string(), url: z.string() }).strict(), z.null()]),
      })
      .strict(),
    factMap: FactMapSchema,
    evidence: z
      .object({
        usedSnippets: z.array(EvidenceSnippetSchema),
        llmEvidence: z.array(LlmEvidenceSchema),
      })
      .strict(),
    nextActions: z.array(z.string()),
  })
  .strict();

export type FaqOrTruthAsset = z.infer<typeof FaqOrTruthAssetSchema>;
export type BlogAsset = z.infer<typeof BlogAssetSchema>;
export type ProductUpdateAsset = z.infer<typeof ProductUpdateAssetSchema>;

// -----------------------
// Prompt templates (as provided)
// -----------------------

function faqPromptTemplate(args: {
  domain: string;
  industry: string;
  geo: string;
  language: string;
  questionText: string;
  deltaType: "SITE_MISSING" | "LLM_WEAK" | "BOTH";
  targetUrl: string;
  verifiedClaimsJson: string;
  siteEvidenceJson: string;
  probeAnswersJson: string;
}) {
  return `
You are TrustEye Content Engine.

Goal: generate publish-ready drafts using ONLY provided evidence and provided verified claims.

Hard rules:
- Do NOT invent facts, numbers, addresses, hours, prices, inventory, policies, or guarantees.
- If a required fact is missing, write "NEEDS_VERIFICATION" and ask for that specific fact.
- If evidence conflicts, do not choose a side—mark as "CONFLICT" and explain what’s conflicting.
- Keep the writing clear, helpful, and conversion-friendly without hype.
- Output MUST be valid JSON matching the schema exactly. No extra keys. No markdown.

Generate a draft to answer a high-impact customer question for the brand website.

DOMAIN: ${args.domain}
INDUSTRY: ${args.industry}
GEO: ${args.geo}
LANGUAGE: ${args.language}

QUESTION:
${args.questionText}

DELTA TYPE (why we're drafting):
${args.deltaType}

TARGET PLACEMENT:
${args.targetUrl}

VERIFIED CLAIMS (may be empty):
${args.verifiedClaimsJson}

SITE EVIDENCE SNIPPETS (may be empty, do not assume complete):
${args.siteEvidenceJson}

CURRENT LLM ANSWERS (may be empty):
${args.probeAnswersJson}

REQUIREMENTS:
- Answer the question accurately using ONLY VERIFIED CLAIMS and SITE EVIDENCE.
- If the answer requires facts not present, list them as NEEDS_VERIFICATION items.
- Include a short "Trust signals" block that references reviews/sentiment ONLY if provided in VERIFIED CLAIMS or SITE EVIDENCE.
- Suggest a minimal CTA (call/book/visit) ONLY if a verified URL/phone exists in VERIFIED CLAIMS.

Output JSON in this schema:

{
  "assetType": "FAQ" | "TRUTH_BLOCK",
  "title": string,
  "slug": string,
  "targetUrl": string,
  "draft": {
    "shortAnswer": string,
    "details": [ {"heading": string, "body": string} ],
    "trustSignals": [ string ],
    "cta": { "label": string, "url": string } | { "label": string, "phone": string } | null,
    "disclosures": [ string ]
  },
  "factMap": {
    "usedClaims": [string],
    "missingClaims": [string],
    "conflicts": [ {"key": string, "note": string} ]
  },
  "evidence": {
    "usedSnippets": [ {"url": string, "excerpt": string} ],
    "llmEvidence": [ {"provider": string, "excerpt": string, "riskNote": string} ]
  },
  "nextActions": [ string ]
}
`.trim();
}

function blogPromptTemplate(args: {
  domain: string;
  industry: string;
  geo: string;
  language: string;
  questionText: string;
  relatedQuestionsJson: string;
  verifiedClaimsJson: string;
  siteEvidenceJson: string;
  probeAnswersJson: string;
  targetUrl: string;
}) {
  return `
Generate a publish-ready blog draft that answers a cluster of customer questions for the brand, without adding any unverified facts.

DOMAIN: ${args.domain}
INDUSTRY: ${args.industry}
GEO: ${args.geo}
LANGUAGE: ${args.language}

BLOG PURPOSE:
Improve AI/LLM discovery by answering real customer questions with proof.

PRIMARY QUESTION:
${args.questionText}

RELATED QUESTIONS (optional):
${args.relatedQuestionsJson}

VERIFIED CLAIMS:
${args.verifiedClaimsJson}

SITE EVIDENCE SNIPPETS:
${args.siteEvidenceJson}

CURRENT LLM ANSWERS:
${args.probeAnswersJson}

REQUIREMENTS:
- Use ONLY VERIFIED CLAIMS + SITE EVIDENCE.
- No invented stats, comparisons, or promises.
- If key facts are missing, insert a bracket marker like: [NEEDS_VERIFICATION: ask for X].
- Tone: helpful, specific, calm, premium.
- Include an FAQ section at the end with 3–6 Q&As (must follow rules above).
- Include a "Trust & Proof" section listing sources from the evidence snippets (URLs) and/or verified claims.

Output JSON in this schema:

{
  "assetType": "BLOG",
  "title": string,
  "slug": string,
  "targetUrl": string,
  "metaDescription": string,
  "outline": [string],
  "draftMarkdown": string,
  "factMap": {
    "usedClaims": [string],
    "missingClaims": [string],
    "conflicts": [ {"key": string, "note": string} ]
  },
  "evidence": {
    "usedSnippets": [ {"url": string, "excerpt": string} ],
    "llmEvidence": [ {"provider": string, "excerpt": string, "riskNote": string} ]
  },
  "nextActions": [ string ]
}
`.trim();
}

function productUpdatePromptTemplate(args: {
  domain: string;
  productSlugOrName: string;
  questionText: string;
  currentProductJson: string;
  verifiedClaimsJson: string;
  siteEvidenceJson: string;
  probeAnswersJson: string;
  targetUrl: string;
}) {
  return `
Generate a product detail improvement draft for an ecommerce site. The goal is to make product pages answer buyer questions clearly for both humans and LLMs.

DOMAIN: ${args.domain}
PRODUCT IDENTIFIER:
${args.productSlugOrName}

TOP BUYER QUESTION:
${args.questionText}

CURRENT PRODUCT PAGE CONTENT / METAFIELDS (may be empty; treat as source of truth for what is already covered):
${args.currentProductJson}

VERIFIED CLAIMS (product attributes, policies, availability):
${args.verifiedClaimsJson}

SITE EVIDENCE SNIPPETS (product page excerpts, policy pages):
${args.siteEvidenceJson}

CURRENT LLM ANSWERS:
${args.probeAnswersJson}

REQUIREMENTS:
- Do NOT invent product specs (materials, sizes, waterproofing, durability, origin, pricing, availability).
- If not present in claims/evidence, mark as NEEDS_VERIFICATION.
- Do NOT repeat or paraphrase what is already present in CURRENT PRODUCT PAGE CONTENT. Only add missing attributes/deltas.
- Output should improve page clarity with small, product-specific deltas (not a generic block copied across all SKUs).
- Include an FAQ block with 3–5 buyer questions.

Output JSON:

{
  "assetType": "PRODUCT_UPDATE",
  "productSlug": string,
  "targetUrl": string,
  "draft": {
    "heroBullets": [string],
    "detailsSections": [ {"heading": string, "body": string} ],
    "faq": [ {"q": string, "a": string} ],
    "trustSignals": [string],
    "cta": { "label": string, "url": string } | null
  },
  "factMap": {
    "usedClaims": [string],
    "missingClaims": [string],
    "conflicts": [ {"key": string, "note": string} ]
  },
  "evidence": {
    "usedSnippets": [ {"url": string, "excerpt": string} ],
    "llmEvidence": [ {"provider": string, "excerpt": string, "riskNote": string} ]
  },
  "nextActions": [ string ]
}
`.trim();
}

// -----------------------
// Utilities
// -----------------------

function extractJsonObject(text: string): any | null {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // continue
  }
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

async function callOpenAIJson(prompt: string) {
  requireEnvVars(["OPENAI_API_KEY"], "Set OPENAI_API_KEY to generate Content Engine drafts.");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const controller = new AbortController();
  const timeoutMs = Number(process.env.TRUSTEYE_OPENAI_TIMEOUT_MS || "2500");
  const t = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return ONLY valid JSON. No prose. No markdown. No extra keys." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  clearTimeout(t);

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Content Engine OpenAI call failed (${res.status}). ${bodyText.slice(0, 500)}`);
  }

  let json: any = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error("Content Engine OpenAI response was not JSON.");
  }

  const content: string = json?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("Content Engine returned non-JSON output.");
  }
  return parsed;
}

function slugify(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
}

function toJson(value: unknown) {
  return JSON.stringify(value ?? [], null, 2);
}

// -----------------------
// Data gatherers
// -----------------------

async function getVerifiedClaims(customerId: string, take = 25) {
  const claims = await prisma.claim.findMany({
    where: { customerId },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take,
    select: { key: true, value: true, confidence: true, freshnessAt: true },
  });
  return claims.map((c) => ({
    key: c.key,
    value: c.value,
    confidence: c.confidence,
    freshnessAt: c.freshnessAt ? c.freshnessAt.toISOString().slice(0, 10) : null,
  }));
}

async function getSiteEvidence(customerId: string, take = 12) {
  const evidence = await prisma.evidence.findMany({
    where: { claim: { customerId } },
    orderBy: { capturedAt: "desc" },
    take,
    select: { url: true, snippet: true, capturedAt: true },
  });
  return evidence.map((e) => ({
    url: e.url,
    snippet: e.snippet ?? "",
    capturedAt: e.capturedAt.toISOString(),
  }));
}

async function getProbeAnswers(customerId: string, questionText: string, take = 4) {
  const answers = await prisma.probeAnswer.findMany({
    where: { question: questionText, probeRun: { customerId } },
    orderBy: { createdAt: "desc" },
    take,
    select: { answer: true, hedging: true, probeRun: { select: { provider: true } } },
  });
  return answers.map((a) => ({
    provider: String(a.probeRun?.provider || "UNKNOWN"),
    answer: String(a.answer || "").slice(0, 1800),
    hedging: a.hedging ?? 50,
  }));
}

// -----------------------
// Renderers (store in existing site formats)
// -----------------------

export function renderFaqOrTruthToAssetContent(out: FaqOrTruthAsset): string {
  const parts: string[] = [];
  parts.push(`Q: ${out.title || ""}`.trim());
  parts.push("");
  parts.push(`A: ${out.draft.shortAnswer}`.trim());

  for (const d of out.draft.details || []) {
    if (!d?.heading || !d?.body) continue;
    parts.push("");
    parts.push(`${d.heading}`.trim());
    parts.push(`${d.body}`.trim());
  }

  if (out.draft.trustSignals?.length) {
    parts.push("");
    parts.push("Trust signals:");
    for (const s of out.draft.trustSignals) {
      parts.push(`- ${s}`);
    }
  }

  if (out.draft.disclosures?.length) {
    parts.push("");
    parts.push("Disclosures:");
    for (const s of out.draft.disclosures) {
      parts.push(`- ${s}`);
    }
  }

  // Force visibility of missing items inside the draft (publish safety switch will block).
  for (const m of out.factMap.missingClaims || []) {
    parts.push("");
    parts.push(`[NEEDS_VERIFICATION: ${m}]`);
  }

  return parts.join("\n").trim() + "\n";
}

export function renderBlogToAssetContent(out: BlogAsset): string {
  const title = out.title || "Blog";
  const head = `# ${title}`.trim();
  const body = String(out.draftMarkdown || "").trim();
  const missing = (out.factMap.missingClaims || []).map((m) => `[NEEDS_VERIFICATION: ${m}]`).join("\n");
  return [head, "", body, missing ? `\n${missing}\n` : ""].join("\n").trim() + "\n";
}

export function renderProductUpdateToBodyMd(out: ProductUpdateAsset): string {
  const lines: string[] = [];
  if (out.draft.heroBullets?.length) {
    for (const b of out.draft.heroBullets) lines.push(`- ${b}`);
  }
  for (const s of out.draft.detailsSections || []) {
    lines.push("");
    lines.push(`## ${s.heading}`.trim());
    lines.push(s.body.trim());
  }
  if (out.draft.faq?.length) {
    lines.push("");
    lines.push("## FAQ");
    for (const qa of out.draft.faq) {
      lines.push(`- Q: ${qa.q}`);
      lines.push(`  A: ${qa.a}`);
    }
  }
  if (out.draft.trustSignals?.length) {
    lines.push("");
    lines.push("## Trust & proof");
    for (const t of out.draft.trustSignals) lines.push(`- ${t}`);
  }
  for (const m of out.factMap.missingClaims || []) {
    lines.push("");
    lines.push(`[NEEDS_VERIFICATION: ${m}]`);
  }
  return lines.join("\n").trim() + "\n";
}

// -----------------------
// Main: generate draft JSON (validated)
// -----------------------

export async function generateFaqOrTruthDraft(args: {
  domain: string;
  industry?: string;
  geo?: string;
  language?: string;
  questionText: string;
  deltaType: "SITE_MISSING" | "LLM_WEAK" | "BOTH";
  targetUrl: string;
}) {
  const customer = await prisma.customer.findUnique({ where: { domain: args.domain } });
  if (!customer) throw new Error(`customer_not_found: ${args.domain}`);

  const [claims, evidence, probe] = await Promise.all([
    getVerifiedClaims(customer.id),
    getSiteEvidence(customer.id),
    getProbeAnswers(customer.id, args.questionText),
  ]);

  const prompt = faqPromptTemplate({
    domain: args.domain,
    industry: args.industry || "unknown",
    geo: args.geo || "unknown",
    language: args.language || "en",
    questionText: args.questionText,
    deltaType: args.deltaType,
    targetUrl: args.targetUrl,
    verifiedClaimsJson: toJson(claims),
    siteEvidenceJson: toJson(evidence),
    probeAnswersJson: toJson(probe),
  });

  const raw = await callOpenAIJson(prompt);
  const parsed = FaqOrTruthAssetSchema.parse(raw);

  // Ensure missingClaims is in sync with markers, as a safety net.
  const markers = extractNeedsVerificationMarkers(JSON.stringify(parsed));
  const mergedMissing = Array.from(new Set([...(parsed.factMap.missingClaims || []), ...markers].filter(Boolean)));
  return {
    ...parsed,
    slug: parsed.slug || slugify(parsed.title),
    factMap: { ...parsed.factMap, missingClaims: mergedMissing },
  };
}

export async function generateBlogDraft(args: {
  domain: string;
  industry?: string;
  geo?: string;
  language?: string;
  questionText: string;
  targetUrl: string;
  relatedQuestions?: string[];
}) {
  const customer = await prisma.customer.findUnique({ where: { domain: args.domain } });
  if (!customer) throw new Error(`customer_not_found: ${args.domain}`);

  const [claims, evidence, probe] = await Promise.all([
    getVerifiedClaims(customer.id),
    getSiteEvidence(customer.id),
    getProbeAnswers(customer.id, args.questionText),
  ]);

  const prompt = blogPromptTemplate({
    domain: args.domain,
    industry: args.industry || "unknown",
    geo: args.geo || "unknown",
    language: args.language || "en",
    questionText: args.questionText,
    relatedQuestionsJson: toJson(args.relatedQuestions || []),
    verifiedClaimsJson: toJson(claims),
    siteEvidenceJson: toJson(evidence),
    probeAnswersJson: toJson(probe),
    targetUrl: args.targetUrl,
  });

  const raw = await callOpenAIJson(prompt);
  const parsed = BlogAssetSchema.parse(raw);
  if (!parsed.slug) parsed.slug = slugify(parsed.title);
  return parsed;
}

export async function generateProductUpdateDraft(args: {
  domain: string;
  productSlugOrName: string;
  questionText: string;
  targetUrl: string;
}) {
  const customer = await prisma.customer.findUnique({ where: { domain: args.domain } });
  if (!customer) throw new Error(`customer_not_found: ${args.domain}`);

  const product = await prisma.product.findFirst({
    where: {
      customerId: customer.id,
      OR: [
        { handle: args.productSlugOrName },
        { title: { equals: args.productSlugOrName, mode: "insensitive" } as any },
        { title: { contains: args.productSlugOrName, mode: "insensitive" } as any },
      ],
    },
    select: {
      handle: true,
      title: true,
      tags: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      descriptionHtml: true,
      specs: true,
    },
  });

  const [claims, evidence, probe] = await Promise.all([
    getVerifiedClaims(customer.id),
    getSiteEvidence(customer.id),
    getProbeAnswers(customer.id, args.questionText),
  ]);

  const prompt = productUpdatePromptTemplate({
    domain: args.domain,
    productSlugOrName: args.productSlugOrName,
    questionText: args.questionText,
    currentProductJson: toJson(
      product
        ? {
            handle: product.handle,
            title: product.title,
            tags: product.tags || "",
            priceMin: product.priceMin,
            priceMax: product.priceMax,
            currency: product.currency,
            // Keep this short to reduce prompt bloat.
            description: String(product.descriptionHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 900),
            specs: product.specs || {},
          }
        : {},
    ),
    verifiedClaimsJson: toJson(claims),
    siteEvidenceJson: toJson(evidence),
    probeAnswersJson: toJson(probe),
    targetUrl: args.targetUrl,
  });

  const raw = await callOpenAIJson(prompt);
  const parsed = ProductUpdateAssetSchema.parse(raw);
  if (!parsed.productSlug) parsed.productSlug = args.productSlugOrName;
  return parsed;
}

