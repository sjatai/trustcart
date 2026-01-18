import { getStoreProducts } from "@/lib/storeDb";
import { ProductCard } from "@/components/store/ProductCard";

function stripHtml(html?: string | null) {
  const s = String(html || "");
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default async function ProductsPage() {
  const products = await getStoreProducts();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="te-h1">Products</h1>
        <div className="te-meta mt-2">20 products seeded from discovery crawl.</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p: any) => (
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
    </div>
  );
}

