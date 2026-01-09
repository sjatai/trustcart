"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";

export function MissionControlShell({
  topLeft,
  topRight,
  bottom,
}: {
  topLeft: ReactNode;
  topRight: ReactNode;
  bottom: ReactNode;
}) {
  const [expanded, setExpanded] = useState<null | "site" | "rail" | "mission">(null);

  const mk = useMemo(() => {
    function panelWrap(
      id: "site" | "rail" | "mission",
      child: ReactNode,
      opts?: { mode?: "normal" | "main" | "dock" }
    ) {
      const isExpanded = expanded === id;
      const mode = opts?.mode ?? "normal";
      const modeClass = mode === "dock" ? "mc-panelWrapDock" : mode === "main" ? "mc-panelWrapMain" : "";
      return (
        <div className={`mc-panelWrap ${modeClass}`.trim()} data-panel={id}>
          <button
            type="button"
            className="mc-expandBtn"
            aria-label={isExpanded ? "Shrink panel" : "Enlarge panel"}
            title={isExpanded ? "Shrink" : "Enlarge"}
            onClick={() => setExpanded((cur) => (cur === id ? null : id))}
          >
            {isExpanded ? "⤡" : "⤢"}
          </button>
          {child}
        </div>
      );
    }
    return { panelWrap };
  }, [expanded]);

  if (!expanded) {
    return (
      <main className="mc-shell">
        <div className="mc-top">
          {mk.panelWrap("site", <Panel className="mc-scroll">{topLeft}</Panel>)}
          {mk.panelWrap("rail", <Panel className="mc-scroll">{topRight}</Panel>)}
        </div>
        {mk.panelWrap("mission", <Panel className="mc-bottom">{bottom}</Panel>)}
      </main>
    );
  }

  const mainPanel =
    expanded === "site"
      ? mk.panelWrap("site", <Panel className="mc-scroll">{topLeft}</Panel>, { mode: "main" })
      : expanded === "rail"
        ? mk.panelWrap("rail", <Panel className="mc-scroll">{topRight}</Panel>, { mode: "main" })
        : mk.panelWrap("mission", <Panel className="mc-bottom">{bottom}</Panel>, { mode: "main" });

  const dockPanels =
    expanded === "site"
      ? [
          mk.panelWrap("rail", <Panel className="mc-scroll">{topRight}</Panel>, { mode: "dock" }),
          mk.panelWrap("mission", <Panel className="mc-bottom">{bottom}</Panel>, { mode: "dock" }),
        ]
      : expanded === "rail"
        ? [
            mk.panelWrap("site", <Panel className="mc-scroll">{topLeft}</Panel>, { mode: "dock" }),
            mk.panelWrap("mission", <Panel className="mc-bottom">{bottom}</Panel>, { mode: "dock" }),
          ]
        : [
            mk.panelWrap("site", <Panel className="mc-scroll">{topLeft}</Panel>, { mode: "dock" }),
            mk.panelWrap("rail", <Panel className="mc-scroll">{topRight}</Panel>, { mode: "dock" }),
          ];

  return (
    <main className="mc-shell mc-shellExpanded">
      <div className="mc-expandedMain">{mainPanel}</div>
      <div className="mc-expandedDock">{dockPanels}</div>
    </main>
  );
}


