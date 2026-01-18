"use client";

import { useMemo, useState } from "react";
import { formatEvidenceForUI } from "@/lib/evidenceFormat";

type EvidenceDTO = { url: string; snippet?: string | null; capturedAt?: string };

export default function HoursCardClient(props: {
  customerDomain: string;
  locationSlug: string;
  hours: string[];
  evidence: EvidenceDTO[];
}) {
  const [showEvidence, setShowEvidence] = useState(false);

  const evidence = useMemo(() => {
    return (props.evidence || [])
      .filter((e) => e && e.url)
      .slice(0, 5)
      .map((e) => ({ raw: e, ui: formatEvidenceForUI({ url: e.url, snippet: e.snippet }) }));
  }, [props.evidence]);

  return (
    <section className="rn-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 className="rn-cardTitle">Hours</h2>
          <div className="rn-muted" style={{ marginTop: 6 }}>
            {props.customerDomain} • {props.locationSlug}
          </div>
        </div>
        {evidence.length ? (
          <button
            type="button"
            className="rn-ctaSecondary"
            onClick={() => setShowEvidence((s) => !s)}
            aria-expanded={showEvidence}
          >
            {showEvidence ? "Hide sources" : "Show sources"}
          </button>
        ) : null}
      </div>

      <div className="rn-bullets" style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {(props.hours || []).map((h) => (
          <div key={h}>
            <span className="rn-pill">Verified</span> {h}
          </div>
        ))}
      </div>

      {showEvidence && evidence.length ? (
        <div style={{ marginTop: 14 }}>
          <div className="rn-muted" style={{ marginBottom: 8 }}>
            Evidence (from crawl)
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {evidence.map(({ raw, ui }) => (
              <div key={ui.href} className="rn-card" style={{ padding: 12, background: "rgba(7, 19, 43, 0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <a href={ui.href} target="_blank" rel="noopener noreferrer" className="rn-link" title={ui.href}>
                    {ui.label}
                  </a>
                  {raw.capturedAt ? <div className="rn-muted">{new Date(raw.capturedAt).toLocaleDateString()}</div> : null}
                </div>
                {ui.excerpt ? <p className="text-xs text-muted">{ui.excerpt}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}


