"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export type RailState = "collapsed" | "normal";
export type DrawerState = "normal";

const RAIL_WIDTH = 420;

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
  const [railState, setRailState] = useState<RailState>("collapsed");
  const drawerState: DrawerState = "normal";

  return (
    <div className="mx-auto h-[100vh] max-h-[100vh] max-w-[1280px] bg-[var(--te-bg)] p-4 md:p-6">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-4">
        {/* Header */}
        <div className="rounded-2xl border border-[var(--te-border)] bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[var(--te-text)]">TrustEye</div>
              <div className="truncate text-[12px] text-[var(--te-muted)]">Mission Control</div>
            </div>
            <div className="flex items-center gap-2">
              {presentationToggle}
              <button
                type="button"
                className="rounded-lg border border-[var(--te-border)] bg-white px-3 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
                aria-label={railState === "collapsed" ? "Open Inspect panel" : "Close Inspect panel"}
                title={railState === "collapsed" ? "Open Inspect" : "Close Inspect"}
                onClick={() => setRailState((s) => (s === "collapsed" ? "normal" : "collapsed"))}
              >
                {railState === "collapsed" ? "Inspect" : "Close"}
              </button>
            </div>
          </div>

          <div className="mt-3 border-t border-[var(--te-border)] pt-3">
            {drawer({
              drawerState: "normal",
              setDrawerState: () => {},
              onSuccessfulRun: () => {
                onAfterSuccessfulRunCollapse?.();
              },
            })}
          </div>
        </div>

        {/* Main stage + optional Inspect rail */}
        <div
          className={
            railState === "collapsed"
              ? "min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white"
              : "grid min-h-0 grid-cols-[1fr_auto] gap-4"
          }
        >
          <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white">
            {hero}
          </div>

          {railState === "normal" ? (
            <div
              className="min-h-0 overflow-hidden rounded-2xl border border-[var(--te-border)] bg-white"
              style={{ width: RAIL_WIDTH }}
            >
              <div className="flex h-12 items-center justify-between gap-2 border-b border-[var(--te-border)] px-3">
                <div className="truncate text-[14px] font-semibold text-[var(--te-text)]">Inspect</div>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--te-border)] bg-white px-2 py-1 text-[12px] hover:border-[rgba(27,98,248,0.45)]"
                  title="Close Inspect"
                  aria-label="Close Inspect"
                  onClick={() => setRailState("collapsed")}
                >
                  ⇤
                </button>
              </div>
              <div className="min-h-0 overflow-auto" style={{ height: "calc(100% - 48px)" }}>
                {rail({ railState, setRailState })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
