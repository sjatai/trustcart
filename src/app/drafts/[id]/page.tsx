import Link from "next/link";
import { prisma } from "@/lib/db";
import { getDomainFromSearchParams, getCustomerByDomain } from "@/lib/domain";
import DraftEditorClient from "./ui/DraftEditorClient";

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const domain = getDomainFromSearchParams(searchParams);
  const customer = await getCustomerByDomain(domain);
  const rec = await prisma.contentRecommendation.findUnique({ where: { id: params.id } });

  if (!rec || rec.customerId !== customer.id) {
    return (
      <main className="te-container">
        <div className="te-panel">
          <div className="te-panelHeader">
            <div className="te-h2">Draft not found</div>
            <Link className="te-tab" href={`/mission-control?domain=${encodeURIComponent(domain)}`}>
              Back
            </Link>
          </div>
          <div className="te-panelBody te-meta">No recommendation exists for {domain} with id {params.id}.</div>
        </div>
      </main>
    );
  }

  const draftMd = String((rec.llmEvidence as any)?.draft?.content?.bodyMarkdown || "");
  const suggested = String(rec.suggestedContent || "");

  return (
    <main className="te-container" style={{ maxWidth: 1180 }}>
      <div className="te-panel">
        <div className="te-panelHeader" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div>
            <div className="te-h2">Draft: {rec.title}</div>
            <div className="te-meta" style={{ marginTop: 6 }}>
              Domain: <b>{domain}</b> · Status: <b>{rec.status}</b> · Target: <b>{rec.targetUrl}</b>
            </div>
          </div>
          <Link className="te-tab" href={`/mission-control?domain=${encodeURIComponent(domain)}`}>
            Back to Mission Control
          </Link>
        </div>
        <div className="te-panelBody">
          <DraftEditorClient
            domain={domain}
            recommendationId={rec.id}
            initial={draftMd || suggested}
            kind={rec.kind}
          />
        </div>
      </div>
    </main>
  );
}

