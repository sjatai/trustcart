import Link from "next/link";
import Image from "next/image";

type ProductCardModel = {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  images: string[];
  priceCurrency?: string | null;
  price?: string | number | null;
  isVariant?: boolean;
};

function formatPrice(price: string | number | null | undefined, currency: string | null | undefined) {
  const c = String(currency || "").trim() || "SGD";
  if (price == null) return c;
  if (typeof price === "number") {
    // If it looks like cents, format; otherwise show as-is.
    if (price > 999) return `${c} ${(price / 100).toFixed(0)}`;
    return `${c} ${price}`;
  }
  return `${c} ${String(price)}`;
}

function resolveImageSrc(img?: string) {
  const s = String(img || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `/api/assets/${s}`;
}

export function ProductCard({ product }: { product: ProductCardModel }) {
  const hero = resolveImageSrc(product.images?.[0]);
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group te-panel overflow-hidden no-underline hover:no-underline"
      style={{ display: "block" }}
    >
      <div className="relative aspect-[4/3] w-full bg-white">
        {hero ? (
          <Image
            alt={product.name || "Product"}
            src={hero}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
        {product.isVariant ? (
          <div className="absolute left-3 top-3 te-pill" style={{ background: "rgba(251,252,255,0.92)" }}>
            Limited
          </div>
        ) : null}
      </div>
      <div className="te-panelBody">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{product.name}</div>
            <div className="te-meta mt-1">{product.brand || ""}</div>
          </div>
          <div className="te-pill">
            {formatPrice(product.price, product.priceCurrency)}
          </div>
        </div>
        <div className="te-meta mt-3 line-clamp-2">{product.description || ""}</div>
      </div>
    </Link>
  );
}

