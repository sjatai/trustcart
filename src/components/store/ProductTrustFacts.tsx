"use client";

import { useEffect, useMemo, useState } from "react";
import { STORE_DEMO_KEYS, type PublishedAnswer } from "@/lib/store-demo/state";

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

type Section = { title: string; bullets: string[] };

function parseSections(text: string): Section[] {
  const lines = String(text || "")
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: Section[] = [];
  let cur: Section | null = null;

  const isHeading = (l: string) => /^(occasions|shipping\b|shipping\s*&\s*returns|returns\b)/i.test(l);
  const isField = (l: string) => /^(fit|materials|care)\s*:/i.test(l);

  for (const line of lines) {
    if (isField(line)) continue; // these already exist on the page

    if (isHeading(line)) {
      cur = { title: line.replace(/\s*&\s*/g, " & ").replace(/:$/, ""), bullets: [] };
      sections.push(cur);
      continue;
    }

    const bullet = line.replace(/^[-•]\s*/, "").trim();
    if (cur && (/^[-•]\s*/.test(line) || bullet !== line)) {
      if (bullet) cur.bullets.push(bullet);
      continue;
    }

    // If we don't have a heading yet but we see bullets, group them under a generic section.
    if (!cur && /^[-•]\s*/.test(line)) {
      cur = { title: "Details", bullets: [] };
      sections.push(cur);
      if (bullet) cur.bullets.push(bullet);
      continue;
    }
  }

  // de-dupe sections by title
  const by = new Map<string, Section>();
  for (const s of sections) {
    const key = s.title.toLowerCase();
    const existing = by.get(key);
    if (!existing) by.set(key, s);
    else existing.bullets.push(...s.bullets);
  }

  return Array.from(by.values()).map((s) => ({
    title: s.title,
    bullets: Array.from(new Set(s.bullets)).slice(0, 12),
  }));
}

export function ProductTrustFacts(props: { productSlug: string }) {
  const [published, setPublished] = useState<PublishedAnswer[]>([]);

  useEffect(() => {
    const refresh = () => setPublished(readPublished());
    refresh();

    const onPublished = () => refresh();
    const onReset = () => refresh();
    window.addEventListener("trustcart:published", onPublished as EventListener);
    window.addEventListener("trustcart:reset", onReset as EventListener);
    const t = window.setInterval(refresh, 1000);
    return () => {
      window.removeEventListener("trustcart:published", onPublished as EventListener);
      window.removeEventListener("trustcart:reset", onReset as EventListener);
      window.clearInterval(t);
    };
  }, []);

  const extras = useMemo(() => {
    const items = published.filter((p) => p.kind === "product" && p.sourceId === props.productSlug);
    const text = items.map((i) => i.answer).join("\n\n");
    return parseSections(text);
  }, [props.productSlug, published]);

  return (
    <div className="mt-5 grid gap-2">
      <div className="te-meta">
        <b>Fit</b>: true-to-size for most; size up if you’re between sizes.
      </div>
      <div className="te-meta">
        <b>Materials</b>: breathable upper + supportive insole system (demo content).
      </div>
      <div className="te-meta">
        <b>Care</b>: wipe clean; air dry; avoid high heat.
      </div>

      {extras.length ? <div className="te-divider mt-3" /> : null}

      {extras.map((s) => (
        <div key={s.title} className="mt-2">
          <div className="te-meta" style={{ color: "var(--te-text)", fontWeight: 700 }}>
            {s.title}
          </div>
          {s.bullets.length ? (
            <ul className="te-stepList" style={{ marginTop: 6 }}>
              {s.bullets.map((b) => (
                <li key={b} className="te-meta">
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

