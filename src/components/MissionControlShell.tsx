"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export type RailState = "collapsed" | "normal" | "expanded";
export type DrawerState = "collapsed" | "normal" | "expanded";

const RAIL_WIDTH: Record<RailState, number> = { collapsed: 56, normal: 420, expanded: 720 };
const DRAWER_HEIGHT: Record<DrawerState, number> = { collapsed: 72, normal: 300, expanded: 420 };

function cycleRailState(s: RailState): RailState {
  if (s === "collapsed") return "normal";
  if (s === "normal") return "expanded";
  return "normal";
}

function railTooltip(s: RailState) {
  if (s === "collapsed") return "Expand panel";
  if (s === "normal") return "Expand panel (wide)";
  return "Shrink panel";
}

function cycleDrawerState(s: DrawerState): DrawerState {
  if (s === "collapsed") return "normal";
  if (s === "normal") return "expanded";
  return "collapsed";
}

export function MissionControlShell({
  hero,
  rail,
  drawer,
  presentationToggle,
  lastCommand,
  onAfterSuccessfulRunCollapse,
}: {
  hero: ReactNode;
  rail: (args: {
    railState: RailState;
    setRailState: (s: RailState) => void;
  }) => ReactNode;
  drawer: (args: {
    drawerState: DrawerState;
    setDrawerState: (s: DrawerState) => void;
    onSuccessfulRun: () => void;
  }) => ReactNode;
  presentationToggle?: ReactNode;
  lastCommand?: string;
  onAfterSuccessfulRunCollapse?: () => void;
}) {
  const [railState, setRailState] = useState<RailState>("normal");
  const [drawerState, setDrawerState] = useState<DrawerState>("normal");

  // Persist rail state in localStorage.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("trusteye:railState");
      if (raw === "collapsed" || raw === "normal" || raw === "expanded") setRailState(raw);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("trusteye:railState", railState);
    } catch {}
  }, [railState]);

  const railWidth = useMemo(() => RAIL_WIDTH[railState], [railState]);
  const drawerHeight = useMemo(() => DRAWER_HEIGHT[drawerState], [drawerState]);

  return (
    <div className="mx-auto h-[100vh] max-h-[100vh] max-w-[1280px] bg-[var(--te-bg)] p-4 md:p-6">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
        {/* Top: hero + rail */}
        <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[1fr_auto]">
          <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white">
            {hero}
          </div>

          <div
            className="min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white"
            style={{ width: railWidth }}
          >
            <div className="flex h-12 items-center justify-between gap-2 border-b border-[var(--te-border)] px-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-[var(--te-text)]">
                  {railState === "collapsed" ? "" : "Intelligence"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {presentationToggle}
                {railState !== "collapsed" ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--te-border)] bg-white px-2 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
                    title="Collapse panel"
                    aria-label="Collapse panel"
                    onClick={() => setRailState("collapsed")}
                  >
                    ⇤
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-[var(--te-border)] bg-white px-2 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
                  title={railTooltip(railState)}
                  aria-label={railTooltip(railState)}
                  onClick={() => setRailState((s) => cycleRailState(s))}
                >
                  {railState === "expanded" ? "⤡" : "⤢"}
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-hidden" style={{ height: "calc(100% - 48px)" }}>
              {rail({ railState, setRailState })}
            </div>
          </div>
        </div>

        {/* Bottom drawer */}
        <div
          className="min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white"
          style={{ height: drawerHeight }}
        >
          <div className="flex h-12 items-center justify-between gap-3 border-b border-[var(--te-border)] px-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">Mission Control</div>
              {lastCommand ? (
                <div className="truncate text-[12px] text-[var(--te-muted)]">Last: {lastCommand}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg border border-[var(--te-border)] bg-white px-2 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
              title={drawerState === "collapsed" ? "Expand drawer" : drawerState === "normal" ? "Expand drawer (tall)" : "Collapse drawer"}
              aria-label="Toggle drawer size"
              onClick={() => setDrawerState((s) => cycleDrawerState(s))}
            >
              {drawerState === "collapsed" ? "⤢" : drawerState === "normal" ? "⤢" : "⤡"}
            </button>
          </div>

          <div className="min-h-0 overflow-hidden" style={{ height: "calc(100% - 48px)" }}>
            {drawer({
              drawerState,
              setDrawerState,
              onSuccessfulRun: () => {
                setDrawerState("collapsed");
                onAfterSuccessfulRunCollapse?.();
              },
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


