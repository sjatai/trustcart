"use client";

import { useCallback, useEffect, useState } from "react";

type RecommendationKind = "ENRICH" | "CREATE" | "PRODUCT_UPDATE";

type Recommendation = {
  id: string;
  kind: RecommendationKind;
  status?: string;
  title: string;
  reason: string;
  targetUrl: string;
  suggestedContent: string;
  llmEvidence?: any;
  questionId?: string | null;
  questionText?: string | null;
  productHandle?: string | null;
  productTitle?: string | null;
  publishTarget?: string | null;
  updatedAt?: string;
};

export function RecommendationsPanel({ domain }: { domain: string }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-recommendations?domain=${encodeURIComponent(domain)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Failed to load recommendations");
      }
      setRecommendations(json?.recommendations || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load recommendations");
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  function changeLabel(rec: Recommendation): string {
    const action = String(rec.llmEvidence?.action || "").toUpperCase();
    const target = String(rec.publishTarget || "").toUpperCase();
    if (target === "PRODUCT") return "Enrich PDP";
    if (target === "BLOG") return "New blog";
    if (target === "FAQ") return action === "UPDATE" ? "Update FAQ" : "New FAQ";
    return "Recommendation";
  }

  function shortWhy(rec: Recommendation): string {
    const s = String(rec.reason || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  }

  function storePathFor(rec: Recommendation): string {
    const t = String(rec.publishTarget || "").toUpperCase();
    if (t === "PRODUCT" && rec.productHandle) return `/products/${rec.productHandle}?rec=${encodeURIComponent(rec.id)}`;
    if (t === "BLOG") return `/blog?rec=${encodeURIComponent(rec.id)}`;
    return `/faq?rec=${encodeURIComponent(rec.id)}`;
  }

  async function openRecommended(rec: Recommendation) {
    setOpeningId(rec.id);
    try {
      const path = storePathFor(rec);
      if (typeof window !== "undefined") window.location.href = path;
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--te-border)] bg-[var(--te-surface)]">
      {loading ? (
        <div className="p-4 text-[13px] text-[var(--te-muted)]">Loading…</div>
      ) : error ? (
        <div className="p-4 text-[13px] text-red-600">{error}</div>
      ) : recommendations.length === 0 ? (
        <div className="p-4 text-[13px] text-[var(--te-muted)]">No recommendations yet.</div>
      ) : (
        <div className="divide-y divide-[var(--te-border)]">
          {recommendations.map((rec) => (
            <div key={rec.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-[13px] font-semibold text-[var(--te-text)]">
                  {rec.title}
                </div>
                <span className="text-[12px] text-[var(--te-muted)]">{changeLabel(rec)}</span>
              </div>
              <div className="mt-2 text-[12px] text-[var(--te-muted)]">{shortWhy(rec)}</div>
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-[rgba(27,98,248,0.25)] bg-[rgba(27,98,248,0.06)] px-3 py-2 text-[12px] font-semibold text-slate-900 hover:bg-[rgba(27,98,248,0.09)]"
                  onClick={() => void openRecommended(rec)}
                  disabled={openingId === rec.id}
                >
                  {openingId === rec.id ? "Opening…" : "Open recommended content"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
