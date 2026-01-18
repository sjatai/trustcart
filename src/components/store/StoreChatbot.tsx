"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { STORE_DEMO_KEYS, stableIdFromParts, type PublishedAnswer, type StoreContentKind, type ViewCounters } from "@/lib/store-demo/state";
import { computeLlMReadinessScore } from "@/lib/store-demo/score";
import { getBlogRecommendations, getFaqRecommendations, getProductRecommendations } from "@/lib/store-demo/recommendations";

type ContentRef = { id: string; slug: string; label: string };
type ContentRefWithDesc = ContentRef & { description?: string };

type Recommendation = {
  id: string;
  kind: StoreContentKind;
  sourceId: string;
  sourceLabel: string;
  question: string;
  answer: string;
};

type ChatMsg =
  | { id: string; role: "user" | "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "recommendations"; title: string; items: Recommendation[] };

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

function clearKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function normalizeViews(v: ViewCounters): ViewCounters {
  if (!v || typeof v !== "object") return {};
  const out: ViewCounters = {};
  for (const [k, val] of Object.entries(v)) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function getPublished(): PublishedAnswer[] {
  const v = readJson<PublishedAnswer[]>(STORE_DEMO_KEYS.published, []);
  return Array.isArray(v) ? v : [];
}

function setPublished(next: PublishedAnswer[]) {
  writeJson(STORE_DEMO_KEYS.published, next);
}

function getViews(): ViewCounters {
  return normalizeViews(readJson<ViewCounters>(STORE_DEMO_KEYS.views, {}));
}

function scoreLabel(total: number) {
  if (total >= 85) return "excellent";
  if (total >= 70) return "strong";
  if (total >= 55) return "developing";
  if (total >= 40) return "early";
  return "nascent";
}

export function StoreChatbot(props: {
  products: ContentRefWithDesc[];
  blogs: ContentRefWithDesc[];
  faq: Array<{ id: string; label: string; sourceUrl: string; answer?: string }>;
}) {
  const pathname = usePathname() || "";
  const [activeTab, setActiveTab] = useState<"chat" | "published">("chat");
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => [
    {
      id: "m_welcome",
      role: "assistant",
      kind: "text",
      text:
        "I’m your Trustcart copilot.\n\nUse the commands below to: (1) onboard sunnystep.com for AI discovery, (2) view demand signals, and (3) research + quick publish trust-critical answers.",
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onboardTimerRef = useRef<number | null>(null);
  const [published, setPublishedState] = useState<PublishedAnswer[]>([]);
  const [views, setViewsState] = useState<ViewCounters>({});

  const totals = useMemo(
    () => ({
      productsTotal: props.products.length,
      blogsTotal: props.blogs.length,
      faqsTotal: props.faq.length,
    }),
    [props.blogs.length, props.faq.length, props.products.length],
  );

  const breakdown = useMemo(() => {
    return computeLlMReadinessScore({
      ...totals,
      published,
      views,
    });
  }, [published, totals, views]);

  useEffect(() => {
    setPublishedState(getPublished());
    setViewsState(getViews());
  }, []);

  useEffect(() => {
    // best-effort: refresh views + published as user navigates / publishes inline
    const t = window.setInterval(() => {
      setViewsState(getViews());
      setPublishedState(getPublished());
    }, 1500);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const pushUser = useCallback((text: string) => {
    setMsgs((m) => [...m, { id: stableIdFromParts("u", String(Date.now()), text), role: "user", kind: "text", text }]);
  }, []);

  const pushAssistantText = useCallback((text: string) => {
    setMsgs((m) => [...m, { id: stableIdFromParts("a", String(Date.now()), text), role: "assistant", kind: "text", text }]);
  }, []);

  const pushAssistantRecs = useCallback((title: string, items: Recommendation[]) => {
    setMsgs((m) => [...m, { id: stableIdFromParts("r", String(Date.now()), title), role: "assistant", kind: "recommendations", title, items }]);
  }, []);

  const publish = useCallback(
    (rec: Recommendation) => {
      const before = computeLlMReadinessScore({ ...totals, published, views }).total;
      const nextItem: PublishedAnswer = {
        id: rec.id,
        kind: rec.kind,
        sourceId: rec.sourceId,
        sourceLabel: rec.sourceLabel,
        question: rec.question,
        answer: rec.answer,
        createdAt: new Date().toISOString(),
      };

      const next = (() => {
        const cur = getPublished();
        if (cur.some((p) => p.id === nextItem.id)) return cur;
        return [nextItem, ...cur].slice(0, 500);
      })();

      setPublished(next);
      setPublishedState(next);
      try {
        window.dispatchEvent(new CustomEvent("trustcart:published", { detail: { kind: rec.kind, sourceId: rec.sourceId } }));
      } catch {
        // ignore
      }

      const after = computeLlMReadinessScore({ ...totals, published: next, views }).total;
      pushAssistantText(`Quick published.\n\nTrust score: ${before} → ${after} (${scoreLabel(after)}).`);
    },
    [published, pushAssistantText, totals, views],
  );

  const existingByKind = useMemo(() => {
    const by = {
      product: new Map<string, number>(),
      blog: new Map<string, number>(),
      faq: new Map<string, number>(),
    } as const;

    for (const p of published) {
      const map = by[p.kind];
      map.set(p.sourceId, (map.get(p.sourceId) || 0) + 1);
    }
    return by;
  }, [published]);

  function cleanText(s: string) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function summarizeFaqAnswerLongToShort(answer: string) {
    const a = cleanText(answer);
    if (!a) return "See policy for details.";
    const cut = a.slice(0, 260);
    const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    const out = (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut).trim();
    return out.length < 40 ? a.slice(0, 320) : out;
  }

  function answerFromKnowledge(question: string): string {
    const q = cleanText(question).toLowerCase();
    const terms = q
      .split(/[^a-z0-9]+/g)
      .filter(Boolean)
      .filter((t) => t.length >= 3)
      .slice(0, 18);

    const docs: Array<{ title: string; body: string; receipt: string }> = [];

    for (const p of getPublished().slice(0, 150)) {
      docs.push({
        title: `${p.kind.toUpperCase()}: ${p.sourceLabel} — ${p.question}`,
        body: p.answer,
        receipt: `published/${p.kind}/${p.sourceId}`,
      });
    }

    for (const f of props.faq) {
      docs.push({
        title: `FAQ: ${cleanText(f.label)}`,
        body: f.answer || "",
        receipt: f.sourceUrl,
      });
    }

    for (const p of props.products) {
      docs.push({
        title: `Product: ${p.label}`,
        body: `${p.description || ""} (Page: /products/${p.slug})`,
        receipt: `/products/${p.slug}`,
      });
    }

    for (const b of props.blogs) {
      docs.push({
        title: `Blog: ${b.label}`,
        body: `${b.description || ""} (Page: /blog/${b.slug})`,
        receipt: `/blog/${b.slug}`,
      });
    }

    const scoreDoc = (d: { title: string; body: string }) => {
      const hay = `${d.title} ${d.body}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (hay.includes(t)) score += 1;
      }
      return score;
    };

    const ranked = docs
      .map((d) => ({ d, s: scoreDoc(d) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.d);

    if (ranked.length === 0) {
      return [
        `I don’t have enough grounded data to answer that from the current SunnySteps dataset.`,
        ``,
        `Try: shipping policy, returns, sizing/fit, occasions, or a specific product name.`,
      ].join("\n");
    }

    return [
      `Trustcart AI (grounded) — based on sunnystep.com content + your published answers:`,
      ``,
      ...ranked.map((d) => `- ${d.title}\n  ${summarizeFaqAnswerLongToShort(d.body)}\n  Receipt: ${d.receipt}`),
    ].join("\n");
  }

  const [input, setInput] = useState("");

  const send = useCallback(() => {
    const q = cleanText(input);
    if (!q) return;
    setActiveTab("chat");
    setInput("");
    pushUser(q);
    pushAssistantText(answerFromKnowledge(q));
  }, [answerFromKnowledge, input, pushAssistantText, pushUser]);

  const makeProductRec = useCallback(
    (p: ContentRef): Recommendation[] => {
      const recs = getProductRecommendations({ slug: p.slug, name: p.label, sourceUrl: `/products/${p.slug}` });
      return recs.map((r) => ({
        id: stableIdFromParts("rec", r.kind, r.sourceId, r.title),
        kind: r.kind,
        sourceId: r.sourceId,
        sourceLabel: r.sourceLabel,
        question: r.title,
        answer: r.suggested,
      }));
    },
    [],
  );

  const makeBlogRec = useCallback((b: ContentRef): Recommendation[] => {
    const recs = getBlogRecommendations({
      slug: b.slug,
      headline: b.label,
      description: (b as ContentRefWithDesc).description || "",
      sourceUrl: `/blog/${b.slug}`,
    });
    return recs.map((r) => ({
      id: stableIdFromParts("rec", r.kind, r.sourceId, r.title),
      kind: r.kind,
      sourceId: r.sourceId,
      sourceLabel: r.sourceLabel,
      question: r.title,
      answer: r.suggested,
    }));
  }, []);

  const makeFaqRec = useCallback((f: { id: string; label: string; sourceUrl: string; answer?: string }): Recommendation[] => {
    const recs = getFaqRecommendations({ id: f.id, question: f.label, answer: f.answer || "", sourceUrl: f.sourceUrl });
    return recs.map((r) => ({
      id: stableIdFromParts("rec", r.kind, r.sourceId, r.title),
      kind: r.kind,
      sourceId: r.sourceId,
      sourceLabel: r.sourceLabel,
      question: r.title,
      answer: r.suggested,
    }));
  }, []);

  const cmdReadiness = useCallback(() => {
    setActiveTab("chat");
    pushUser("Onboard sunnystep.com — How is your brand doing in AI discovery?");
    const onboardedAt = new Date().toISOString();
    const discoveryReadyAtMs = Date.now() + 2400; // subtle delay before “discovery” begins (demo pacing)
    const resultsAtMs = Date.now() + 5000; // total “engine running” time (connect + analyze)
    writeJson(STORE_DEMO_KEYS.onboarded, { onboardedAt, domain: "sunnystep.com" });
    writeJson(STORE_DEMO_KEYS.discoveryReadyAt, { readyAt: new Date(discoveryReadyAtMs).toISOString() });
    try {
      window.dispatchEvent(
        new CustomEvent("trustcart:onboarded", {
          detail: { onboardedAt, domain: "sunnystep.com", discoveryReadyAt: new Date(discoveryReadyAtMs).toISOString() },
        }),
      );
    } catch {
      // ignore
    }
    pushAssistantText("Analyzing sunnystep.com…");

    if (onboardTimerRef.current) window.clearTimeout(onboardTimerRef.current);
    onboardTimerRef.current = window.setTimeout(() => {
      const b = computeLlMReadinessScore({ ...totals, published, views });

      const productDone = new Set(published.filter((p) => p.kind === "product").map((p) => p.sourceId)).size;
      const blogDone = new Set(published.filter((p) => p.kind === "blog").map((p) => p.sourceId)).size;
      const faqDone = new Set(published.filter((p) => p.kind === "faq").map((p) => p.sourceId)).size;

      pushAssistantText(
        [
          `AI discovery readiness: ${b.total}/100 (${scoreLabel(b.total)})`,
          "",
          `What Trustcart analyzed (live, as-is):`,
          `- Base: ${b.base}`,
          `- Product coverage: ${b.productCoverage} (${productDone}/${totals.productsTotal} products have published answers)`,
          `- Blog coverage: ${b.blogCoverage} (${blogDone}/${totals.blogsTotal} blog posts have published answers)`,
          `- FAQ coverage: ${b.faqCoverage} (${faqDone}/${totals.faqsTotal} policy/support pages have published answers)`,
          `- Demand/engagement: ${b.engagement} (real page views in this demo)`,
          "",
          `Fastest win: publish the missing trust answers on top-viewed products (fit, occasions, shipping, returns).`,
        ].join("\n"),
      );
    }, Math.max(0, resultsAtMs - Date.now()));
  }, [published, pushAssistantText, pushUser, totals, views]);

  const cmdResetDemo = useCallback(() => {
    setActiveTab("chat");
    pushUser("Reset demo (clear findings + published + demand signals)");
    if (onboardTimerRef.current) window.clearTimeout(onboardTimerRef.current);
    onboardTimerRef.current = null;
    clearKey(STORE_DEMO_KEYS.onboarded);
    clearKey(STORE_DEMO_KEYS.discoveryReadyAt);
    clearKey(STORE_DEMO_KEYS.published);
    clearKey(STORE_DEMO_KEYS.views);
    clearKey(STORE_DEMO_KEYS.baseline);
    setPublishedState([]);
    setViewsState({});
    try {
      window.dispatchEvent(new CustomEvent("trustcart:reset"));
    } catch {
      // ignore
    }
    setMsgs([
      {
        id: "m_welcome",
        role: "assistant",
        kind: "text",
        text:
          "I’m your Trustcart copilot.\n\nUse the commands below to: (1) onboard sunnystep.com for AI discovery, (2) view demand signals, and (3) research + quick publish trust-critical answers.",
      },
    ]);
    pushAssistantText("Demo reset. Run onboarding again to regenerate fresh findings.");
  }, [pushAssistantText, pushUser]);

  const cmdDemandSignals = useCallback(() => {
    setActiveTab("chat");
    pushUser("Demand signals");

    const productViews: Array<{ slug: string; count: number }> = [];
    for (const p of props.products) {
      const k = `/products/${p.slug}`;
      productViews.push({ slug: p.slug, count: views[k] || 0 });
    }
    productViews.sort((a, b) => b.count - a.count);

    const topViewed = productViews.filter((x) => x.count > 0).slice(0, 5);
    const topViewedText =
      topViewed.length > 0
        ? topViewed
            .map((x, idx) => {
              const label = props.products.find((p) => p.slug === x.slug)?.label || x.slug;
              return `${idx + 1}. ${label} (${x.count} views)`;
            })
            .join("\n")
        : "No product demand signals yet (start clicking products to generate real signals).";

    const publishedHotspots = published.slice(0, 6).map((p) => `- ${p.kind.toUpperCase()}: ${p.sourceLabel}`);

    pushAssistantText(
      [
        `Demand signals (real + as-is):`,
        "",
        `Top viewed products:`,
        topViewedText,
        "",
        `Recent published hotspots (what you’ve started to operationalize):`,
        publishedHotspots.length ? publishedHotspots.join("\n") : "- None yet",
        "",
        `Next best step: publish fit + occasions + shipping/returns answers on the top 3 products to reduce drop-off.`,
      ].join("\n"),
    );
  }, [props.products, published, pushAssistantText, pushUser, views]);

  const cmdRecommendations = useCallback(() => {
    setActiveTab("chat");
    pushUser("Research and recommend changes");

    const recs: Recommendation[] = [];
    const recIdSet = new Set<string>();
    const pushRec = (r: Recommendation) => {
      if (recIdSet.has(r.id)) return;
      recIdSet.add(r.id);
      recs.push(r);
    };
    const pushRecs = (rs: Recommendation[]) => rs.forEach(pushRec);

    // 3 product changes: prioritize top viewed products first
    const rankedProducts = [...props.products].sort((a, b) => (views[`/products/${b.slug}`] || 0) - (views[`/products/${a.slug}`] || 0));
    const prodTargets = rankedProducts.slice(0, 3);
    for (const p of prodTargets) {
      // One sharp “change” per product (avoid flooding): publishable content, not tags
      pushRecs(makeProductRec(p).slice(0, 1));
    }

    // 2 blog items
    for (const b of props.blogs.slice(0, 2)) pushRecs(makeBlogRec(b));

    // 3 FAQs (real text; prefer shipping/returns/privacy)
    const faqRank = (label: string) => {
      const l = label.toLowerCase();
      if (l.includes("shipping")) return 0;
      if (l.includes("returns")) return 1;
      if (l.includes("privacy")) return 2;
      return 10;
    };
    const faqTargets = [...props.faq].sort((a, b) => faqRank(a.label) - faqRank(b.label)).slice(0, 3);
    for (const f of faqTargets) pushRecs(makeFaqRec(f));

    pushAssistantRecs("Quick publish these trust-critical answers:", recs.slice(0, 8));
  }, [makeBlogRec, makeFaqRec, makeProductRec, props.blogs, props.faq, props.products, pushAssistantRecs, pushUser, views]);

  return (
    <div className="te-panel h-full" style={{ display: "flex", flexDirection: "column" }}>
      <div className="te-panelHeader">
        <div>
          <div className="text-sm font-semibold">Chatbot</div>
          <div className="te-meta mt-1">
            Trust score: <span style={{ color: "var(--te-text)", fontWeight: 700 }}>{breakdown.total}</span>/100 ·{" "}
            {scoreLabel(breakdown.total)}
          </div>
        </div>
        <div className="te-pill">Demo</div>
      </div>

      <div className="te-panelBody" style={{ paddingTop: 14, flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="te-tabs">
            <button className={`te-tab ${activeTab === "chat" ? "te-tabActive" : ""}`} onClick={() => setActiveTab("chat")}>
              Chat
            </button>
            <button className={`te-tab ${activeTab === "published" ? "te-tabActive" : ""}`} onClick={() => setActiveTab("published")}>
              Published ({published.length})
            </button>
          </div>
        </div>

        {activeTab === "published" ? (
          <div className="mt-4 te-panel" style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
            <div className="te-panelHeader">
              <div className="text-sm font-semibold">Published answers</div>
              <div className="te-meta">Persisted locally for the demo</div>
            </div>
            <div className="te-panelBody">
              {published.length === 0 ? (
                <div className="te-meta">Nothing published yet. Click “Research + recommend changes” and quick publish.</div>
              ) : (
                <div className="grid gap-3">
                  {published.slice(0, 25).map((p) => (
                    <div key={p.id} className="te-stepCard">
                      <div className="te-meta">
                        {p.kind.toUpperCase()} · {p.sourceLabel}
                      </div>
                      <div className="text-sm font-semibold mt-1">{p.question}</div>
                      <div className="te-meta mt-2" style={{ whiteSpace: "pre-wrap" }}>
                        {p.answer}
                      </div>
                      <div className="te-meta mt-2">{new Date(p.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="mt-4 te-chat" style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
            {msgs.map((m) => {
              const bubbleClass = m.role === "user" ? "te-bubble te-bubbleUser" : "te-bubble";

              if (m.kind === "recommendations") {
                return (
                  <div key={m.id} className={bubbleClass}>
                    <div className="te-bubbleHeader">
                      <div className="te-bubbleRole">Assistant</div>
                      <div className="te-meta">{m.title}</div>
                    </div>
                    <div className="grid gap-3">
                      {m.items.map((it) => {
                        const already = published.some((p) => p.id === it.id);
                        return (
                          <div key={it.id} className="te-stepCard">
                            <div className="te-meta" style={{ marginBottom: 6 }}>
                              {it.kind.toUpperCase()} · {it.sourceLabel}
                            </div>
                            <div className="text-sm font-semibold">{it.question}</div>
                            <div className="te-meta mt-2" style={{ whiteSpace: "pre-wrap" }}>
                              {it.answer}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button className="te-button te-buttonSmall" onClick={() => publish(it)} disabled={already}>
                                {already ? "Published" : "Quick publish"}
                              </button>
                              <span className="te-meta">{already ? "Already published" : "Adds to knowledge + boosts score"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={bubbleClass}>
                  <div className="te-bubbleHeader">
                    <div className="te-bubbleRole">{m.role === "user" ? "You" : "Assistant"}</div>
                  </div>
                  <div className="te-bubbleContent">{m.text}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Command bar pinned to bottom */}
        <div className="mt-4 te-panel" style={{ flex: "0 0 auto", position: "sticky", bottom: 0 }}>
          <div className="te-panelBody" style={{ padding: 12 }}>
            <div className="flex gap-2" style={{ alignItems: "center" }}>
              <input
                className="te-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Trustcart AI… (shipping, returns, fit, occasions, etc.)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
              />
              <button className="te-button te-buttonSmall" onClick={send} disabled={!cleanText(input)}>
                Send
              </button>
            </div>
            <div className="te-meta" style={{ marginBottom: 8 }}>
              Commands
            </div>
            <div className="te-tabs" style={{ flexWrap: "wrap" }}>
              <button className="te-tab" onClick={cmdReadiness}>
                Onboard sunnystep.com (AI discovery)
              </button>
              <button className="te-tab" onClick={cmdDemandSignals}>
                Demand signals
              </button>
              <button className="te-tab te-tabActive" onClick={cmdRecommendations}>
                Research + recommend changes
              </button>
              <button className="te-tab" onClick={cmdResetDemo}>
                Reset demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

