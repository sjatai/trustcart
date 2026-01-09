"use client";

import type { ReactNode } from "react";

export function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.25)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        className="te-panel"
        style={{ width: "min(520px, 92vw)", height: "100%", borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="te-panelHeader">
          <div className="te-h2">{title}</div>
          <button type="button" className="te-tab" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="te-panelBody">{children}</div>
      </div>
    </div>
  );
}


