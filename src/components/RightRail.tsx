"use client";

import { useEffect, useMemo, useState } from "react";
import { IntentQuestionList } from "@/components/intent/IntentQuestionList";
import type { ReactNode } from "react";
import type { RailState } from "@/components/MissionControlShell";
import { cleanSnippet } from "@/lib/evidenceFormat";
import { formatEvidenceForUI } from "@/lib/evidenceFormat";
import { env } from "@/lib/env";
import { DemandSignalsPanel } from "@/components/discovery/DemandSignalsPanel";
import { RecommendationsPanel } from "@/components/discovery/RecommendationsPanel";

type TabKey = "knowledge" | "scores" | "intent" | "receipts";

function useSectionToggle(key: string) {
  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`te_inspect_${key}`);
    if (stored === "closed") {
      setOpen(false);
    } else if (stored === "open") {
      setOpen(true);
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(`te_inspect_${key}`, open ? "open" : "closed");
  }, [hydrated, key, open]);

  return [open, setOpen] as const;
}

function SectionCard({
  title,
  description,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-[var(--te-border)] bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--te-border)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[14px] font-semibold text-[var(--te-text)]">{title}</div>
            {meta ? <span className="text-[12px] text-[var(--te-muted)]">{meta}</span> : null}
          </div>
          {description ? <div className="mt-1 text-[12px] text-[var(--te-muted)]">{description}</div> : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          className="rounded-full border border-[var(--te-border)] bg-white p-1 text-[var(--te-muted)] hover:border-[rgba(27,98,248,0.45)] hover:text-[var(--te-text)]"
          onClick={onToggle}
        >
          <svg
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
          >
            <path d="M5 8l5 5 5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open ? <div className="px-4 pb-4 pt-3">{children}</div> : null}
    </div>
  );
}

