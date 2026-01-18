"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";

type Question = {
  id: string;
  taxonomy: "AVAILABILITY" | "SUITABILITY" | "RISK" | "COST_VALUE" | "NEXT_STEP";
  text: string;
  impactScore: number;
  state: "UNANSWERED" | "WEAK" | "ANSWERED" | "STALE" | "TRUSTED";
  recommendedAssetType: string;
  needs: { id: string; claimKey: string; claimId?: string | null; required: boolean }[];
  gaps: { id: string; gapType: string; severity: number; description?: string | null }[];
};

const CLUSTERS: Array<{ key: Question["taxonomy"]; title: string; desc: string }> = [
  { key: "AVAILABILITY", title: "Availability", desc: "Is it available now? Hours, stock, appointments." },
  { key: "SUITABILITY", title: "Suitability", desc: "Is this right for me? Fit, model guidance, use case." },
  { key: "RISK", title: "Risk", desc: "What could go wrong? Policies, warranty, inspection, complaints." },
  { key: "COST_VALUE", title: "Cost / Value", desc: "Price, trade-in, financing, fees, offers." },
  { key: "NEXT_STEP", title: "Next Step", desc: "How do I do it? Booking, docs, contact, CTAs." },
];

function statePill(state: Question["state"]) {
  const map: Record<string, { label: string; bg: string; border: string }> = {
    UNANSWERED: { label: "Unanswered", bg: "#F2F4F7", border: "#D0D5DD" },
    WEAK: { label: "Weak", bg: "rgba(242,201,76,0.18)", border: "rgba(242,201,76,0.55)" },
    ANSWERED: { label: "Answered", bg: "rgba(27,98,248,0.12)", border: "rgba(27,98,248,0.45)" },
    TRUSTED: { label: "Trusted", bg: "rgba(18,183,106,0.12)", border: "rgba(18,183,106,0.45)" },
    STALE: { label: "Stale", bg: "#F3F4F6", border: "#E5E7EB" },
  };
  const s = map[state] || map.UNANSWERED;
  return (
    <span style={{ border: `1px solid ${s.border}`, background: s.bg, borderRadius: 999, padding: "4px 8px", fontSize: 12 }}>
      {s.label}
    </span>
  );
}

export function ClusteredBoardView({ domain = "sunnystep.com" }: { domain?: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("Question");
  const [drawerBody, setDrawerBody] = useState<React.ReactNode>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/questions?domain=${encodeURIComponent(domain)}`);
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setQuestions(json?.questions || []);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [domain]);

  const grouped = useMemo(() => {
    const by: Record<string, Question[]> = {};
    for (const q of questions) {
      by[q.taxonomy] = by[q.taxonomy] || [];
      by[q.taxonomy].push(q);
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => b.impactScore - a.impactScore);
    return by;
  }, [questions]);

  if (loading) {
    return (
      <div style={{ marginTop: 12 }}>
        <div className="te-skeleton" style={{ height: 12, width: "60%" }} />
        <div className="te-skeleton" style={{ height: 12, width: "45%", marginTop: 10 }} />
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="te-stepCard" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800 }}>No intent graph yet.</div>
        <div className="te-meta" style={{ marginTop: 6 }}>
          Run: “Generate intent graph”
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="te-stepCard">
        <div style={{ fontWeight: 800 }}>Legend</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {statePill("UNANSWERED")}
          {statePill("WEAK")}
          {statePill("ANSWERED")}
          {statePill("TRUSTED")}
          {statePill("STALE")}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {CLUSTERS.map((c) => (
          <section key={c.key} className="te-stepCard">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>{c.title}</div>
              <div className="te-meta">{(grouped[c.key] || []).length} questions</div>
            </div>
            <div className="te-meta" style={{ marginTop: 6 }}>{c.desc}</div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {(grouped[c.key] || []).slice(0, 10).map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="te-stepCard"
                  style={{ textAlign: "left", cursor: "pointer", padding: 12, background: "#fff" }}
                  onClick={() => {
                    setDrawerTitle(q.text);
                    setDrawerBody(
                      <div>
                        <div className="te-meta">Why it matters</div>
                        <div style={{ marginTop: 6 }}>
                          High-impact questions block demand when unanswered. This one scores <b>{q.impactScore}/100</b>.
                        </div>
                        <div className="te-meta" style={{ marginTop: 12 }}>Recommended asset</div>
                        <div style={{ marginTop: 6, fontWeight: 800 }}>{q.recommendedAssetType}</div>
                        <div className="te-meta" style={{ marginTop: 12 }}>Missing proof</div>
                        <ul className="te-stepList">
                          {(q.gaps || []).length === 0 ? <li>None</li> : null}
                          {(q.gaps || []).map((g) => <li key={g.id}>{g.description || g.gapType}</li>)}
                        </ul>
                        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="te-button te-buttonSecondary"
                            onClick={() => navigator.clipboard?.writeText(`Generate asset draft for: ${q.text}`)}
                          >
                            Generate asset draft
                          </button>
                          <button
                            type="button"
                            className="te-button te-buttonSecondary"
                            onClick={() => navigator.clipboard?.writeText(`Mark stale: ${q.text}`)}
                          >
                            Mark stale
                          </button>
                          <button
                            type="button"
                            className="te-button te-buttonSecondary"
                            onClick={() => navigator.clipboard?.writeText(`Link claim for: ${q.text}`)}
                          >
                            Link claim
                          </button>
                        </div>
                      </div>
                    );
                    setDrawerOpen(true);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{q.text}</div>
                    <div className="te-meta">{q.impactScore}</div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    {statePill(q.state)}
                    <div className="te-meta">{q.taxonomy}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Drawer open={drawerOpen} title={drawerTitle} onClose={() => setDrawerOpen(false)}>
        {drawerBody}
      </Drawer>
    </div>
  );
}


