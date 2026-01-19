"use client";

import { useEffect, useMemo, useState } from "react";

type Question = {
  id: string;
  text: string;
  impactScore?: number;
};

export function IntentQuestionList({ domain }: { domain: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const ordered = useMemo(() => {
    const copy = [...questions];
    copy.sort((a, b) => (Number(b.impactScore ?? 0) - Number(a.impactScore ?? 0)) || a.text.localeCompare(b.text));
    return copy;
  }, [questions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/questions?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
        if (!cancelled) setQuestions(Array.isArray(json.questions) ? json.questions : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load intent questions");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domain]);

  return (
    <div className="space-y-3">
      <div className="text-[14px] font-semibold text-[var(--te-text)]">Intent questions</div>

      {isLoading ? <div className="text-[13px] text-slate-700">Loading…</div> : null}
      {error ? <div className="text-[13px] text-red-600">{error}</div> : null}

      <ol className="list-decimal pl-5 space-y-2 text-[13px] text-slate-700">
        {ordered.map((q) => (
          <li key={q.id} className="leading-snug">
            {q.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

