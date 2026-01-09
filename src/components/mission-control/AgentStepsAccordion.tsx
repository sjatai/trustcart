"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AgentStep } from "@/components/ui/AgentStepCard";

export function flattenReceipts(steps: AgentStep[]) {
  const items: { stepIdx: number; receiptIdx: number; kind: string; summary: string }[] = [];
  steps.forEach((s, stepIdx) => {
    (s.receipts || []).forEach((r, receiptIdx) => {
      items.push({ stepIdx, receiptIdx, kind: r.kind, summary: r.summary });
    });
  });
  return items;
}

export function AgentStepsAccordion({
  steps,
  openIdx,
  onOpenIdxChange,
  onRefsReady,
}: {
  steps: AgentStep[];
  openIdx: number | null;
  onOpenIdxChange: (idx: number | null) => void;
  onRefsReady?: (refs: Array<HTMLDivElement | null>) => void;
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    onRefsReady?.(refs.current);
  }, [onRefsReady, steps.length]);

  const receiptCounts = useMemo(() => steps.map((s) => (s.receipts || []).length), [steps]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            className="te-stepCard"
          >
            <button
              type="button"
              onClick={() => onOpenIdxChange(isOpen ? null : idx)}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>{s.agent}</div>
                <div className="te-meta">{receiptCounts[idx]} receipts</div>
              </div>
            </button>

            {isOpen ? (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div className="te-stepSectionTitle">Read</div>
                <ul className="te-stepList">{(s.read || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                <div className="te-stepSectionTitle">Decide</div>
                <ul className="te-stepList">{(s.decide || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                <div className="te-stepSectionTitle">Do</div>
                <ul className="te-stepList">{(s.do || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                <div className="te-stepSectionTitle">Receipts</div>
                <ul className="te-stepList">
                  {(s.receipts || []).map((r, i) => (
                    <li key={i}>
                      <code style={{ fontSize: 12 }}>{r.kind}</code>: {r.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}