function Icon({ name }: { name: TabKey }) {
  const common = "h-4 w-4";
  switch (name) {
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
    case "intent":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 16l4-4 3 3 5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 8h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "receipts":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8 3h7l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M15 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

function tabLabel(t: TabKey) {
  if (t === "knowledge") return "Knowledge";
  if (t === "scores") return "Scores";
  if (t === "intent") return "Intent";
  return "Receipts";
}

export function RightRail({
  railState,
  setRailState,
  refreshToken = 0,
  customerDomain,
  footer,
}: {
  railState: RailState;
  setRailState: (s: RailState) => void;
  refreshToken?: number;
  customerDomain?: string;
  footer?: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("knowledge");
  const [claims, setClaims] = useState<any[] | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [trust, setTrust] = useState<any>(null);
  const [visibility, setVisibility] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useSectionToggle("knowledge");
  const [demandOpen, setDemandOpen] = useSectionToggle("demand_signals");
  const [recsOpen, setRecsOpen] = useSectionToggle("recommendations");
  const domain =
    customerDomain ||
    env.NEXT_PUBLIC_TEST_DOMAIN ||
    env.NEXT_PUBLIC_PRESENTATION_DOMAIN ||
    env.NEXT_PUBLIC_DEMO_DOMAIN ||
    "sunnystep.com";
  const encodeDomain = encodeURIComponent(domain);
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

        // Always keep audit receipts available (canonical ledger)
        const rc = await safeJson(`/api/receipts?domain=${encodeDomain}&limit=50`);
        if (!alive) return;
        setReceipts(Array.isArray(rc.json?.receipts) ? rc.json.receipts : []);

        // Fetch per-tab data (and refresh after each run via refreshToken)
        if (tab === "knowledge") {
          const k = await safeJson(`/api/knowledge/claims?domain=${encodeDomain}`);
          if (!alive) return;
          setClaims(Array.isArray(k.json?.claims) ? k.json.claims : []);
        }
        if (tab === "scores") {
          const t = await safeJson(`/api/scores/trust/latest?domain=${encodeDomain}`);
          const v = await safeJson(`/api/scores/visibility/latest?domain=${encodeDomain}`);
          if (!alive) return;
          setTrust(t.json || null);
          setVisibility(v.json || null);
        }
        setLastUpdatedAt(Date.now());
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [tab, refreshToken, customerDomain, encodeDomain]);

  const tabs = useMemo(() => ["knowledge", "scores", "intent", "receipts"] as TabKey[], []);

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
                "flex h-9 w-9 items-center justify-center rounded-xl border text-slate-700",
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
                "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium",
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

      <div
        className={["min-h-0 flex-1 overflow-auto overscroll-contain p-4", footer ? "pb-28" : "pb-8"].join(" ")}
        style={{ scrollbarGutter: "stable" as any }}
      >
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

        {tab === "knowledge" ? (
          <SectionCard
            title="Knowledge"
            description="Verified claims (from onboarding crawl + extraction)."
            meta={claims ? `${claims.length} claims` : "Loading…"}
            open={knowledgeOpen}
            onToggle={() => setKnowledgeOpen((prev) => !prev)}
          >
            <div className="space-y-2">
              {(claims || [])
                // Hide raw crawl debug claims (page titles/excerpts) from the UI surface.
                // These are useful for internal traceability but not user-actionable.
                .filter((c: any) => !String(c?.key || "").startsWith("crawl."))
                .slice(0, 5)
                .map((c: any) => {
                  const isSelected = selectedClaimId === c.id;
                  const key = String(c.key || "");
                  const raw = String(c.value || "");
                  const isSnippetLike = key.toLowerCase().endsWith(".excerpt") || key.toLowerCase().endsWith(".title");
                  const cleaned = isSnippetLike ? cleanSnippet(raw) : raw.replace(/\s+/g, " ").trim();
                  const text = String(cleaned || "");
                  const evidence = Array.isArray(c.evidence) ? c.evidence : [];
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[13px] text-slate-700"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedClaimId((cur) => (cur === c.id ? null : c.id))}
                        aria-expanded={isSelected}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold" style={{ wordBreak: "break-word" }}>
                            {c.key}
                          </div>
                          <div className="text-[12px] text-[var(--te-muted)]">{evidence.length ? `${evidence.length} evidence` : "no evidence"}</div>
                        </div>
                        <div className="mt-1 text-[12px] text-[var(--te-muted)]">
                          {text.slice(0, 120)}
                          {text.length > 120 ? "…" : ""}
                        </div>
                      </button>

                      {isSelected ? (
                        <div className="mt-3 border-t border-[var(--te-border)] pt-3">
                          <div className="text-[12px] font-semibold text-[var(--te-text)]">Evidence</div>
                          <div className="mt-2 space-y-2">
                            {evidence.length ? (
                              (function () {
                                const seen = new Set<string>();
                                const deduped = evidence
                                  .map((e: any) => {
                                    const ev = formatEvidenceForUI({ url: String(e.url || ""), snippet: e.snippet });
                                    const signature = `${ev.label}|${ev.excerpt || ""}`;
                                    if (seen.has(signature)) return null;
                                    seen.add(signature);
                                    return { raw: e, ev };
                                  })
                                  .filter(Boolean)
                                  .slice(0, 5);
                                return deduped.length ? (
                                  deduped.map(({ raw, ev }: any) => (
                                    <div
                                      key={String(raw.id || ev.href)}
                                      className="rounded-lg border border-[var(--te-border)] bg-white px-2 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <a
                                          href={ev.href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="te-link"
                                          title={ev.href}
                                        >
                                          {ev.label}
                                        </a>
                                        {raw.crawlRunId ? (
                                          <span className="te-pill" title="crawlRunId">
                                            {String(raw.crawlRunId).slice(0, 10)}
                                          </span>
                                        ) : null}
                                      </div>
                                      {ev.excerpt ? <p className="text-xs text-muted">{ev.excerpt}</p> : null}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[12px] text-[var(--te-muted)]">Evidence duplicates filtered.</div>
                                );
                              })()
                            ) : (
                              <div className="text-[12px] text-[var(--te-muted)]">No evidence attached yet.</div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              {claims && claims.length === 0 ? (
                <div className="text-[13px] text-slate-700">
                  No claims yet. Run: <span className="font-semibold">“Onboard {domain}”</span>.
                </div>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        {tab === "knowledge" ? (
          <>
            <SectionCard
              title="Recommendations"
              description="Turn answer gaps into publishable, verifiable content."
              meta="Top 10"
              open={recsOpen}
              onToggle={() => setRecsOpen((prev) => !prev)}
            >
              <RecommendationsPanel domain={domain} />
            </SectionCard>

            <SectionCard
              title="Demand Signals"
              description="High-impact decision questions customers and AI ask before choosing this brand."
              open={demandOpen}
              onToggle={() => setDemandOpen((prev) => !prev)}
            >
              <DemandSignalsPanel domain={domain} />
            </SectionCard>
          </>
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
          </div>
        ) : null}

        {tab === "intent" ? (
          <div className="grid gap-3">
            <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
              <IntentQuestionList domain={domain} />
            </div>
          </div>
        ) : null}

        {tab === "receipts" ? (
            <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">Receipts (audit)</div>
              <div className="mt-2 text-[13px] text-slate-700">Canonical ledger entries (READ/DECIDE/EXECUTE/PUBLISH).</div>
              <div className="mt-3 space-y-2">
              {(receipts || []).slice(0, 50).map((r: any) => (
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
        ) : null}
      </div>

      {footer ? <div className="mt-auto border-t border-[var(--te-border)] bg-white">{footer}</div> : null}
    </div>
  );
}


