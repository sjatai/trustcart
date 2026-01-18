import { FaqAccordion } from "@/components/store/FaqAccordion";
import { getActiveRecommendations, getAssetMarkdown, getStoreFaqAssets, parseMarkdownHeading } from "@/lib/storeDb";

export default async function FaqPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [assets, recs] = await Promise.all([getStoreFaqAssets(), getActiveRecommendations("sunnystep.com")]);
  const autoRec = typeof searchParams?.rec === "string" ? searchParams?.rec : null;
  const items = assets.map((a) => {
    const md = getAssetMarkdown(a);
    const { title, body } = parseMarkdownHeading(md);
    return {
      id: String(a.slug || a.id),
      slug: String(a.slug || ""),
      question: title || String(a.title || ""),
      answer: body || md,
      sourceUrl: String((a.meta as any)?.url || ""),
    };
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="te-h1">FAQ</h1>
        <div className="te-meta mt-2">FAQ inventory seeded from discovery crawl.</div>
      </div>
      <FaqAccordion items={items} recommendations={recs as any} domain="sunnystep.com" autoRecId={autoRec} />
    </div>
  );
}

