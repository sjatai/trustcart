import { useMemo } from "react";

export type RightRailTab = "intent" | "knowledge" | "scores" | "receipts" | "growth";

const LABELS: Record<RightRailTab, string> = {
  intent: "Intent Graph",
  knowledge: "Knowledge",
  scores: "Scores",
  receipts: "Receipts",
  growth: "Growth",
};

export function RightRailTabs({
  active,
  onChange,
  counts,
}: {
  active: RightRailTab;
  onChange: (tab: RightRailTab) => void;
  counts?: Partial<Record<RightRailTab, number>>;
}) {
  const tabs = useMemo(() => Object.keys(LABELS) as RightRailTab[], []);

  return (
    <nav className="te-tabs" aria-label="Intelligence rail tabs">
      {tabs.map((t) => {
        const isActive = active === t;
        const count = counts?.[t];
        return (
          <button
            key={t}
            type="button"
            className={`te-tab ${isActive ? "te-tabActive" : ""}`.trim()}
            onClick={() => onChange(t)}
            aria-current={isActive ? "page" : undefined}
          >
            {LABELS[t]}
            {typeof count === "number" ? <span style={{ marginLeft: 6, opacity: 0.7 }}>({count})</span> : null}
          </button>
        );
      })}
    </nav>
  );
}


