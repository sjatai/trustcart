"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RailState } from "@/components/MissionControlShell";
import { RightRail } from "@/components/RightRail";
import { sendMissionControlMessage } from "@/lib/chatClient";
import { formatEvidenceForUI } from "@/lib/evidenceFormat";

export function StoreInspectRail({ domain = "sunnystep.com" }: { domain?: string }) {
  const railState: RailState = "normal";
  const setRailState = useCallback(() => {}, []);
  const [refreshToken, setRefreshToken] = useState(0);

  // When anything publishes/changes (either in Mission Control or store demo),
  // bump the refresh token so Inspect refetches its tab data.
  useEffect(() => {
    function bump() {
      setRefreshToken((n) => n + 1);
    }
    window.addEventListener("trusteye:refresh", bump);
    window.addEventListener("trustcart:published", bump);
    window.addEventListener("trustcart:reset", bump);
    return () => {
      window.removeEventListener("trusteye:refresh", bump);
      window.removeEventListener("trustcart:published", bump);
      window.removeEventListener("trustcart:reset", bump);
    };
  }, []);

  const [statusTop, setStatusTop] = useState<string>("");
  const [answerTop, setAnswerTop] = useState<string>("");
  const [input, setInput] = useState("");
  const [running, setRunning] = useState<null | "discover" | "recommend">(null);
  const claimsCacheRef = useRef<any[] | null>(null);

  const footer = useMemo(() => {
    async function ensureClaims(): Promise<any[]> {
      if (claimsCacheRef.current) return claimsCacheRef.current;
      const res = await fetch(`/api/knowledge/claims?domain=${encodeURIComponent(domain)}`);
      const json = await res.json().catch(() => ({}));
      const claims = Array.isArray(json?.claims) ? json.claims : [];
      claimsCacheRef.current = claims;
      return claims;
    }

    function scoreClaim(q: string, claim: any): number {
      const text = `${String(claim?.key || "")} ${String(claim?.value || "")}`.toLowerCase();
      const tokens = q
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3);
      if (!tokens.length) return 0;
      let score = 0;
      for (const t of tokens) {
        if (!t) continue;
        if (text.includes(t)) score += 2;
      }
      // slight boost if key matches category words
      if (q.toLowerCase().includes("shipping") && String(claim?.key || "").includes("shipping")) score += 3;
      if (q.toLowerCase().includes("return") && String(claim?.key || "").includes("return")) score += 3;
      if (q.toLowerCase().includes("exchange") && String(claim?.key || "").includes("exchange")) score += 3;
      return score;
    }

    async function answerFromDiscovery(question: string) {
      const claims = await ensureClaims();
      const q = String(question || "").trim();
      if (!q) return;

      if (!claims.length) {
        setAnswerTop("I don’t have any discovered facts yet. Click Discover first, then ask again. I can only answer from discovered claims.");
        return;
      }

      const ranked = [...claims]
        .map((c) => ({ c, s: scoreClaim(q, c) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4);

      if (!ranked.length) {
        setAnswerTop(
          "I couldn’t find a matching discovered claim for that question. Try asking about shipping, returns, exchanges, delivery time, store locations, or product availability."
        );
        return;
      }

      const lines: string[] = [];
      for (const { c } of ranked) {
        const key = String(c?.key || "").trim();
        const value = String(c?.value || "").trim();
        if (key && value) lines.push(`- ${key}: ${value}`);
      }

      setAnswerTop(["Answer (from discovery):", ...lines].join("\n"));
    }

    async function runEngine(kind: "discover" | "recommend") {
      const label = kind === "discover" ? "Discover" : "Recommend";
      const cmd = kind === "discover" ? `Onboard ${domain}` : `Recommend content for ${domain}`;
      setRunning(kind);
      claimsCacheRef.current = null; // invalidate (new discovery changes answers)

      const start = Date.now();
      setStatusTop("Analyzing…");
      setAnswerTop("");
      const res = await sendMissionControlMessage(cmd, domain);
      const elapsed = Date.now() - start;
      const minDelay = 5000;
      if (elapsed < minDelay) await new Promise((r) => setTimeout(r, minDelay - elapsed));

      if (kind === "discover") {
        setStatusTop(
          ["Discovery done.", "Knowledge Graph: sunnystep.com", "Product content analysis: sunnystep.com", "Demand Signals: high-intent questions created."].join("\n")
        );
      } else {
        setStatusTop(["Recommendations done.", "Turn answer gaps into publishable, verifiable content."].join("\n"));
      }
      setRunning(null);
      try {
        window.dispatchEvent(new CustomEvent("trusteye:refresh"));
      } catch {
        // ignore
      }
    }

    return (
      <div className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] font-semibold text-[var(--te-text)]">Command Center</div>
          <div className="text-[12px] text-[var(--te-muted)]">{domain}</div>
        </div>

        {statusTop ? (
          <div className="mt-2 rounded-xl border border-[var(--te-border)] bg-[#fbfcff] px-3 py-2 text-[12px] text-[var(--te-text)]">
            <pre className="whitespace-pre-wrap">{statusTop}</pre>
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-[var(--te-muted)]">
            Click <span className="font-semibold">Discover</span> first. Then use <span className="font-semibold">Recommend</span> to turn gaps into publishable content.
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl bg-[var(--te-accent)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
            onClick={() => runEngine("discover")}
            disabled={Boolean(running)}
          >
            {running === "discover" ? "Discovering…" : "Discover"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)] disabled:opacity-60"
            onClick={() => runEngine("recommend")}
            disabled={Boolean(running)}
            title="Uses discovered facts + demand signals to propose only what's needed."
          >
            {running === "recommend" ? "Recommending…" : "Recommend"}
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          {answerTop ? (
            <div className="rounded-xl border border-[var(--te-border)] bg-white p-2 text-[12px]">
              <pre className="whitespace-pre-wrap text-[12px] text-[var(--te-text)]">{answerTop}</pre>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] outline-none focus:border-[rgba(27,98,248,0.55)]"
              placeholder="Ask a question (answers from discovery only)…"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                void answerFromDiscovery(input);
                setInput("");
              }}
              aria-label="Ask from discovery"
              disabled={Boolean(running)}
            />
            <button
              type="button"
              className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)] disabled:opacity-60"
              onClick={() => {
                void answerFromDiscovery(input);
                setInput("");
              }}
              disabled={Boolean(running) || !input.trim()}
            >
              Ask
            </button>
          </div>
          <div className="text-[12px] text-[var(--te-muted)]">Q&A is grounded in discovered facts only. No content is created here.</div>
        </div>
      </div>
    );
  }, [answerTop, domain, input, running, setRailState, statusTop]);

  return (
    <div className="h-full">
      <RightRail railState={railState} setRailState={setRailState} refreshToken={refreshToken} customerDomain={domain} footer={footer} />
    </div>
  );
}

