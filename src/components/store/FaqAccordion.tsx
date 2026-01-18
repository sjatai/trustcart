"use client";

import { useMemo, useState } from "react";
import { TrustEyeInlineEditor } from "@/components/store/TrustEyeInlineEditor";

export function FaqAccordion({
  items,
  recommendations,
  domain,
  autoRecId,
}: {
  items: Array<{ id: string; slug: string; question: string; answer: string; sourceUrl?: string }>;
  recommendations: any[];
  domain: string;
  autoRecId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.sourceUrl || null);

  function cleanFaqTitle(q: string) {
    let s = (q || "").trim();
    s = s.replace(/^what is this page about:\s*/i, "");
    s = s.replace(/\?$/, "");
    s = s.replace(/-sunnystep-the most comfortable walking shoes$/i, "");
    s = s.replace(/-sunnystep$/i, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  const normalized = useMemo(() => items.map((it) => ({ ...it, id: it.id || it.sourceUrl || it.question })), [items]);

  function matchesQuestion(rec: any, q: string) {
    const a = String(q || "").toLowerCase();
    const b = String(rec?.questionText || rec?.title || "").toLowerCase();
    if (!a || !b) return false;
    if (b.includes(a.slice(0, Math.min(24, a.length)))) return true;
    // keyword match for policy-style FAQs
    const keys = ["shipping", "delivery", "returns", "exchange", "refund", "warranty", "pickup", "store"];
    const hit = keys.some((k) => a.includes(k) && b.includes(k));
    return hit;
  }

  return (
    <div className="grid gap-3">
      {(() => {
        // New FAQ recommendations should surface at the top (not bundled at the bottom).
        const newFaq = (recommendations || []).filter(
          (r: any) => String(r.publishTarget) === "FAQ" && String(r.llmEvidence?.action || "").toUpperCase() === "CREATE",
        );
        if (!newFaq.length) return null;
        return <TrustEyeInlineEditor domain={domain} recommendations={newFaq as any} autoOpenAll />;
      })()}

      {normalized.map((it) => {
        const open = openId === it.id;
        const relevant = (recommendations || []).filter(
          (r: any) => String(r.publishTarget) === "FAQ" && matchesQuestion(r, it.question),
        );
        const updateRequired = relevant.some((r: any) => String(r.llmEvidence?.action || "").toUpperCase() === "UPDATE");
        return (
          <div key={it.id} className="te-panel">
            <button
              className="te-panelHeader"
              onClick={() => setOpenId(open ? null : it.id)}
              style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
            >
              <div>
                <div className="text-sm font-semibold">{cleanFaqTitle(it.question)}</div>
                <div className="te-meta mt-1">{it.sourceUrl ? new URL(it.sourceUrl).pathname : it.slug}</div>
              </div>
              <div className="te-meta">{open ? "−" : "+"}</div>
            </button>
            {open ? (
              <div className="te-panelBody">
                <div className="te-body" style={{ whiteSpace: "pre-wrap" }}>
                  {it.answer}
                </div>
                {updateRequired ? (
                  <TrustEyeInlineEditor domain={domain} recommendations={relevant as any} autoOpenRecId={autoRecId} />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

