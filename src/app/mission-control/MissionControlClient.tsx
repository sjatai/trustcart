"use client";

import { useEffect, useMemo, useState } from "react";
import { sendMissionControlMessage } from "@/lib/chatClient";
import { MissionControlShell } from "@/components/MissionControlShell";
import { RightRail } from "@/components/RightRail";
import type { AgentStep } from "@/components/ui/AgentStepCard";

type Step = AgentStep;

// Versioned key so old demo selections (e.g. Nissan) don't leak into the SunnySteps-only demo.
const DOMAIN_STORAGE_KEY = "trusteye_customer_domain_v2";

function normalizeDomain(domainOrUrl: string): string {
  const raw = String(domainOrUrl || "").trim();
  if (!raw) return "";
  if (raw.includes("://")) {
    try {
      const host = new URL(raw).hostname.toLowerCase();
      return host.startsWith("www.") ? host.slice(4) : host;
    } catch {
      // fall through
    }
  }
  const noProto = raw.replace(/^\/\//, "");
  const hostish = noProto.split("/")[0]?.split("?")[0]?.split("#")[0] || noProto;
  const host = hostish.trim().toLowerCase();
  const noWww = host.startsWith("www.") ? host.slice(4) : host;
  return noWww === "sunnysteps.com" ? "sunnystep.com" : noWww;
}

function getConfiguredDomains() {
  // Single-domain demo mode per Domain_flow_core.MD.
  const demo = "sunnystep.com";
  return { presentation: demo, test: demo, options: [demo] };
}

function getScriptedCommands(domain: string): string[] {
  return [
    `Onboard ${domain}`,
    `Generate intent graph for ${domain} (top 20)`,
    "Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score.",
    "Generate Trust Pack for top 5 gaps and route for approval.",
    "Approve and publish the top 2 assets.",
    "Launch a test-drive campaign; only if safe. Dry-run if needed.",
    "Summarize outcomes and next 3 highest ROI moves.",
  ];
}

function extractNextCommand(text: string): string | null {
  const matches: string[] = [];
  const re = /[“"]([^”"]+)[”"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = (m[1] || "").trim();
    if (!s) continue;
    if (s.length > 140) continue;
    matches.push(s);
  }
  return matches.length ? matches[0] : null;
}

function HeroSite({ path }: { path: string }) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <iframe key={path} title="demo-site" src={path} className="h-full w-full" style={{ border: 0 }} />
    </div>
  );
}

function withDomain(path: string, domain: string): string {
  const p = String(path || "/site");
  const d = normalizeDomain(domain);
  if (!d) return p;
  // Use a dummy base to safely parse relative paths.
  const url = new URL(p, "http://local");
  url.searchParams.set("domain", d);
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}

function MissionDrawer({
  customerDomain,
  setCustomerDomain,
  onLastCommand,
  onRunComplete,
}: {
  customerDomain: string;
  setCustomerDomain: (domain: string) => void;
  onLastCommand: (cmd: string) => void;
  onRunComplete: () => void;
}) {
  const domains = getConfiguredDomains();
  const [input, setInput] = useState(getScriptedCommands(customerDomain)[0]);
  const [loading, setLoading] = useState(false);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [scriptIdx, setScriptIdx] = useState(0);
  const [domainInput, setDomainInput] = useState(customerDomain);

  useEffect(() => {
    setScriptIdx(0);
    setInput(getScriptedCommands(customerDomain)[0]);
    setDomainInput(customerDomain);
  }, [customerDomain]);

  async function run(cmd?: string) {
    const trimmed = (cmd ?? input).trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await sendMissionControlMessage(trimmed, customerDomain);

      const assistantText: string = res.assistantMessage || "—";

      const scripts = getScriptedCommands(customerDomain);
      const currentScript = scripts[scriptIdx] || "";
      const nextScript = scripts[Math.min(scripts.length - 1, scriptIdx + 1)] || "";
      const ranCurrentScript = Boolean(currentScript) && trimmed === currentScript;

      if (ranCurrentScript && nextScript && scriptIdx < scripts.length - 1) {
        setScriptIdx((i) => Math.min(scripts.length - 1, i + 1));
        setInput(nextScript);
      } else {
        const next = extractNextCommand(assistantText);
        if (next) setInput(next);
      }

      setLastCommand(trimmed);
      onLastCommand(trimmed);

      onRunComplete();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
          className="w-[260px] rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[14px] outline-none focus:border-[rgba(27,98,248,0.55)]"
          placeholder="Domain (e.g. sunnystep.com)"
          aria-label="Domain"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const next = normalizeDomain(domainInput);
            if (!next) return;
            setCustomerDomain(next);
            setScriptIdx(0);
            setInput(getScriptedCommands(next)[0]);
          }}
        />
        <button
          type="button"
          className="rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[14px] font-semibold text-[var(--te-text)] hover:border-[rgba(27,98,248,0.45)]"
          onClick={() => {
            const next = normalizeDomain(domainInput);
            if (!next) return;
            setCustomerDomain(next);
            setScriptIdx(0);
            setInput(getScriptedCommands(next)[0]);
          }}
          aria-label="Load domain"
          title="Load domain"
        >
          Load
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[14px] outline-none focus:border-[rgba(27,98,248,0.55)]"
          placeholder="Try: Generate intent graph"
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          aria-label="Command input"
        />
        <button
          type="button"
          onClick={() => run()}
          disabled={loading}
          className="rounded-xl bg-[var(--te-accent)] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Running…" : "Run"}
        </button>
      </div>
    </div>
  );
}

export function MissionControlClient({ initialPresentation: _initialPresentation }: { initialPresentation: boolean }) {
  // Memoize to avoid recreating options array every render (which can cause infinite effects).
  const domains = useMemo(() => getConfiguredDomains(), []);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [customerDomain, setCustomerDomain] = useState<string>(domains.test);
  const [sitePath, setSitePath] = useState("/site");
  const iframePath = withDomain(sitePath, customerDomain);

  // Hydrate selected domain from localStorage (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DOMAIN_STORAGE_KEY);
    const normalized = stored ? normalizeDomain(stored) : "";
    if (normalized) setCustomerDomain(normalized);
  }, []);

  // Persist selected domain.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalized = normalizeDomain(customerDomain);
    if (!normalized) return;
    window.localStorage.setItem(DOMAIN_STORAGE_KEY, normalized);
  }, [customerDomain]);

  useEffect(() => {
    function handleNavigate(event: Event) {
      const ce = event as CustomEvent<{ path?: string }>;
      const next = ce?.detail?.path;
      if (next && typeof next === "string") {
        setSitePath(next);
      }
    }
    window.addEventListener("trusteye:navigateSite", handleNavigate);
    return () => window.removeEventListener("trusteye:navigateSite", handleNavigate);
  }, []);

  return (
    <MissionControlShell
      hero={<HeroSite path={iframePath} />}
      rail={({ railState, setRailState }) => (
        <RightRail
          railState={railState}
          setRailState={setRailState}
          refreshToken={refreshToken}
          customerDomain={customerDomain}
        />
      )}
      lastCommand={lastCommand}
      drawer={() => (
        <MissionDrawer
          customerDomain={customerDomain}
          setCustomerDomain={setCustomerDomain}
          onLastCommand={setLastCommand}
          onRunComplete={() => setRefreshToken((n) => n + 1)}
        />
      )}
    />
  );
}


