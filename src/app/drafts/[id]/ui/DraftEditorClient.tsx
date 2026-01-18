"use client";

import { useMemo, useState } from "react";
import { buildDomainQuery } from "@/lib/siteHelpers";

function isProbablyMarkdown(s: string) {
  return /(^# )|(\n# )|(\*\*)|(\n- )/m.test(s || "");
}

export default function DraftEditorClient({
  domain,
  recommendationId,
  initial,
  kind,
}: {
  domain: string;
  recommendationId: string;
  initial: string;
  kind: string;
}) {
  const [body, setBody] = useState<string>(initial || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [publishToShopify, setPublishToShopify] = useState<boolean>(true);

  const domainQ = useMemo(() => buildDomainQuery(domain), [domain]);

  async function call(url: string, payload?: any) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      const msg = json?.error ? String(json.error) : `http_${res.status}`;
      const details = json?.missingClaims ? `: ${(json.missingClaims || []).join("; ")}` : "";
      throw new Error(`${msg}${details}`);
    }
    return json;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
      <div>
        <div className="te-meta">Editor</div>
        <textarea
          rows={26}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-2 w-full rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[13px] text-[var(--te-text)]"
        />
        {error ? <div className="mt-2 text-[12px] text-red-600">{error}</div> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="te-btn"
            disabled={busy !== null}
            onClick={async () => {
              setError(null);
              setBusy("draft");
              try {
                const json = await call(`/api/recommendations/${recommendationId}/draft${domainQ}`);
                const md = String(json?.draft?.content?.bodyMarkdown || "");
                if (md) setBody(md);
              } catch (e: any) {
                setError(e?.message || "draft_failed");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "draft" ? "Drafting…" : "Generate draft (LLM)"}
          </button>
          <button
            type="button"
            className="te-btn"
            disabled={busy !== null}
            onClick={async () => {
              setError(null);
              setBusy("save");
              try {
                await call(`/api/recommendations/${recommendationId}/draft${domainQ}`, { overrideMarkdown: body });
              } catch (e: any) {
                setError(e?.message || "save_failed");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "save" ? "Saving…" : "Save edit"}
          </button>
          <button
            type="button"
            className="te-btn"
            disabled={busy !== null}
            onClick={async () => {
              setError(null);
              setBusy("approve");
              try {
                await call(`/api/recommendations/${recommendationId}/approve${domainQ}`);
              } catch (e: any) {
                setError(e?.message || "approve_failed");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            className="te-btn te-btnPrimary"
            disabled={busy !== null}
            onClick={async () => {
              setError(null);
              setBusy("publish");
              try {
                const json = await call(`/api/recommendations/${recommendationId}/publish${domainQ}`, { publishToShopify });
                if (json?.targetUrl) setLiveUrl(String(json.targetUrl) + domainQ);
              } catch (e: any) {
                setError(e?.message || "publish_failed");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>

        <label className="mt-2 flex items-center gap-2 text-[12px] text-[var(--te-muted)]">
          <input type="checkbox" checked={publishToShopify} onChange={(e) => setPublishToShopify(e.target.checked)} />
          Publish destination: Local + Shopify
        </label>

        <div className="mt-3 te-meta">
          Kind: <b>{kind}</b> · {isProbablyMarkdown(body) ? "Markdown" : "Text"}
        </div>

        {liveUrl ? (
          <div className="mt-2 text-[12px]">
            Live:{" "}
            <a className="te-link" href={liveUrl} target="_blank" rel="noreferrer">
              {liveUrl}
            </a>
          </div>
        ) : null}
      </div>

      <div>
        <div className="te-meta">Preview</div>
        <div
          className="mt-2 rounded-xl border border-[var(--te-border)] bg-white p-3"
          style={{ minHeight: 520, whiteSpace: "pre-wrap", fontSize: 13, color: "var(--te-text)" }}
        >
          {body || "—"}
        </div>
      </div>
    </div>
  );
}

