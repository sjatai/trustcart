import Link from "next/link";
import { getAssetMarkdown, getStoreBlogAssets, getStoreProducts, parseMarkdownHeading } from "@/lib/storeDb";
import { ProductCard } from "@/components/store/ProductCard";
import { BlogCard } from "@/components/store/BlogCard";

function stripHtml(html?: string | null) {
  const s = String(html || "");
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default async function StoreHomePage() {
  const [products, assets] = await Promise.all([getStoreProducts("sunnystep.com", 6), getStoreBlogAssets("sunnystep.com", 3)]);
  const featured = products;
  const blogPicks = assets.map((a) => {
    const md = getAssetMarkdown(a);
    const { title } = parseMarkdownHeading(md);
    return {
      id: a.id,
      slug: String(a.slug || ""),
      headline: title || String(a.title || "Blog"),
      description: String(a.meta && (a.meta as any).excerpt ? (a.meta as any).excerpt : "").trim() || String(a.title || ""),
      image: String(a.meta && (a.meta as any).imageUrl ? (a.meta as any).imageUrl : ""),
    };
  });

  return (
    <div className="grid gap-10">
      <section className="te-panel overflow-hidden">
        <div className="relative te-panelBody">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(900px 420px at 20% 0%, rgba(27,98,248,0.12), transparent 60%), radial-gradient(900px 420px at 80% 0%, rgba(120,56,255,0.10), transparent 55%)",
            }}
          />
          <div className="relative grid gap-6 md:grid-cols-[1.25fr_0.75fr] md:items-center">
            <div>
              <h1 className="te-h1">SunnyStep - Trust Cart</h1>
              <p className="te-body mt-4" style={{ maxWidth: 720 }}>
                A SunnyStep-inspired storefront for demo: products, blog, FAQ, and a right-rail <b>Inspect</b> panel that turns scattered content into{" "}
                <b>published answers</b> — and boosts trust + AI readiness.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/products" className="te-button no-underline hover:no-underline">
                  Shop the 20 bestsellers
                </Link>
                <Link href="/blog" className="te-button te-buttonSecondary no-underline hover:no-underline">
                  Read the blog
                </Link>
                <span className="te-pill">Right rail: inspect · gaps · recommendations</span>
              </div>
            </div>

            <div className="te-panel" style={{ background: "#ffffff" }}>
              <div className="te-panelBody">
                <div className="text-sm font-semibold">Trustcart.ai understands your customer and builds trust by:</div>
                <div className="mt-3 grid gap-2">
                  <div className="te-meta">1) Understanding products, content, and the industry of a brand</div>
                  <div className="te-meta">
                    2) Using advanced AI/ML to analyze what targeted customers look for: products, information, value, and trust
                  </div>
                  <div className="te-meta">3) Deep gap analysis of the offering — tracked with a trust score for the brand</div>
                  <div className="te-meta">
                    4) Creating recommendations + content to increase trust score (resulting in more sales)
                  </div>
                  <div className="te-meta">5) Understanding customer intent and driving real-time growth actions for conversion</div>
                </div>
                <div className="mt-4 te-divider" />
                <div className="mt-4 te-meta">
                  <b>Create Trust. Create Growth.</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="te-h2">Featured products</h2>
            <div className="te-meta mt-1">Supportive, structured comfort — designed for long walking and standing.</div>
          </div>
          <Link className="te-meta hover:underline" href="/products">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p: any) => (
            <ProductCard
              key={p.id}
              product={{
                id: p.id,
                slug: String(p.handle || ""),
                name: String(p.title || ""),
                brand: p.vendor,
                description: stripHtml(p.descriptionHtml),
                images: Array.isArray(p.images) ? p.images : [],
                priceCurrency: p.currency || "SGD",
                price: p.priceMin ?? null,
              }}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="te-h2">Community story</h2>
            <div className="te-meta mt-1">Comfort science, movement, and the why behind better footwear.</div>
          </div>
          <Link className="te-meta hover:underline" href="/blog">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {blogPicks.map((b: any) => (
            <BlogCard key={b.id} post={b} />
          ))}
        </div>
      </section>

      <section className="te-panel">
        <div className="te-panelBody">
          <div className="grid gap-2">
            <div className="text-sm font-semibold">Demo note</div>
            <div className="te-meta">
              Use the right-rail Inspect panel (Discovery → Demand Signals → Recommendations) to publish only what’s missing.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

