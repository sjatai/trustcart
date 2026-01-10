"use client";

import { useEffect, useMemo, useState } from "react";
import type { RailState } from "@/components/MissionControlShell";

type TabKey = "intent" | "knowledge" | "scores" | "growth";

function Icon({ name }: { name: TabKey }) {
  const common = "h-5 w-5";
  switch (name) {
    case "intent":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 17l6-6 4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "knowledge":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 19V6a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M19 19V6" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "scores":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 19V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 19V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M19 19V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "growth":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 16l4-4 3 3 5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 8h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

function tabLabel(t: TabKey) {
  if (t === "intent") return "Intent";
  if (t === "knowledge") return "Knowledge";
  if (t === "scores") return "Scores";
  return "Growth";
}

export function RightRail({
  railState,
  setRailState,
  refreshToken = 0,
}: {
  railState: RailState;
  setRailState: (s: RailState) => void;
  refreshToken?: number;
}) {
  const [tab, setTab] = useState<TabKey>("growth");
  const [hasIntentData, setHasIntentData] = useState<boolean | null>(null);
  const [sessionGraph, setSessionGraph] = useState<any>(null);
  const [claims, setClaims] = useState<any[] | null>(null);
  const [trust, setTrust] = useState<any>(null);
  const [visibility, setVisibility] = useState<any>(null);
  const [ruleSets, setRuleSets] = useState<any[] | null>(null);
  const [receipts, setReceipts] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);

        const safeJson = async (url: string) => {
          const res = await fetch(url);
          const json = await res.json().catch(() => ({}));
          return { ok: res.ok, json };
        };

        // Always keep intent graph availability up to date
        const q = await safeJson("/api/questions?domain=reliablenissan.com");
        if (!alive) return;
        const n = Array.isArray(q.json?.questions) ? q.json.questions.length : 0;
        setHasIntentData(n > 0);

        // Always keep audit receipts available (canonical ledger)
        const rc = await safeJson("/api/receipts?domain=reliablenissan.com&limit=50");
        if (!alive) return;
        setReceipts(Array.isArray(rc.json?.receipts) ? rc.json.receipts : []);

        // Fetch per-tab data (and refresh after each run via refreshToken)
        if (tab === "intent") {
          const g = await safeJson("/api/graph/session");
          if (!alive) return;
          setSessionGraph(g.json || null);
        }
        if (tab === "knowledge") {
          const k = await safeJson("/api/knowledge/claims");
          if (!alive) return;
          setClaims(Array.isArray(k.json?.claims) ? k.json.claims : []);
        }
        if (tab === "scores") {
          const t = await safeJson("/api/scores/trust/latest");
          const v = await safeJson("/api/scores/visibility/latest");
          if (!alive) return;
          setTrust(t.json || null);
          setVisibility(v.json || null);
        }
        if (tab === "growth") {
          const r = await safeJson("/api/rulesets?domain=reliablenissan.com");
          if (!alive) return;
          setRuleSets(Array.isArray(r.json?.ruleSets) ? r.json.ruleSets : []);
        }

        setLastUpdatedAt(Date.now());
      } catch {
        if (alive) setHasIntentData(false);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [tab, refreshToken]);

  const tabs = useMemo(() => ["intent", "knowledge", "scores", "growth"] as TabKey[], []);

  if (railState === "collapsed") {
    return (
      <nav aria-label="Intelligence tabs" className="flex h-full flex-col items-center gap-2 py-3">
        {tabs.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              title={tabLabel(t)}
              aria-label={tabLabel(t)}
              className={[
                "flex h-10 w-10 items-center justify-center rounded-xl border text-slate-700",
                active ? "border-[rgba(27,98,248,0.45)] bg-[rgba(27,98,248,0.08)] text-slate-900" : "border-transparent hover:border-[var(--te-border)] hover:bg-[#fbfcff]",
              ].join(" ")}
              onClick={() => {
                setTab(t);
                setRailState("normal");
              }}
            >
              <Icon name={t} />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--te-border)] px-3 py-2">
        {tabs.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              className={[
                "flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium",
                active ? "bg-[rgba(27,98,248,0.08)] text-slate-900" : "text-slate-600 hover:bg-[#fbfcff]",
              ].join(" ")}
              onClick={() => setTab(t)}
            >
              <Icon name={t} />
              {tabLabel(t)}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 pb-8">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12px] text-[var(--te-muted)]">
            {loading ? "Updating…" : lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : ""}
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--te-border)] bg-white px-2 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
            onClick={() => {
              // local refresh: changing tab to itself won't re-trigger, so bump via a no-op state update pattern
              setLastUpdatedAt(null);
              // rely on refreshToken from parent after runs; for manual, just refetch via setting loading
              setLoading(true);
              setTimeout(() => setLoading(false), 0);
            }}
            title="Refresh"
            aria-label="Refresh"
          >
            Refresh
          </button>
        </div>

        {tab === "intent" ? (
          <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
            <div className="text-[14px] font-semibold text-[var(--te-text)]">Intent</div>
            <div className="mt-2 text-[12px] text-[var(--te-muted)]">Audit surface only. No execution here.</div>
            {sessionGraph?.primaryIntent ? (
              <div className="mt-3 grid gap-2">
                <div className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[13px] text-slate-700">
                  <span className="font-semibold">Primary:</span> {sessionGraph.primaryIntent}{" "}
                  {typeof sessionGraph.confidence === "number" ? (
                    <span className="text-[12px] text-[var(--te-muted)]">(confidence {sessionGraph.confidence})</span>
                  ) : null}
                </div>
                {sessionGraph.auditSummary ? (
                  <div className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[13px] text-slate-700">
                    {sessionGraph.auditSummary}
                  </div>
                ) : null}
              </div>
            ) : null}
            {hasIntentData ? (
              <div className="mt-4 text-[13px] text-slate-700">
                Intent graph available. (Open “Intent Graph” view via command.)
              </div>
            ) : (
              <div className="mt-4 text-[13px] text-slate-700">
                No intent graph yet. <span className="font-semibold">Run:</span> “Generate intent graph”
              </div>
            )}
          </div>
        ) : null}

        {tab === "knowledge" ? (
          <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
            <div className="text-[14px] font-semibold text-[var(--te-text)]">Knowledge</div>
            <div className="mt-2 text-[13px] text-slate-700">Verified claims (from onboarding crawl + extraction).</div>
            <div className="mt-3 text-[12px] text-[var(--te-muted)]">
              {claims ? `${claims.length} claims` : "Loading…"}
            </div>
            <div className="mt-3 space-y-2">
              {(claims || []).slice(0, 5).map((c: any) => (
                <div key={c.id} className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[13px] text-slate-700">
                  <div className="font-semibold">{c.key}</div>
                  <div className="mt-1 text-[12px] text-[var(--te-muted)]">{String(c.value || "").slice(0, 90)}{String(c.value || "").length > 90 ? "…" : ""}</div>
                </div>
              ))}
              {claims && claims.length === 0 ? (
                <div className="mt-2 text-[13px] text-slate-700">No claims yet. Run: “Onboard reliablenissan.com”.</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "scores" ? (
          <div className="grid gap-3">
            <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">Trust Score</div>
              <div className="mt-2 text-[13px] text-slate-700">
                {trust?.latest?.total ? (
                  <>
                    total <span className="font-semibold">{trust.latest.total}/100</span>{" "}
                    {trust?.policy?.zone ? <span className="text-[12px] text-[var(--te-muted)]">({trust.policy.zone})</span> : null}
                  </>
                ) : (
                  "No trust snapshot yet. Run: “Onboard …”"
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">AI Visibility</div>
              <div className="mt-2 text-[13px] text-slate-700">
                {visibility?.latest?.total ? (
                  <>
                    total <span className="font-semibold">{visibility.latest.total}/100</span>{" "}
                    <span className="text-[12px] text-[var(--te-muted)]">
                      (coverage {visibility.latest.coverage}, proof {visibility.latest.proof})
                    </span>
                  </>
                ) : (
                  "No visibility snapshot yet. Run: “Probe ChatGPT + Gemini …”"
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "growth" ? (
          <div className="grid gap-3">
            <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">Growth</div>
              <div className="mt-2 text-[13px] text-slate-700">RuleSets (execution plans) available for this customer.</div>
              <div className="mt-3 space-y-2">
                {(ruleSets || []).map((r: any) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[13px] text-slate-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-[12px] text-[var(--te-muted)]">{r.active ? "active" : "off"}</div>
                    </div>
                  </div>
                ))}
                {ruleSets && ruleSets.length === 0 ? (
                  <div className="mt-2 text-[13px] text-slate-700">No rulesets yet. Seed DB, then refresh.</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">Receipts (audit)</div>
              <div className="mt-2 text-[13px] text-slate-700">Canonical ledger entries (READ/DECIDE/EXECUTE/PUBLISH).</div>
              <div className="mt-3 space-y-2">
                {(receipts || []).slice(0, 20).map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[13px] font-semibold text-[var(--te-text)]" style={{ wordBreak: "break-word" }}>
                        {r.summary}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="te-pill">{r.kind}</span>
                        <span className="te-pill">{r.actor}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--te-muted)]">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                    </div>
                  </div>
                ))}
                {receipts && receipts.length === 0 ? (
                  <div className="mt-2 text-[13px] text-slate-700">No receipts yet. Run any command.</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}


