"use client";

import { useEffect, useMemo, useState } from "react";

type Rec = {
  id: string;
  title: string;
  why?: string | null;
  status: "PROPOSED" | "DRAFTED" | "APPROVED" | "PUBLISHED" | string;
  publishTarget?: "FAQ" | "BLOG" | "PRODUCT" | string;
  recommendedAssetType?: string | null;
  llmEvidence?: any;
};

function isActionable(rec: Rec) {
  const action = String(rec?.llmEvidence?.action || "").toUpperCase();
  if (!action) return true;
  return action === "CREATE" || action === "UPDATE";
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json?.ok !== false, status: res.status, json };
}

export function TrustEyeRecommendBar({
  domain,
  label,
  recommendations,
  subtle = true,
}: {
  domain: string;
  label: string;
  recommendations: Rec[];
  subtle?: boolean;
}) {
  const actionable = useMemo(() => recommendations.filter(isActionable).filter((r) => r.status !== "PUBLISHED"), [recommendations]);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(actionable[0]?.id || "");
  const [bodyMd, setBodyMd] = useState<string>("");
  const [stage, setStage] = useState<"recommend" | "publish" | "published">("recommend");
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const active = actionable.find((r) => r.id === activeId) || actionable[0];

  // If navigated from the right-rail Recommendations list, auto-open the editor on that recommendation.
  useEffect(() => {
    if (autoOpened) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const recId = url.searchParams.get("rec");
    if (!recId) return;
    const match = actionable.find((r) => r.id === recId);
    if (!match) return;
    setAutoOpened(true);
    setDismissed(false);
    setOpen(true);
    setActiveId(match.id);
    setStage("recommend");
    setBodyMd("");
  }, [actionable, autoOpened]);

  // After auto-open, immediately generate a draft so the edit box is pre-filled.
  useEffect(() => {
    if (!autoOpened) return;
    if (!open) return;
    if (!active) return;
    if (busy !== null) return;
    if (stage !== "recommend") return;
    if (bodyMd.trim()) return;
    const t = setTimeout(() => {
      void ensureDraft();
    }, 250);
    return () => clearTimeout(t);
  }, [autoOpened, open, activeId, busy, stage, bodyMd]);

  if (!actionable.length) return null;
  if (dismissed) return null;

  async function ensureDraft() {
    if (!active) return;
    setBusy("draft");
    try {
      const res = await postJson(`/api/recommendations/${active.id}/draft?domain=${encodeURIComponent(domain)}`, {});
      const md = String(res.json?.draft?.content?.bodyMarkdown || res.json?.draft?.content?.bodyMd || res.json?.draft?.content || res.json?.draft?.content?.body || "");
      setBodyMd(md || String(active?.llmEvidence?.draft?.content?.bodyMarkdown || ""));
      setStage("publish");
    } finally {
      setBusy(null);
    }
  }

  async function publishNow() {
    if (!active) return;
    setBusy("publish");
    try {
      // Save edits into draft (versioned) if user changed text.
      if (bodyMd.trim()) {
        await postJson(`/api/recommendations/${active.id}/draft?domain=${encodeURIComponent(domain)}`, { overrideMarkdown: bodyMd.trim() });
      }
      // Approve then publish (idempotent).
      await postJson(`/api/recommendations/${active.id}/approve?domain=${encodeURIComponent(domain)}`, {});
      const pub = await postJson(`/api/recommendations/${active.id}/publish?domain=${encodeURIComponent(domain)}`, { publishToShopify: false });
      if (!pub.ok) {
        // keep modal open so user can adjust
        return;
      }
      setStage("published");
      try {
        window.dispatchEvent(new CustomEvent("trusteye:refresh"));
      } catch {
        // ignore
      }
      // Close modal and keep bar visible as "Published" until refresh (matches “stage bar” feel).
      setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div
        className={[
          "rounded-2xl border border-[var(--te-border)] bg-white",
          subtle ? "mt-3" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--te-text)]">
              TrustEye {stage === "published" ? "Published" : "Recommended"} · {label}
            </div>
            <div className="mt-1 text-[12px] text-[var(--te-muted)]">
              {stage === "published" ? "Published changes are now reflected on this page." : `${actionable.length} item(s) to review. No duplication; no filler.`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stage !== "published" ? (
              <button
                type="button"
                className="rounded-xl bg-[var(--te-accent)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                onClick={() => {
                  setOpen(true);
                  setStage("recommend");
                }}
              >
                Review
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)]"
              onClick={() => setDismissed(true)}
              title="Dismiss (returns on refresh)"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--te-border)] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[var(--te-text)]">TrustEye editor</div>
                <div className="mt-1 text-[12px] text-[var(--te-muted)]">Recommend → Publish (close without publish = dismiss until refresh)</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)]"
                onClick={() => {
                  setOpen(false);
                  // If user closes without publishing, bar goes away until refresh.
                  if (stage !== "published") setDismissed(true);
                }}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 p-4">
              <div className="flex flex-wrap gap-2">
                {actionable.slice(0, 5).map((r) => {
                  const active = r.id === (activeId || actionable[0]?.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={[
                        "rounded-xl border px-3 py-2 text-[12px] font-semibold",
                        active
                          ? "border-[rgba(27,98,248,0.45)] bg-[rgba(27,98,248,0.08)] text-slate-900"
                          : "border-[var(--te-border)] bg-white text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)]",
                      ].join(" ")}
                      onClick={() => {
                        setActiveId(r.id);
                        setStage("recommend");
                        setBodyMd("");
                      }}
                    >
                      {r.title}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[var(--te-border)] bg-[#fbfcff] p-3">
                <div className="text-[12px] font-semibold text-[var(--te-text)]">Draft content</div>
                <div className="mt-1 text-[12px] text-[var(--te-muted)]">
                  Only publish if required. No repeats. Keep it factual and scoped to the right surface.
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)] disabled:opacity-60"
                    disabled={!active || busy !== null}
                    onClick={ensureDraft}
                  >
                    {busy === "draft" ? "Generating…" : "Generate draft"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--te-accent)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                    disabled={!active || busy !== null}
                    onClick={publishNow}
                    title="Approve + Publish"
                  >
                    {busy === "publish" ? "Publishing…" : "Publish"}
                  </button>
                </div>

                <textarea
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  placeholder="Click “Generate draft” first. Then edit and Publish."
                  className="mt-3 h-[220px] w-full rounded-xl border border-[var(--te-border)] bg-white p-3 text-[12px] outline-none focus:border-[rgba(27,98,248,0.55)]"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

