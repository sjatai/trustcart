import { generateBlogDraft, generateFaqOrTruthDraft, generateProductUpdateDraft, renderBlogToAssetContent, renderFaqOrTruthToAssetContent, renderProductUpdateToBodyMd } from "@/lib/contentEngine";

export type DraftType = "FAQ" | "BLOG" | "TRUTH_BLOCK" | "PRODUCT_UPDATE";

export type DraftPayload = {
  type: DraftType;
  title: string;
  slug: string;
  targetUrl: string;
  content: {
    shortAnswer: string;
    bodyMarkdown: string;
    factsUsed: string[];
    needsVerification: string[];
    llmEvidence: Array<{ provider: string; quote: string; confidence: number }>;
  };
};

export async function generateDraft(args: {
  domain: string;
  type: DraftType;
  questionText: string;
  targetUrl: string;
  productSlugOrName?: string;
}) : Promise<{ draft: DraftPayload; raw: any }> {
  if (args.type === "BLOG") {
    const out = await generateBlogDraft({
      domain: args.domain,
      questionText: args.questionText,
      targetUrl: args.targetUrl,
    });
    const content = renderBlogToAssetContent(out);
    return {
      raw: out,
      draft: {
        type: "BLOG",
        title: out.title,
        slug: out.slug,
        targetUrl: out.targetUrl,
        content: {
          shortAnswer: out.metaDescription || "",
          bodyMarkdown: content,
          factsUsed: out.factMap.usedClaims || [],
          needsVerification: out.factMap.missingClaims || [],
          llmEvidence: (out.evidence.llmEvidence || []).map((e) => ({
            provider: e.provider,
            quote: e.excerpt,
            confidence: 50,
          })),
        },
      },
    };
  }

  if (args.type === "PRODUCT_UPDATE") {
    const out = await generateProductUpdateDraft({
      domain: args.domain,
      productSlugOrName: args.productSlugOrName || "product",
      questionText: args.questionText,
      targetUrl: args.targetUrl,
    });
    const bodyMd = renderProductUpdateToBodyMd(out);
    return {
      raw: out,
      draft: {
        type: "PRODUCT_UPDATE",
        title: out.productSlug,
        slug: out.productSlug,
        targetUrl: out.targetUrl,
        content: {
          shortAnswer: out.draft.heroBullets?.[0] || "",
          bodyMarkdown: bodyMd,
          factsUsed: out.factMap.usedClaims || [],
          needsVerification: out.factMap.missingClaims || [],
          llmEvidence: (out.evidence.llmEvidence || []).map((e) => ({
            provider: e.provider,
            quote: e.excerpt,
            confidence: 50,
          })),
        },
      },
    };
  }

  const out = await generateFaqOrTruthDraft({
    domain: args.domain,
    questionText: args.questionText,
    deltaType: "BOTH",
    targetUrl: args.targetUrl,
  });
  const content = renderFaqOrTruthToAssetContent(out);
  return {
    raw: out,
    draft: {
      type: args.type === "TRUTH_BLOCK" ? "TRUTH_BLOCK" : "FAQ",
      title: out.title,
      slug: out.slug,
      targetUrl: out.targetUrl,
      content: {
        shortAnswer: out.draft.shortAnswer,
        bodyMarkdown: content,
        factsUsed: out.factMap.usedClaims || [],
        needsVerification: out.factMap.missingClaims || [],
        llmEvidence: (out.evidence.llmEvidence || []).map((e) => ({
          provider: e.provider,
          quote: e.excerpt,
          confidence: 50,
        })),
      },
    },
  };
}

