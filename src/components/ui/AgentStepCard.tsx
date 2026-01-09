type Receipt = { kind: string; id?: string; summary: string };

export type AgentStep = {
  agent: string;
  read: string[];
  decide: string[];
  do: string[];
  receipts: Receipt[];
};

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="te-stepSectionTitle">{title}</div>
      <ul className="te-stepList">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function AgentStepCard({ step, index }: { step: AgentStep; index?: number }) {
  const stepNum = typeof index === "number" ? index + 1 : undefined;
  return (
    <div className="te-stepCard">
      <div className="te-stepTitleRow">
        <div style={{ fontWeight: 700 }}>{step.agent}</div>
        {stepNum ? <div className="te-meta">step {stepNum}</div> : null}
      </div>

      <Section title="Read" items={step.read || []} />
      <Section title="Decide" items={step.decide || []} />
      <Section title="Do" items={step.do || []} />

      {(step.receipts || []).length > 0 ? (
        <div>
          <div className="te-stepSectionTitle">Receipts</div>
          <ul className="te-stepList">
            {(step.receipts || []).map((r, i) => (
              <li key={i}>
                <code style={{ fontSize: 12 }}>{r.kind}</code>: {r.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}


