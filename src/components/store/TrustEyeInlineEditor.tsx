"use client";

import { useEffect, useMemo, useState } from "react";

type Rec = {
  id: string;
  title: string;
  status?: string;
  publishTarget?: "FAQ" | "BLOG" | "PRODUCT" | string;
  productHandle?: string | null;
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

export function TrustEyeInlineEditor({
  domain,
  recommendations,
  autoOpenRecId,
  autoOpenAll = false,
  autoDraft = false,
  showRegenerate = false,
  emptyMessage = "Please answer.",
  reloadOnPublish = false,
}: {
  domain: string;
  recommendations: Rec[];
  autoOpenRecId?: string | null;
  autoOpenAll?: boolean;
  autoDraft?: boolean;
  showRegenerate?: boolean;
  emptyMessage?: string;
  reloadOnPublish?: boolean;
}) {
  const actionable = useMemo(() => recommendations.filter(isActionable).filter((r) => r.status !== "PUBLISHED"), [recommendations]);
  const openIds = useMemo(() => {
    if (autoOpenAll) return actionable.map((r) => r.id);
    if (autoOpenRecId) return actionable.some((r) => r.id === autoOpenRecId) ? [autoOpenRecId] : [];
    return actionable.length ? [actionable[0].id] : [];
  }, [actionable, autoOpenAll, autoOpenRecId]);

  const [bodyById, setBodyById] = useState<Record<string, string>>({});
  const [busyById, setBusyById] = useState<Record<string, "draft" | "publish" | undefined>>({});
  const [errById, setErrById] = useState<Record<string, string>>({});
  const [publishedById, setPublishedById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    async function ensureDraft(recId: string) {
      const rec = actionable.find((r) => r.id === recId);
      if (!rec) return;
      setErrById((p) => ({ ...p, [recId]: "" }));
      setBusyById((p) => ({ ...p, [recId]: "draft" }));
      try {
        const res = await postJson(`/api/recommendations/${recId}/draft?domain=${encodeURIComponent(domain)}`, {});
        const md = String(
          res.json?.draft?.content?.bodyMarkdown ||
            res.json?.draft?.content?.bodyMd ||
            res.json?.draft?.content ||
            res.json?.draft?.content?.body ||
            ""
        );
        if (!alive) return;
        setBodyById((p) => ({ ...p, [recId]: md.trim() ? md : String(p[recId] || "") }));
      } catch (e: any) {
        if (!alive) return;
        setErrById((p) => ({ ...p, [recId]: String(e?.message || "Failed to generate draft") }));
      } finally {
        if (!alive) return;
        setBusyById((p) => ({ ...p, [recId]: undefined }));
      }
    }

    // Prefill any open editors from existing stored content (no generation).
    for (const id of openIds) {
      const rec = actionable.find((r) => r.id === id);
      if (!rec) continue;
      if (bodyById[id]?.trim()) continue;
      const existing =
        String((rec.llmEvidence as any)?.draft?.content?.bodyMarkdown || "").trim() ||
        String((rec.llmEvidence as any)?.draft?.content?.bodyMd || "").trim() ||
        String((rec as any)?.suggestedContent || "").trim();
      if (existing) {
        setBodyById((p) => ({ ...p, [id]: existing }));
      } else if (autoDraft) {
        void ensureDraft(id);
      }
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, openIds.join("|"), actionable.length, autoDraft]);

  if (!actionable.length) return null;

  return (
    <div className="mt-3 grid gap-3">
      {openIds.map((id) => {
        const rec = actionable.find((r) => r.id === id);
        if (!rec) return null;
        const busy = busyById[id];
        const published = Boolean(publishedById[id]);
        if (published) return null;
        const body = String(bodyById[id] || "");
        return (
          <div key={id} className="rounded-2xl border border-[var(--te-border)] bg-white px-4 py-3">
            <div className="text-[13px] font-semibold text-[var(--te-text)]">{rec.title}</div>
            <div className="mt-2">
              <textarea
                value={body}
                onChange={(e) => setBodyById((p) => ({ ...p, [id]: e.target.value }))}
                className="h-[160px] w-full rounded-xl border border-[var(--te-border)] bg-white p-3 text-[12px] outline-none focus:border-[rgba(27,98,248,0.55)]"
                placeholder={emptyMessage}
              />
              {!body.trim() ? <div className="mt-2 text-[12px] text-[var(--te-muted)]">{emptyMessage}</div> : null}
              {errById[id] ? <div className="mt-2 text-[12px] text-red-600">{errById[id]}</div> : null}
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              {showRegenerate ? (
                <button
                  type="button"
                  className="te-btn"
                  disabled={Boolean(busy) || published}
                  onClick={async () => {
                    setErrById((p) => ({ ...p, [id]: "" }));
                    setBusyById((p) => ({ ...p, [id]: "draft" }));
                    try {
                      await postJson(`/api/recommendations/${id}/draft?domain=${encodeURIComponent(domain)}`, {});
                    } finally {
                      setBusyById((p) => ({ ...p, [id]: undefined }));
                    }
                  }}
                >
                  {busy === "draft" ? "Generating…" : "Regenerate"}
                </button>
              ) : null}
              <button
                type="button"
                className="te-btn te-btnPrimary"
                disabled={Boolean(busy) || published}
                onClick={async () => {
                  setErrById((p) => ({ ...p, [id]: "" }));
                  setBusyById((p) => ({ ...p, [id]: "publish" }));
                  try {
                    const md = String(bodyById[id] || "").trim();
                    if (!md) {
                      setErrById((p) => ({ ...p, [id]: "Please answer." }));
                      return;
                    }
                    await postJson(`/api/recommendations/${id}/draft?domain=${encodeURIComponent(domain)}`, { overrideMarkdown: md });
                    await postJson(`/api/recommendations/${id}/approve?domain=${encodeURIComponent(domain)}`, {});
                    const pub = await postJson(`/api/recommendations/${id}/publish?domain=${encodeURIComponent(domain)}`, { publishToShopify: false });
                    if (!pub.ok) {
                      setErrById((p) => ({ ...p, [id]: String(pub.json?.error || "Publish failed") }));
                      return;
                    }
                    setPublishedById((p) => ({ ...p, [id]: true }));
                    try {
                      window.dispatchEvent(new CustomEvent("trusteye:refresh"));
                    } catch {
                      // ignore
                    }
                    if (reloadOnPublish && typeof window !== "undefined") {
                      window.location.reload();
                    }
                  } finally {
                    setBusyById((p) => ({ ...p, [id]: undefined }));
                  }
                }}
              >
                {busy === "publish" ? "Publishing…" : published ? "Published" : "Publish"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

