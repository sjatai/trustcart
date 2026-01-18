import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveRecommendations, getStoreProduct, getStoreProducts } from "@/lib/storeDb";
import { TrustEyeInlineEditor } from "@/components/store/TrustEyeInlineEditor";

function featureSet(name: string) {
  const base = [
    "Structured insole support for long walking days",
    "Velvet-soft cushioning to reduce pressure hotspots",
    "Flexible uppers that adapt to foot shape (minimal break-in)",
    "Wider toe room for relaxed movement",
    "Durable traction for everyday city surfaces",
  ];
  const extra =
    name.toLowerCase().includes("sneaker")
      ? ["Breathable upper engineered for all-day wear", "Stable heel construction for confident steps"]
      : name.toLowerCase().includes("loafer") || name.toLowerCase().includes("derby")
        ? ["Polished silhouette that dresses up easily", "Support built in — not added as an afterthought"]
        : ["Lightweight feel for standing, commuting, and travel", "Clean lines that work with minimalist wardrobes"];

  return [...base.slice(0, 3), ...extra, ...base.slice(3)];
}

export async function generateStaticParams() {
  const products = await getStoreProducts();
  return products.map((p: any) => ({ slug: String(p.handle || "") }));
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const product = await getStoreProduct("sunnystep.com", params.slug);
  if (!product) notFound();

  const [recs] = await Promise.all([getActiveRecommendations("sunnystep.com")]);
  const productRecs = (recs || []).filter((r: any) => String(r.publishTarget) === "PRODUCT" && String(r.productHandle || "") === params.slug);
  const autoRec = typeof searchParams?.rec === "string" ? searchParams?.rec : null;

  const rawImages = Array.isArray((product as any).images) ? ((product as any).images as any[]) : [];
  const images = rawImages.map((p) => {
    const s = String(p || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return `/api/assets/${s}`;
  }).filter(Boolean);
  const hero = images[0] || "";
  const second = images[1] || images[0] || "";
  const publishedPatch = (product as any).patches?.find((p: any) => String(p.status) === "PUBLISHED") || null;
  const publishedLines = String(publishedPatch?.bodyMd || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="te-meta">
            <Link href="/products" className="hover:underline">
              Products
            </Link>{" "}
            / {params.slug}
          </div>
          <h1 className="te-h1 mt-2">{String((product as any).title || "")}</h1>
          <div className="te-meta mt-2">
            <span style={{ color: "var(--te-text)", fontWeight: 700 }}>
              {String((product as any).currency || "SGD")} {typeof (product as any).priceMin === "number" ? Math.round((product as any).priceMin / 100) : ""}
            </span>{" "}
            · handle: {params.slug}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="te-pill">In stock</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="te-panel overflow-hidden bg-white">
          <div className="relative aspect-[4/3] w-full">
            {hero ? <Image alt={String((product as any).title || "Product")} src={hero} fill unoptimized className="object-cover" /> : null}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="te-panel">
            <div className="te-panelBody">
              <div className="text-sm font-semibold">Overview</div>
              <div
                className="te-body mt-2"
                dangerouslySetInnerHTML={{ __html: String((product as any).descriptionHtml || "") }}
              />

              {publishedLines.length ? (
                <div className="mt-3 rounded-2xl border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.06)] px-4 py-3">
                  <div className="text-[13px] font-semibold text-[var(--te-text)]">Published (on-site)</div>
                  <div className="mt-2 te-meta whitespace-pre-wrap">{publishedLines.join("\n")}</div>
                </div>
              ) : null}

              <TrustEyeInlineEditor
                domain="sunnystep.com"
                recommendations={productRecs as any}
                autoOpenRecId={autoRec}
                autoDraft
                showRegenerate={false}
              />
            </div>
          </div>

          <div className="te-panel overflow-hidden bg-white">
            <div className="relative aspect-[4/3] w-full">
              {second ? (
                <Image alt={`${String((product as any).title || "Product")} secondary image`} src={second} fill unoptimized className="object-cover" />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="te-panel">
          <div className="te-panelHeader">
            <div className="text-sm font-semibold">Key benefits</div>
            <div className="te-meta">Built for walking + standing</div>
          </div>
          <div className="te-panelBody">
            <ul className="te-stepList">
              {featureSet(String((product as any).title || "")).map((f) => (
                <li key={f} className="te-body">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

