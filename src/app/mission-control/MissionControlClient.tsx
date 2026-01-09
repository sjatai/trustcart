"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sendMissionControlMessage } from "@/lib/chatClient";
import { MissionControlShell } from "@/components/MissionControlShell";
import { SubtitleOverlayPlayer, type SubtitleCue } from "@/components/SubtitleOverlayPlayer";
import { RightRail } from "@/components/RightRail";
import { AgentStepsAccordion, flattenReceipts } from "@/components/mission-control/AgentStepsAccordion";
import type { AgentStep } from "@/components/ui/AgentStepCard";
import { useLocalStorageFlag } from "@/lib/useLocalStorageFlag";

type Step = AgentStep;
type OverlayCue = SubtitleCue;
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

function HeroSite({ overlays, enabled }: { overlays: OverlayCue[]; enabled: boolean }) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <iframe title="demo-site" src="/site" className="h-full w-full" style={{ border: 0 }} />
      <SubtitleOverlayPlayer enabled={enabled} cues={overlays} />
    </div>
  );
}

function MissionDrawer({
  onOverlays,
  onLastCommand,
  onSuccessfulRun,
  onRunComplete,
}: {
  onOverlays: (cues: OverlayCue[]) => void;
  onLastCommand: (cmd: string) => void;
  onSuccessfulRun: () => void;
  onRunComplete: () => void;
}) {
  const [input, setInput] = useState("Onboard reliablenissan.com");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Mission Control is the only control plane.\nTry: “Onboard reliablenissan.com” or “Generate intent graph”.",
    },
  ]);
  const [composerExpanded, setComposerExpanded] = useState(true);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [expandedStepIdx, setExpandedStepIdx] = useState<number | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [demoMode, setDemoMode] = useLocalStorageFlag("trusteye_demo_mode", true);
  const [autoRunNext, setAutoRunNext] = useLocalStorageFlag("trusteye_auto_run_next", true);

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
      setMessages((m) => [...m, { id: `u_${Date.now()}`, role: "user", text: trimmed }]);
      const res = await sendMissionControlMessage(trimmed);
      setSteps(res.steps || []);
      onOverlays(res.overlays || []);

      const assistantText: string = res.assistantMessage || "—";
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", text: assistantText }]);

      const next = extractNextCommand(assistantText);
      if (next) setInput(next);

      setLastCommand(trimmed);
      onLastCommand(trimmed);

      // Collapsible composer after first successful run
      setComposerExpanded(false);

      // Default: only latest run expanded
      setExpandedStepIdx((res.steps || []).length ? (res.steps || []).length - 1 : null);

      // Shell: auto collapse drawer after successful run
      onSuccessfulRun();
      onRunComplete();
    } finally {
      setLoading(false);
    }
  }

  const lastAssistant = useMemo(() => {
    const a = [...messages].reverse().find((m) => m.role === "assistant");
    return a?.text || "";
  }, [messages]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_420px]">
      <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--te-border)] bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[12px] font-semibold text-[var(--te-muted)]">Demo Runner</div>
            <select
              className="h-9 rounded-xl border border-[var(--te-border)] bg-white px-2 text-[13px] text-[var(--te-text)]"
              value={demoScript[demoIdx]?.id}
              onChange={(e) => {
                const idx = demoScript.findIndex((d) => d.id === e.target.value);
                if (idx >= 0) setDemoIdx(idx);
              }}
              aria-label="Demo Runner selection"
            >
              {demoScript.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-lg border border-[var(--te-border)] bg-white px-3 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
              onClick={() => setInput(demoScript[demoIdx]?.command || "")}
            >
              Load
            </button>
            <button
              type="button"
              className="rounded-lg bg-[var(--te-accent)] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-60"
              onClick={() => run(demoScript[demoIdx]?.command)}
              disabled={loading}
            >
              Run
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--te-border)] bg-white px-3 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)] disabled:opacity-60"
              onClick={() => {
                const next = Math.min(demoScript.length - 1, demoIdx + 1);
                setDemoIdx(next);
                const cmd = demoScript[next]?.command || "";
                setInput(cmd);
                if (autoRunNext && cmd) run(cmd);
              }}
              disabled={loading || demoIdx >= demoScript.length - 1}
            >
              Next
            </button>
            <label className="flex items-center gap-2 rounded-lg border border-[var(--te-border)] bg-white px-2 py-1 text-[12px] text-[var(--te-text)]">
              <input type="checkbox" checked={autoRunNext} onChange={(e) => setAutoRunNext(e.target.checked)} />
              Auto-run Next
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="te-meta">Demo Mode</div>
            <button
              type="button"
              className={`mc-toggle ${demoMode ? "mc-toggleOn" : ""}`.trim()}
              onClick={() => setDemoMode(!demoMode)}
              aria-pressed={demoMode}
              aria-label="Toggle Demo Mode"
              title="Demo Mode"
            >
              <span className="mc-toggleKnob" />
            </button>
          </div>
        </div>

        <div className="flex-none">
          {composerExpanded ? (
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full rounded-xl border border-[var(--te-border)] bg-white px-3 py-2 text-[14px] outline-none focus:border-[rgba(27,98,248,0.55)]"
                placeholder="Try: Generate intent graph"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
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
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--te-border)] bg-[#fbfcff] px-3 py-2">
              <div className="min-w-0">
                <div className="text-[12px] text-[var(--te-muted)]">Last command</div>
                <div className="truncate text-[13px] font-semibold text-[var(--te-text)]">{lastCommand || "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--te-border)] bg-white px-3 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
                  onClick={() => {
                    setInput(lastCommand || input);
                    setComposerExpanded(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--te-accent)] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-60"
                  onClick={() => run(lastCommand)}
                  disabled={loading || !lastCommand}
                >
                  Run again
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-[var(--te-border)] bg-white p-3">
          {demoMode ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-[var(--te-border)] bg-white p-3">
                <div className="text-[12px] font-semibold text-[var(--te-muted)]">Assistant response</div>
                <div className="mt-2 whitespace-pre-wrap text-[14px] text-[var(--te-text)]">{lastAssistant || "—"}</div>
              </div>
              {loading ? (
                <div className="rounded-2xl border border-[var(--te-border)] bg-white p-3">
                  <div className="text-[12px] font-semibold text-[var(--te-muted)]">TrustEye</div>
                  <div className="mt-2 text-[13px] text-[var(--te-muted)]">running…</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3" aria-label="Chat transcript">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={[
                    "rounded-2xl border border-[var(--te-border)] p-3",
                    m.role === "user" ? "bg-[#fbfcff]" : "bg-white",
                  ].join(" ")}
                >
                  <div className="text-[12px] font-semibold text-[var(--te-muted)]">{m.role === "user" ? "You" : "TrustEye"}</div>
                  <div className="mt-2 whitespace-pre-wrap text-[14px] text-[var(--te-text)]">{m.text}</div>
                </div>
              ))}
              {loading ? (
                <div className="rounded-2xl border border-[var(--te-border)] bg-white p-3">
                  <div className="text-[12px] font-semibold text-[var(--te-muted)]">TrustEye</div>
                  <div className="mt-2 text-[13px] text-[var(--te-muted)]">running…</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white p-3">
        <div className="text-[14px] font-semibold text-[var(--te-text)]">Receipts</div>
        {!demoMode ? <div className="mt-2 text-[12px] text-[var(--te-muted)]">Click a receipt to jump to the step.</div> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {flattenReceipts(steps).length === 0 ? (
            <div className="text-[12px] text-[var(--te-muted)]">No receipts yet.</div>
          ) : (
            flattenReceipts(steps).map((r, i) => (
              <button
                key={i}
                type="button"
                className="rounded-full border border-[var(--te-border)] bg-white px-3 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
                title={r.summary}
                onClick={() => {
                  setExpandedStepIdx(r.stepIdx);
                  const el = stepRefs.current[r.stepIdx];
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {r.kind}
              </button>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-[var(--te-border)] pt-4">
          <div className="text-[14px] font-semibold text-[var(--te-text)]">{demoMode ? "What happened" : "Agent steps"}</div>
          <div className="mt-2 text-[12px] text-[var(--te-muted)]">
            {demoMode ? "Agents (collapsed). Expand a row to see details." : "Collapsed rows; latest run expanded by default."}
          </div>
          <div className="mt-3 min-h-0 overflow-auto">
            {steps.length === 0 ? (
              <div className="text-[12px] text-[var(--te-muted)]">Run a command to see agent steps.</div>
            ) : (
              <AgentStepsAccordion
                steps={steps}
                openIdx={expandedStepIdx}
                onOpenIdxChange={setExpandedStepIdx}
                onRefsReady={(refs) => (stepRefs.current = refs)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MissionControlClient({ initialPresentation }: { initialPresentation: boolean }) {
  const [overlays, setOverlays] = useState<OverlayCue[]>([]);
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
      hero={<HeroSite overlays={overlays} enabled={presentation} />}
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
      drawer={({ onSuccessfulRun }) => (
        <MissionDrawer
          onOverlays={setOverlays}
          onLastCommand={setLastCommand}
          onSuccessfulRun={onSuccessfulRun}
          onRunComplete={() => setRefreshToken((n) => n + 1)}
        />
      )}
    />
  );
}


