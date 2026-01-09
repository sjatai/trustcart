import type { ReactNode } from "react";

export function MetricPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="te-pill">
      <span style={{ fontWeight: 600, color: "var(--te-text)" }}>{label}</span>
      <span>{value}</span>
    </span>
  );
}


