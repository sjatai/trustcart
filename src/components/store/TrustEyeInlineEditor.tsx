"use client";

import { useEffect, useMemo, useState } from "react";

type Rec = {
  id: string;
  title: string;
  status?: string;
  publishTarget?: "FAQ" | "BLOG" | "PRODUCT" | string;
  productHandle?: string | null;
  why?: string | null;
  claimKey?: string | null;
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

function friendlyClaimKey(k: string): string {
  const key = String(k || "").trim();
  const map: Record<string, string> = {
    "policy.shipping.regions_sg": "where we deliver in Singapore (Orchard/CBD etc.)",
    "policy.shipping.next_day_sg": "whether next‑day delivery is available in Singapore",
    "policy.shipping.same_day_sg": "whether same‑day delivery is available",
    "policy.shipping.time_sg": "delivery timeline in Singapore",
    "policy.shipping.fee_sg": "shipping fee in Singapore",
    "policy.returns.window": "return window + conditions",
    "policy.returns.free_sg": "whether returns are free in Singapore",
    "policy.exchanges.process": "how size exchanges work (steps + timeline)",
    "policy.refunds.time": "refund timeline",
    "policy.returns.in_store": "whether in‑store returns are possible",
    "availability.sg.orchard_mbs": "availability near Orchard / MBS",
    "availability.sg.now": "availability in Singapore right now",
  };
  return map[key] || key.replace(/\./g, " ");
}

function hintFor(rec: Rec): string {
  const raw = String(rec?.why || "").trim();
  if (raw.toLowerCase().includes("missing site facts:")) {
    const keys = raw
      .split(":")
      .slice(1)
      .join(":")
      .split(",")
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter(Boolean);
    if (keys.length) {
      return `This FAQ should cover: ${keys.map(friendlyClaimKey).join(", ")}.`;
    }
  }
  if (raw) return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
  return "This FAQ should cover the missing policy details in clear, buyer-first language.";
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
  publishVariant = "primary",
  showDiscard = false,
}: {
  domain: string;
  recommendations: Rec[];
  autoOpenRecId?: string | null;
  autoOpenAll?: boolean;
  autoDraft?: boolean;
  showRegenerate?: boolean;
  emptyMessage?: string;
  reloadOnPublish?: boolean;
  publishVariant?: "primary" | "subtle";
  showDiscard?: boolean;
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
        const helper = hintFor(rec);
        const publishClass =
          publishVariant === "subtle"
            ? "rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.35)]"
            : "te-btn te-btnPrimary";
        return (
          <div key={id} className="rounded-2xl border border-[var(--te-border)] bg-white px-4 py-3">
            <div className="text-[13px] font-semibold text-[var(--te-text)]">{rec.title}</div>
            <div className="mt-1 text-[12px] text-[var(--te-muted)]">{helper}</div>
            <div className="mt-2">
              <textarea
                value={body}
                onChange={(e) => setBodyById((p) => ({ ...p, [id]: e.target.value }))}
                className="h-[160px] w-full rounded-xl border border-[var(--te-border)] bg-white p-3 text-[12px] outline-none focus:border-[rgba(27,98,248,0.55)]"
                placeholder={emptyMessage}
              />
              {errById[id] ? <div className="mt-2 text-[12px] text-red-600">{errById[id]}</div> : null}
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              {showDiscard ? (
                <button
                  type="button"
                  className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.35)] disabled:opacity-60"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    setErrById((p) => ({ ...p, [id]: "" }));
                    setBusyById((p) => ({ ...p, [id]: "publish" }));
                    try {
                      const res = await postJson(`/api/recommendations/${id}/dismiss?domain=${encodeURIComponent(domain)}`, {});
                      if (!res.ok) {
                        setErrById((p) => ({ ...p, [id]: String(res.json?.error || "Discard failed") }));
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
                  Discard
                </button>
              ) : null}
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
                className={publishClass}
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

