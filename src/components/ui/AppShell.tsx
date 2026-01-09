import type { ReactNode } from "react";

export function AppShell({
  title,
  subtitle,
  left,
  center,
  right,
}: {
  title?: string;
  subtitle?: string;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  return (
    <main className="te-container">
      {title ? (
        <header style={{ marginBottom: 14 }}>
          <h1 className="te-h1">{title}</h1>
          {subtitle ? <div className="te-meta" style={{ marginTop: 6 }}>{subtitle}</div> : null}
        </header>
      ) : null}
      <div className="te-shell">
        <div>{left}</div>
        <div>{center}</div>
        <div>{right}</div>
      </div>
    </main>
  );
}


