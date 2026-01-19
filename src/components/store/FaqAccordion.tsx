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
  // Default to opening the first published FAQ item (not a sourceUrl).
  const [openId, setOpenId] = useState<string | null>(items[0]?.id || null);

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

  const { prefilledFaqRecs, otherFaqRecs } = useMemo(() => {
    const prefilledSlugs = new Set(["faq-stores-singapore-hours", "faq-size-guide-conversion"]);
    const faqRecs = (recommendations || []).filter((r: any) => String(r.publishTarget) === "FAQ");

    // Dedupe (some demo flows can accidentally create duplicates)
    const byKey = new Map<string, any>();
    for (const r of faqRecs) {
      const stableSlug = String(r?.llmEvidence?.stableSlug || "");
      const title = String(r?.title || r?.questionText || "");
      const key = `${stableSlug}|${title}`.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, r);
    }
    const deduped = Array.from(byKey.values());

    const prefilled = deduped.filter((r: any) => prefilledSlugs.has(String(r?.llmEvidence?.stableSlug || "")));
    const other = deduped.filter((r: any) => !prefilledSlugs.has(String(r?.llmEvidence?.stableSlug || "")));

    // Keep deterministic ordering: newest first.
    const sortByUpdated = (a: any, b: any) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""));
    prefilled.sort(sortByUpdated);
    other.sort(sortByUpdated);

    return { prefilledFaqRecs: prefilled, otherFaqRecs: other };
  }, [recommendations]);

  return (
    <div className="grid gap-3">
      {prefilledFaqRecs.length ? (
        <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
          <div className="text-[12px] font-semibold text-[var(--te-text)]">Recommended FAQs (draft answers)</div>
          <div className="mt-1 text-[12px] text-[var(--te-muted)]">These two are prefilled for the demo. Review and publish.</div>
          <div className="mt-3">
            <TrustEyeInlineEditor
              domain={domain}
              recommendations={prefilledFaqRecs as any}
              autoOpenAll
              autoOpenRecId={autoRecId}
              autoDraft={false}
              showRegenerate={false}
              emptyMessage="Please answer."
              reloadOnPublish
              publishVariant="subtle"
              showDiscard
            />
          </div>
        </div>
      ) : null}

      {otherFaqRecs.length ? (
        <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
          <div className="text-[12px] font-semibold text-[var(--te-text)]">Recommendations</div>
          <div className="mt-1 text-[12px] text-[var(--te-muted)]">Other FAQ recommendations (review and publish as needed).</div>
          <div className="mt-3">
            <TrustEyeInlineEditor
              domain={domain}
              recommendations={otherFaqRecs as any}
              autoOpenRecId={autoRecId}
              autoDraft={false}
              showRegenerate={false}
              emptyMessage="Please answer."
              reloadOnPublish
              publishVariant="subtle"
              showDiscard
            />
          </div>
        </div>
      ) : null}

      <div className="mt-2">
        <div className="text-[12px] font-semibold text-[var(--te-text)]">FAQ list</div>
        <div className="mt-2 grid gap-3">
          {normalized.map((it) => {
            const open = openId === it.id;
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
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

