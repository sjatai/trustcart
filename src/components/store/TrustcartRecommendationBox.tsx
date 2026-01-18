"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STORE_DEMO_KEYS, stableIdFromParts, type PublishedAnswer, type StoreContentKind, type ViewCounters } from "@/lib/store-demo/state";
import { computeLlMReadinessScore } from "@/lib/store-demo/score";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getPublished(): PublishedAnswer[] {
  const v = readJson<PublishedAnswer[]>(STORE_DEMO_KEYS.published, []);
  return Array.isArray(v) ? v : [];
}

function setPublished(next: PublishedAnswer[]) {
  writeJson(STORE_DEMO_KEYS.published, next);
}

function getViews(): ViewCounters {
  const v = readJson<ViewCounters>(STORE_DEMO_KEYS.views, {});
  return v && typeof v === "object" ? v : {};
}

function isOnboarded(): boolean {
  return Boolean(readJson<{ onboardedAt?: string } | null>(STORE_DEMO_KEYS.onboarded, null)?.onboardedAt);
}

function getOnboardedAtMs(): number | null {
  const raw = readJson<{ onboardedAt?: string } | null>(STORE_DEMO_KEYS.onboarded, null);
  if (!raw?.onboardedAt) return null;
  const t = Date.parse(raw.onboardedAt);
  return Number.isFinite(t) ? t : null;
}

function getDiscoveryReadyAtMs(): number | null {
  const raw = readJson<{ readyAt?: string } | null>(STORE_DEMO_KEYS.discoveryReadyAt, null);
  if (!raw?.readyAt) return null;
  const t = Date.parse(raw.readyAt);
  return Number.isFinite(t) ? t : null;
}

