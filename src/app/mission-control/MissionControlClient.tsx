"use client";

import { useState } from "react";
import { sendMissionControlMessage } from "@/lib/chatClient";
import { MissionControlShell } from "@/components/MissionControlShell";
import { RightRail } from "@/components/RightRail";
import type { AgentStep } from "@/components/ui/AgentStepCard";

type Step = AgentStep;

const SCRIPTED_COMMANDS = [
  "Onboard reliablenissan.com",
  "Generate intent graph for Reliable Nissan (top 20)",
  "Probe ChatGPT + Gemini for top 8 questions and compute AI visibility score.",
  "Generate Trust Pack for top 5 gaps and route for approval.",
  "Approve and publish the top 2 assets.",
  "Launch a test-drive campaign; only if safe. Dry-run if needed.",
  "Summarize outcomes and next 3 highest ROI moves.",
] as const;

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
  const [scriptIdx, setScriptIdx] = useState(0);

  async function run(cmd?: string) {
    const trimmed = (cmd ?? input).trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await sendMissionControlMessage(trimmed);

      const assistantText: string = res.assistantMessage || "—";

      const currentScript = SCRIPTED_COMMANDS[scriptIdx] || "";
      const nextScript = SCRIPTED_COMMANDS[Math.min(SCRIPTED_COMMANDS.length - 1, scriptIdx + 1)] || "";
      const ranCurrentScript = Boolean(currentScript) && trimmed === currentScript;

      if (ranCurrentScript && nextScript && scriptIdx < SCRIPTED_COMMANDS.length - 1) {
        setScriptIdx((i) => Math.min(SCRIPTED_COMMANDS.length - 1, i + 1));
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
    </div>
  );
}

export function MissionControlClient({ initialPresentation: _initialPresentation }: { initialPresentation: boolean }) {
  const [lastCommand, setLastCommand] = useState<string>("");
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <MissionControlShell
      hero={<HeroSite />}
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


