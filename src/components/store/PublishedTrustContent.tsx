"use client";

import { useEffect, useMemo, useState } from "react";
import { STORE_DEMO_KEYS, type PublishedAnswer, type StoreContentKind } from "@/lib/store-demo/state";

function readPublished(): PublishedAnswer[] {
  try {
    const raw = localStorage.getItem(STORE_DEMO_KEYS.published);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as PublishedAnswer[]) : [];
  } catch {
    return [];
  }
}

export function PublishedTrustContent(props: {
  kind: StoreContentKind;
  sourceId: string;
  title?: string;
}) {
  const [published, setPublished] = useState<PublishedAnswer[]>([]);

  useEffect(() => {
    setPublished(readPublished());

    const refresh = () => setPublished(readPublished());

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORE_DEMO_KEYS.published || e.key === STORE_DEMO_KEYS.onboarded) refresh();
    };

    const onPublished = () => refresh();
    const onReset = () => refresh();

    window.addEventListener("storage", onStorage);
    window.addEventListener("trustcart:published", onPublished as EventListener);
    window.addEventListener("trustcart:reset", onReset as EventListener);

    // Fallback polling (covers same-tab localStorage writes reliably across all browsers)
    const t = window.setInterval(refresh, 1000);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("trustcart:published", onPublished as EventListener);
      window.removeEventListener("trustcart:reset", onReset as EventListener);
      window.clearInterval(t);
    };
  }, []);

  const items = useMemo(() => {
    return published.filter((p) => p.kind === props.kind && p.sourceId === props.sourceId);
  }, [published, props.kind, props.sourceId]);

  if (items.length === 0) return null;

  return (
    <div className="te-panel" style={{ background: "rgba(236, 253, 245, 0.6)", borderColor: "rgba(34,197,94,0.35)" }}>
      <div className="te-panelHeader">
        <div className="text-sm font-semibold">{props.title || "Published on site"}</div>
        <div className="te-meta">Visible content now used for AI discovery</div>
      </div>
      <div className="te-panelBody">
        <div className="grid gap-3">
          {items.map((p) => (
            <div key={p.id} className="te-stepCard" style={{ background: "rgba(255,255,255,0.75)" }}>
              <div className="text-sm font-semibold">{p.question}</div>
              <div className="te-meta mt-2" style={{ whiteSpace: "pre-wrap" }}>
                {p.answer}
              </div>
              <div className="te-meta mt-2">Published {new Date(p.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