export function TrustcartRecommendationBox(props: {
  kind: StoreContentKind;
  sourceId: string; // product/blog slug or faq id
  sourceLabel: string;
  receipt: string;
  totals: { productsTotal: number; blogsTotal: number; faqsTotal: number };
  recommendation: {
    level: "ok" | "edit_required" | "new_required";
    title: string;
    suggested: string;
  };
}) {
  const [onboarded, setOnboarded] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [seenOnboardedAt, setSeenOnboardedAt] = useState<number | null>(null);
  const [published, setPublishedState] = useState<PublishedAnswer[]>([]);
  const [views, setViewsState] = useState<ViewCounters>({});
  const [draft, setDraft] = useState(props.recommendation.suggested);

  const recId = useMemo(() => stableIdFromParts("inline", props.kind, props.sourceId, props.recommendation.title), [props.kind, props.recommendation.title, props.sourceId]);

  useEffect(() => {
    setOnboarded(isOnboarded());
    const onboardedAt = getOnboardedAtMs();
    setSeenOnboardedAt(onboardedAt);
    const readyAt = getDiscoveryReadyAtMs();
    if (onboardedAt) {
      if (readyAt && Date.now() < readyAt) {
        setConnecting(true);
        setDiscovering(false);
      } else {
        setConnecting(false);
        setDiscovering(true);
      }
    }
    setPublishedState(getPublished());
    setViewsState(getViews());

    let stopTimer: number | null = null;
    let startDiscoveryTimer: number | null = null;
    const scheduleStop = () => {
      if (stopTimer) window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => setDiscovering(false), 2600);
    };

    const scheduleStart = (msFromNow: number) => {
      if (startDiscoveryTimer) window.clearTimeout(startDiscoveryTimer);
      startDiscoveryTimer = window.setTimeout(() => {
        setConnecting(false);
        setDiscovering(true);
        scheduleStop();
      }, Math.max(0, msFromNow));
    };

    if (onboardedAt) {
      if (readyAt && Date.now() < readyAt) {
        scheduleStart(readyAt - Date.now());
      } else {
        scheduleStop();
      }
    }

    const onOnboarded = (evt: Event) => {
      try {
        const e = evt as CustomEvent<{ onboardedAt?: string; discoveryReadyAt?: string }>;
        const t = e?.detail?.onboardedAt ? Date.parse(e.detail.onboardedAt) : Date.now();
        const ready = e?.detail?.discoveryReadyAt ? Date.parse(e.detail.discoveryReadyAt) : getDiscoveryReadyAtMs() || Date.now();
        setOnboarded(true);
        setSeenOnboardedAt(Number.isFinite(t) ? t : Date.now());
        if (Number.isFinite(ready) && Date.now() < ready) {
          setConnecting(true);
          setDiscovering(false);
          scheduleStart(ready - Date.now());
        } else {
          setConnecting(false);
          setDiscovering(true);
          scheduleStop();
        }
      } catch {
        setOnboarded(true);
        setConnecting(false);
        setDiscovering(true);
        scheduleStop();
      }
    };

    const onReset = () => {
      setOnboarded(false);
      setDiscovering(false);
      setConnecting(false);
      setSeenOnboardedAt(null);
      setPublishedState(getPublished());
      setViewsState(getViews());
    };

    window.addEventListener("trustcart:onboarded", onOnboarded);
    window.addEventListener("trustcart:reset", onReset);

    // Fast polling (demo UX) to pick up onboarding/reset quickly.
    const t = window.setInterval(() => {
      setOnboarded(isOnboarded());
      const onboardedAt = getOnboardedAtMs();
      const readyAt = getDiscoveryReadyAtMs();
      setSeenOnboardedAt((prev) => {
        if (onboardedAt && prev !== onboardedAt) {
          if (readyAt && Date.now() < readyAt) {
            setConnecting(true);
            setDiscovering(false);
            scheduleStart(readyAt - Date.now());
          } else {
            setConnecting(false);
            setDiscovering(true);
            scheduleStop();
          }
        }
        if (!onboardedAt) {
          setConnecting(false);
          setDiscovering(false);
        }
        return onboardedAt;
      });
      setPublishedState(getPublished());
      setViewsState(getViews());
    }, 250);
    return () => {
      window.clearInterval(t);
      if (stopTimer) window.clearTimeout(stopTimer);
      if (startDiscoveryTimer) window.clearTimeout(startDiscoveryTimer);
      window.removeEventListener("trustcart:onboarded", onOnboarded);
      window.removeEventListener("trustcart:reset", onReset);
    };
  }, []);

  const alreadyPublished = useMemo(() => published.some((p) => p.id === recId), [published, recId]);

  const score = useMemo(() => {
    return computeLlMReadinessScore({
      productsTotal: props.totals.productsTotal,
      blogsTotal: props.totals.blogsTotal,
      faqsTotal: props.totals.faqsTotal,
      published,
      views: views,
    }).total;
  }, [props.totals.blogsTotal, props.totals.faqsTotal, props.totals.productsTotal, published, views]);

  const levelLabel =
    props.recommendation.level === "ok" ? "OK" : props.recommendation.level === "new_required" ? "New content required" : "Edit required";

  const dotClass = alreadyPublished ? "ss-dotGood" : props.recommendation.level === "ok" ? "ss-dotGood" : "ss-dotWarn";

  const publish = useCallback(() => {
    const nextItem: PublishedAnswer = {
      id: recId,
      kind: props.kind,
      sourceId: props.sourceId,
      sourceLabel: props.sourceLabel,
      question: props.recommendation.title,
      answer: draft.trim(),
      createdAt: new Date().toISOString(),
    };

    const cur = getPublished();
    if (cur.some((p) => p.id === nextItem.id)) return;
    const next = [nextItem, ...cur].slice(0, 500);
    setPublished(next);
    setPublishedState(next);
    try {
      window.dispatchEvent(new CustomEvent("trustcart:published", { detail: { kind: props.kind, sourceId: props.sourceId } }));
    } catch {
      // ignore
    }
  }, [draft, props.kind, props.sourceId, props.sourceLabel, props.recommendation.title, recId]);

  if (!onboarded) {
    return (
      <div className="ss-metaBox">
        <div className="ss-metaTop">
          <div className="ss-metaBrand">Trustcart AI</div>
          <div className="ss-metaScore">{score}/100</div>
        </div>
        <div className="ss-metaRow">
          <span className="ss-metaDot ss-dotWarn" />
          <span className="ss-metaText">Run “Onboard sunnystep.com” to discover recommendations for this page.</span>
        </div>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="ss-metaBox">
        <div className="ss-metaTop">
          <div className="ss-metaBrand">Trustcart AI</div>
          <div className="ss-metaScore">{score}/100</div>
        </div>
        <div className="ss-metaRow">
          <span className="ss-metaDot ss-dotWarn" />
          <span className="ss-metaText">Connecting to sunnystep.com…</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="ss-discoveryBar" />
        </div>
      </div>
    );
  }

  if (discovering) {
    return (
      <div className="ss-metaBox">
        <div className="ss-metaTop">
          <div className="ss-metaBrand">Trustcart AI</div>
          <div className="ss-metaScore">{score}/100</div>
        </div>
        <div className="ss-metaRow">
          <span className="ss-metaDot ss-dotWarn" />
          <span className="ss-metaText">Analyzing this page…</span>
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div className="te-skeleton" style={{ height: 14, width: "70%" }} />
          <div className="te-skeleton" style={{ height: 10, width: "92%" }} />
          <div className="te-skeleton" style={{ height: 10, width: "86%" }} />
          <div className="te-skeleton" style={{ height: 10, width: "78%" }} />
        </div>
      </div>
    );
  }

  if (alreadyPublished) {
    return (
      <div className="ss-metaBox">
        <div className="ss-metaTop">
          <div className="ss-metaBrand">Trustcart AI</div>
          <div className="ss-metaScore">{score}/100</div>
        </div>
        <div className="ss-metaRow">
          <span className="ss-metaDot ss-dotGood" />
          <span className="ss-metaText">Published</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ss-metaBox">
      <div className="ss-metaTop">
        <div className="ss-metaBrand">Trustcart AI</div>
        <div className="ss-metaScore">{score}/100</div>
      </div>
      <div className="ss-metaRow">
        <span className={`ss-metaDot ${dotClass}`} />
        <span className="ss-metaText">{levelLabel}</span>
      </div>
      <div className="ss-metaRow" style={{ alignItems: "flex-start" }}>
        <span className="ss-metaText">
          <b>{props.recommendation.title}</b>
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <textarea
          className="te-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          style={{ resize: "vertical" }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className="te-button te-buttonSmall" onClick={publish} disabled={!draft.trim()}>
          Publish
        </button>
        <span className="te-meta">Publishes this recommendation into your demo knowledge base.</span>
      </div>
      <div className="ss-metaRow">
        <span className="ss-metaText">Receipt: {props.receipt}</span>
      </div>
    </div>
  );
}

