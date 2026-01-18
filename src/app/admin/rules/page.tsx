import Link from "next/link";
import { prisma } from "@/lib/db";
import { RulesEditorClient } from "@/components/admin/RulesEditorClient";
import { getDomainFromSearchParams } from "@/lib/domain";

export default async function RulesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const domain = getDomainFromSearchParams(searchParams);
  const customer = await prisma.customer.findUnique({ where: { domain } });
  const rules = customer
    ? await prisma.ruleSet.findMany({ where: { customerId: customer.id }, orderBy: { updatedAt: "desc" } })
    : [];

  return (
    <main className="te-container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 className="te-h1">Rules</h1>
        <Link className="te-tab" href="/admin">
          Back
        </Link>
      </div>
      <div className="te-meta" style={{ marginTop: 8 }}>
        Manage RuleSets for {domain}.
      </div>

      <div className="te-panel" style={{ marginTop: 16 }}>
        <div className="te-panelHeader">
          <div>
            <div className="te-h2">RuleSets</div>
            <div className="te-meta" style={{ marginTop: 4 }}>
              Create, edit, and toggle rules. JSON is stored exactly as entered.
            </div>
          </div>
        </div>
        <div className="te-panelBody">
          <div className="te-meta">Create, edit, toggle active, and save JSON rules.</div>
          <RulesEditorClient initialRules={rules} domain={domain} />
        </div>
      </div>
    </main>
  );
}


