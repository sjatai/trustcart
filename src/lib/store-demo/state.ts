export type StoreContentKind = "product" | "blog" | "faq";

export type PublishedAnswer = {
  id: string;
  kind: StoreContentKind;
  sourceId: string; // slug or stable id
  sourceLabel: string; // human label (product name, blog headline, etc.)
  question: string;
  answer: string;
  createdAt: string; // ISO
};

export type ViewCounters = Record<string, number>;

export const STORE_DEMO_KEYS = {
  published: "te_store_demo_published_v1",
  views: "te_store_demo_views_v1",
  baseline: "te_store_demo_baseline_v1",
  onboarded: "te_store_demo_onboarded_v1",
  discoveryReadyAt: "te_store_demo_discovery_ready_at_v1",
} as const;

export function stableIdFromParts(...parts: string[]): string {
  const raw = parts.join("|").toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `id_${hash.toString(16)}`;
}

