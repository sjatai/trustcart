"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sendMissionControlMessage } from "@/lib/chatClient";
import { MissionControlShell } from "@/components/MissionControlShell";
import { RightRail } from "@/components/RightRail";
import type { AgentStep } from "@/components/ui/AgentStepCard";

type Step = AgentStep;
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

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

function HeroSite() {
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <iframe title="demo-site" src="/site" className="h-full w-full" style={{ border: 0 }} />
    </div>
  );
}

function MissionDrawer({
  onLastCommand,
  onRunComplete,
}: {
  onLastCommand: (cmd: string) => void;
  onRunComplete: () => void;
}) {
  const [input, setInput] = useState("Onboard reliablenissan.com");
  const [loading, setLoading] = useState(false);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const demoScript = useMemo(
    () => [
      { id: "act1", label: "Act 1: Onboard", command: "Onboard reliablenissan.com" },
      { id: "act2", label: "Act 2: Intent graph", command: "Generate intent graph for Reliable Nissan (top 20)" },
      { id: "act3", label: "Act 3: Probe AI", command: "Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score." },
      { id: "act4", label: "Act 4: Generate Trust Pack", command: "Generate Trust Pack for top 5 gaps and route for approval." },
      { id: "act5", label: "Act 5: Publish", command: "Approve and publish the top 2 assets." },
      { id: "act6", label: "Act 6: Growth (safe)", command: "Launch a test-drive campaign; only if safe. Dry-run if needed." },
      { id: "act7", label: "Act 7: Summary", command: "Summarize outcomes and next 3 highest ROI moves." },
    ],
    []
  );
  const [demoIdx, setDemoIdx] = useState(0);

  async function run(cmd?: string) {
    const trimmed = (cmd ?? input).trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await sendMissionControlMessage(trimmed);

      const assistantText: string = res.assistantMessage || "—";
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", text: assistantText }]);

      const currentScript = demoScript[demoIdx]?.command || "";
      const nextScript = demoScript[Math.min(demoScript.length - 1, demoIdx + 1)]?.command || "";
      const ranCurrentScript = Boolean(currentScript) && trimmed === currentScript;

      if (ranCurrentScript && nextScript && demoIdx < demoScript.length - 1) {
        setDemoIdx((i) => Math.min(demoScript.length - 1, i + 1));
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
      {lastCommand ? (
        <div className="mt-2 text-[12px] text-[var(--te-muted)]">Last run: {lastCommand}</div>
      ) : null}
    </div>
  );
}

export function MissionControlClient({ initialPresentation }: { initialPresentation: boolean }) {
  const [lastCommand, setLastCommand] = useState<string>("");
  const [presentation, setPresentationState] = useState<boolean>(initialPresentation);
  const [refreshToken, setRefreshToken] = useState(0);

  const router = useRouter();
  const pathname = usePathname();

  const setPresentation = (on: boolean) => {
    setPresentationState(on);
    try {
      const sp = new URLSearchParams(window.location.search || "");
      if (on) sp.set("presentation", "true");
      else sp.delete("presentation");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : `${pathname}`);
    } catch {
      router.replace(on ? `${pathname}?presentation=true` : `${pathname}`);
    }
  };

  return (
    <MissionControlShell
      hero={<HeroSite />}
      presentationToggle={
        <button
          type="button"
          className={[
            "rounded-lg border px-2 py-1 text-[12px]",
            presentation ? "border-[rgba(27,98,248,0.45)] bg-[rgba(27,98,248,0.08)]" : "border-[var(--te-border)] bg-white",
          ].join(" ")}
          onClick={() => setPresentation(!presentation)}
          aria-pressed={presentation}
          aria-label="Toggle presentation mode"
          title="Presentation mode"
        >
          Presentation
        </button>
      }
      rail={({ railState, setRailState }) => (
        <RightRail railState={railState} setRailState={setRailState} refreshToken={refreshToken} />
      )}
      lastCommand={lastCommand}
      drawer={() => (
        <MissionDrawer
          onLastCommand={setLastCommand}
          onRunComplete={() => setRefreshToken((n) => n + 1)}
        />
      )}
    />
  );
}


