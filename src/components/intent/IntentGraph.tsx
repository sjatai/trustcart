"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";
import { Drawer } from "@/components/ui/Drawer";
import { colorForState } from "@/lib/intentColors";

type Q = {
  id: string;
  taxonomy: string;
  text: string;
  impactScore: number;
  state: string;
  recommendedAssetType: string;
  gaps: { id: string; gapType: string; severity: number; description?: string }[];
};

const TAXONOMY_ORDER = ["AVAILABILITY", "SUITABILITY", "RISK", "COST_VALUE", "NEXT_STEP"];

function sizeForImpact(impact: number) {
  const clamped = Math.max(40, Math.min(100, impact));
  return 46 + (clamped - 40) * 1.15; // 46..115
}

export function IntentGraph({ customerDomain }: { customerDomain?: string }) {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("Question");
  const [drawerBody, setDrawerBody] = useState<React.ReactNode>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const url = new URL("/api/intent/questions", window.location.origin);
        if (customerDomain) url.searchParams.set("customerDomain", customerDomain);
        const res = await fetch(url.toString());
        const json = await res.json();
        if (alive) setQuestions(json?.questions || []);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [customerDomain]);

  const { nodes, edges } = useMemo(() => {
    const byTax: Record<string, Q[]> = {};
    for (const q of questions) {
      const t = q.taxonomy || "OTHER";
      byTax[t] = byTax[t] || [];
      byTax[t].push(q);
    }

    const colX: Record<string, number> = {};
    TAXONOMY_ORDER.forEach((t, i) => (colX[t] = i * 220));
    colX.OTHER = TAXONOMY_ORDER.length * 220;

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const t of Object.keys(byTax)) {
      const col = colX[t] ?? colX.OTHER;
      const list = (byTax[t] || []).slice().sort((a, b) => b.impactScore - a.impactScore);
      list.forEach((q, idx) => {
        const s = sizeForImpact(q.impactScore);
        nodes.push({
          id: q.id,
          position: { x: col, y: idx * 120 },
          data: q,
          draggable: false,
          style: {
            width: s,
            height: s,
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
          },
        });
      });
    }

    // Minimal edges: connect within taxonomy to imply grouping
    for (const t of Object.keys(byTax)) {
      const list = (byTax[t] || []).slice().sort((a, b) => b.impactScore - a.impactScore);
      for (let i = 0; i < list.length - 1; i++) {
        edges.push({
          id: `${t}_${i}`,
          source: list[i].id,
          target: list[i + 1].id,
          style: { stroke: "#e6e8ef", strokeWidth: 1.5 },
        });
      }
    }

    return { nodes, edges };
  }, [questions]);

  return (
    <div>
      <div className="te-meta" style={{ marginTop: 8 }}>
        Node size = impact • Color = state (Unanswered gray, Weak yellow, Answered blue, Trusted green, Stale light gray)
      </div>

      <div style={{ height: 520, marginTop: 12, border: "1px solid var(--te-border)", borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 12 }}>
            <div className="te-skeleton" style={{ height: 12, width: "70%" }} />
            <div className="te-skeleton" style={{ height: 12, width: "55%", marginTop: 10 }} />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes.map((n) => {
              const q = n.data as Q;
              const color = colorForState(q.state);
              return {
                ...n,
                style: { ...(n.style || {}), borderColor: color, boxShadow: `0 0 0 4px ${color}22, var(--te-shadow-sm)` },
                data: { ...q, color },
              };
            })}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              const q = node.data as Q;
              setDrawerTitle(q.text);
              setDrawerBody(
                <div>
                  <div className="te-meta">Taxonomy</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{q.taxonomy}</div>
                  <div className="te-meta" style={{ marginTop: 10 }}>
                    Impact
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{q.impactScore}/100</div>
                  <div className="te-meta" style={{ marginTop: 10 }}>
                    State
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{q.state}</div>
                  <div className="te-meta" style={{ marginTop: 10 }}>
                    Missing proof
                  </div>
                  <ul className="te-stepList">
                    {(q.gaps || []).length === 0 ? <li>None (answerable)</li> : null}
                    {(q.gaps || []).map((g) => (
                      <li key={g.id}>{g.description || g.gapType}</li>
                    ))}
                  </ul>
                  <div className="te-meta" style={{ marginTop: 10 }}>
                    Recommended asset
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{q.recommendedAssetType}</div>
                  <div style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="te-button te-buttonSecondary"
                      onClick={() => {
                        navigator.clipboard?.writeText(`Generate Trust Pack for: ${q.text}`);
                      }}
                    >
                      Copy “Generate asset” prompt
                    </button>
                  </div>
                </div>
              );
              setDrawerOpen(true);
            }}
          >
            <Background gap={18} color="#EEF2F7" />
            <Controls />
          </ReactFlow>
        )}
      </div>

      <Drawer open={drawerOpen} title={drawerTitle} onClose={() => setDrawerOpen(false)}>
        {drawerBody}
      </Drawer>
    </div>
  );
}


