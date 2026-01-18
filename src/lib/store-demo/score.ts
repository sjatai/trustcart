import type { PublishedAnswer, ViewCounters } from "./state";

export type ScoreBreakdown = {
  base: number;
  productCoverage: number;
  blogCoverage: number;
  faqCoverage: number;
  engagement: number;
  total: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function computeLlMReadinessScore(input: {
  productsTotal: number;
  blogsTotal: number;
  faqsTotal: number;
  published: PublishedAnswer[];
  views: ViewCounters;
}): ScoreBreakdown {
  const base = 38;

  const productIds = new Set(input.published.filter((p) => p.kind === "product").map((p) => p.sourceId));
  const blogIds = new Set(input.published.filter((p) => p.kind === "blog").map((p) => p.sourceId));
  const faqIds = new Set(input.published.filter((p) => p.kind === "faq").map((p) => p.sourceId));

  const productCoverage = input.productsTotal > 0 ? (Math.min(productIds.size, input.productsTotal) / input.productsTotal) * 30 : 0;
  const blogCoverage = input.blogsTotal > 0 ? (Math.min(blogIds.size, input.blogsTotal) / input.blogsTotal) * 15 : 0;
  const faqCoverage = input.faqsTotal > 0 ? (Math.min(faqIds.size, input.faqsTotal) / input.faqsTotal) * 10 : 0;

  const viewTotal = Object.values(input.views || {}).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  const engagement = clamp(Math.log2(viewTotal + 1) * 3.5, 0, 7);

  const total = clamp(Math.round(base + productCoverage + blogCoverage + faqCoverage + engagement), 0, 100);
  return {
    base,
    productCoverage: Math.round(productCoverage),
    blogCoverage: Math.round(blogCoverage),
    faqCoverage: Math.round(faqCoverage),
    engagement: Math.round(engagement),
    total,
  };
}

