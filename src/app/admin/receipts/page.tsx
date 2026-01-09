import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminReceiptsPage() {
  const domain = "reliablenissan.com";
  const customer = await prisma.customer.findUnique({ where: { domain } });
  const receipts = customer
    ? await prisma.receipt.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <main className="te-container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 className="te-h1">Receipts</h1>
        <Link className="te-tab" href="/admin">
          Back
        </Link>
      </div>
      <div className="te-meta" style={{ marginTop: 8 }}>
        Latest 50 receipts for <b>{domain}</b>.
      </div>

      <div className="te-panel" style={{ marginTop: 16 }}>
        <div className="te-panelHeader">
          <div>
            <div className="te-h2">Receipt ledger</div>
            <div className="te-meta" style={{ marginTop: 4 }}>
              Canonical audit trail (kind/actor/summary). Expand a row for input/output JSON.
            </div>
          </div>
        </div>
        <div className="te-panelBody">
          {!customer ? (
            <div className="te-meta">Customer not found: {domain}</div>
          ) : receipts.length === 0 ? (
            <div className="te-meta">No receipts yet. Run seed.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="te-meta" style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid var(--te-border)" }}>
                      createdAt
                    </th>
                    <th className="te-meta" style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid var(--te-border)" }}>
                      kind
                    </th>
                    <th className="te-meta" style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid var(--te-border)" }}>
                      actor
                    </th>
                    <th className="te-meta" style={{ textAlign: "left", padding: "10px 10px", borderBottom: "1px solid var(--te-border)" }}>
                      summary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: "10px 10px", borderBottom: "1px solid var(--te-border)", whiteSpace: "nowrap" }}>
                        <span className="te-meta">{new Date(r.createdAt).toLocaleString()}</span>
                      </td>
                      <td style={{ padding: "10px 10px", borderBottom: "1px solid var(--te-border)", whiteSpace: "nowrap" }}>
                        <span className="te-pill">{r.kind}</span>
                      </td>
                      <td style={{ padding: "10px 10px", borderBottom: "1px solid var(--te-border)", whiteSpace: "nowrap" }}>
                        <span className="te-pill">{r.actor}</span>
                      </td>
                      <td style={{ padding: "10px 10px", borderBottom: "1px solid var(--te-border)" }}>
                        <details>
                          <summary style={{ cursor: "pointer" }}>
                            <span style={{ fontWeight: 700 }}>{r.summary}</span>
                          </summary>
                          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                              <div className="te-meta">input</div>
                              <pre style={{ marginTop: 6, fontSize: 12, overflow: "auto", padding: 10, borderRadius: 12, border: "1px solid var(--te-border)", background: "#fbfcff" }}>
                                {JSON.stringify(r.input, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="te-meta">output</div>
                              <pre style={{ marginTop: 6, fontSize: 12, overflow: "auto", padding: 10, borderRadius: 12, border: "1px solid var(--te-border)", background: "#fbfcff" }}>
                                {JSON.stringify(r.output, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}


