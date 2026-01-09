"use client";

import { useEffect, useState } from "react";

type RuleSet = { id: string; name: string; description?: string; active: boolean; updatedAt: string; json: any };

export function GrowthPanel({ domain = "reliablenissan.com" }: { domain?: string }) {
  const [trust, setTrust] = useState<any>(null);
  const [rules, setRules] = useState<RuleSet[]>([]);
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<any>(null);
  const [lastCampaignId, setLastCampaignId] = useState<string>("");

  async function refresh() {
    const [t, r] = await Promise.all([
      fetch("/api/scores/trust/latest").then((x) => x.json()),
      fetch(`/api/rulesets?domain=${encodeURIComponent(domain)}`).then((x) => x.json()),
    ]);
    setTrust(t);
    setRules(r.ruleSets || []);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function previewSegment(ruleSetId: string) {
    setStatus("Previewing…");
    const res = await fetch("/api/growth/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, ruleSetId }),
    });
    const j = await res.json();
    setPreview(j.snapshot || null);
    setStatus(j.ok ? "Preview created." : "Preview failed.");
  }

  async function runDryRun(ruleSetId: string) {
    setStatus("Creating dry-run…");
    const res = await fetch("/api/growth/campaigns/dry-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, ruleSetId }),
    });
    const j = await res.json();
    setLastCampaignId(j.campaignId || "");
    setStatus(j.ok ? `Dry-run campaign created.` : "Dry-run failed.");
  }

  async function approve() {
    if (!lastCampaignId) return;
    setStatus("Approving…");
    const res = await fetch(`/api/growth/campaigns/${lastCampaignId}/approve`, { method: "POST" });
    const j = await res.json();
    setStatus(j.ok ? "Approved." : "Approve failed.");
  }

  async function execute() {
    if (!lastCampaignId) return;
    setStatus("Executing…");
    const res = await fetch(`/api/growth/campaigns/${lastCampaignId}/execute`, { method: "POST" });
    const j = await res.json();
    setStatus(j.ok ? `Executed. Sent ${j.sent}.` : j.message || "Execute blocked.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      <div className="te-stepCard">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Readiness</div>
          <div className="te-meta">{status || "—"}</div>
        </div>
        <div className="te-meta" style={{ marginTop: 8 }}>
          Trust Score: <b style={{ color: "var(--te-text)" }}>{trust?.latest?.total ?? "—"}</b>{" "}
          {trust?.policy?.zone ? <span>({trust.policy.zone})</span> : null}
        </div>
        <div className="te-meta" style={{ marginTop: 6 }}>
          Allowed actions: {trust?.policy?.allowed?.slice(0, 6)?.join(", ") || "—"}
        </div>
      </div>

      <div className="te-stepCard">
        <div style={{ fontWeight: 800 }}>RuleSets</div>
        <div className="te-meta" style={{ marginTop: 6 }}>
          Preview segment and run dry-run campaigns.
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {rules.map((r) => (
            <div key={r.id} className="te-stepCard" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>{r.name}</div>
                <div className="te-meta">{r.active ? "active" : "off"}</div>
              </div>
              <div className="te-meta" style={{ marginTop: 6 }}>{r.description || "—"}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="te-tab" onClick={() => previewSegment(r.id)}>
                  Preview segment
                </button>
                <button type="button" className="te-tab te-tabActive" onClick={() => runDryRun(r.id)}>
                  Run dry-run
                </button>
              </div>
            </div>
          ))}
          {rules.length === 0 ? <div className="te-meta">No rulesets yet.</div> : null}
        </div>
      </div>

      {preview ? (
        <div className="te-stepCard">
          <div style={{ fontWeight: 800 }}>Preview results</div>
          <div className="te-meta" style={{ marginTop: 6 }}>
            size <b style={{ color: "var(--te-text)" }}>{preview.size}</b>, suppressed{" "}
            <b style={{ color: "var(--te-text)" }}>{preview.suppressed}</b>
          </div>
          <pre style={{ marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(preview.reasons, null, 2)}</pre>
        </div>
      ) : null}

      {lastCampaignId ? (
        <div className="te-stepCard">
          <div style={{ fontWeight: 800 }}>Campaign actions</div>
          <div className="te-meta" style={{ marginTop: 6 }}>
            Latest campaign: <code style={{ fontSize: 12 }}>{lastCampaignId}</code>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="te-tab" onClick={approve}>
              Approve
            </button>
            <button type="button" className="te-tab te-tabActive" onClick={execute}>
              Execute only safe segment
            </button>
          </div>
          <div className="te-meta" style={{ marginTop: 10 }}>
            If requiresApproval is true and not approved, execution will be blocked with a message.
          </div>
        </div>
      ) : null}
    </div>
  );
}


