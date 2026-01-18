"use client";

import { useEffect, useState } from "react";

type DemandSignal = {
  id: string;
  impactScore: number;
  taxonomy: string;
  title: string;
  text: string;
  state: string;
  gaps: Array<{ id: string }>;
};

export function DemandSignalsPanel({ domain }: { domain: string }) {
  const [signals, setSignals] = useState<DemandSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/questions?domain=${encodeURIComponent(domain)}`);
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (json?.ok && Array.isArray(json.questions)) {
          const normalized: DemandSignal[] = (json.questions as any[]).map((q) => ({
            id: String(q.id),
            impactScore: Number(q.impactScore ?? 0),
            taxonomy: String(q.taxonomy ?? ""),
            title: String(q.title ?? ""),
            text: String(q.text ?? ""),
            state: String(q.state ?? ""),
            gaps: Array.isArray(q.gaps) ? q.gaps : [],
          }));

          const sorted = normalized
            .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
            .slice(0, 40);

          setSignals(sorted);
        } else {
          setSignals([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [domain]);

  return (
    <div className="mt-3 space-y-2">
      {loading ? (
        <div className="text-[12px] text-[var(--te-muted)]">Loading…</div>
      ) : signals.length ? (
        signals.map((signal) => (
          <div key={signal.id} className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--te-muted)]">
              <span>Impact {signal.impactScore ?? "-"}</span>
              <span>{signal.taxonomy}</span>
              <span>{signal.state}</span>
              <span className="relative group cursor-help">
                <span>{(signal.gaps || []).length} answer gaps</span>
                <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-56 -translate-x-1/2 rounded-md bg-black px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                  Missing site facts or weak LLM answers
                </span>
              </span>
            </div>
            <div className="mt-2 text-[13px] font-semibold text-[var(--te-text)]">
              {signal.title || signal.text}
            </div>
          </div>
        ))
      ) : (
        <div className="text-[12px] text-[var(--te-muted)]">No demand signals yet.</div>
      )}
    </div>
  );
}

