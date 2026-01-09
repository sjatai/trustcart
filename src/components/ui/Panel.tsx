import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`te-panel ${className}`.trim()}>{children}</section>;
}

export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="te-panelHeader">
      <div>
        <div className="te-h2">{title}</div>
        {subtitle ? <div className="te-meta" style={{ marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </header>
  );
}


