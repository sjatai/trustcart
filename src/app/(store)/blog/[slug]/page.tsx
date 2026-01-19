import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetMarkdown, getStoreBlogAsset, parseMarkdownHeading } from "@/lib/storeDb";

export const dynamic = "force-dynamic";

function resolveImageSrc(img?: string | null) {
  const s = String(img || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  // If the DB stores a public path like `/images/...`, serve it directly (Vercel static).
  if (s.startsWith("/")) return s;
  // Otherwise treat as a demo asset path (served by /api/assets).
  return `/api/assets/${s.replace(/^\/+/, "")}`;
}

export default async function BlogDetailPage({ params }: { params: { slug: string } }) {
  const asset = await getStoreBlogAsset("sunnystep.com", params.slug);
  if (!asset) notFound();

  const md = getAssetMarkdown(asset);
  const { title, body } = parseMarkdownHeading(md);
  const hero = resolveImageSrc(String((asset as any).meta && (asset as any).meta.imageUrl ? (asset as any).meta.imageUrl : ""));

  return (
    <div className="grid gap-8">
      <div>
        <div className="te-meta">
          <Link href="/blog" className="hover:underline">
            Blog
          </Link>{" "}
          / {params.slug}
        </div>
        <h1 className="te-h1 mt-2">{title || String(asset.title || "Blog")}</h1>
      </div>

      {hero ? (
        <div className="te-panel overflow-hidden bg-white">
          <div className="relative aspect-[16/9] w-full">
            <Image alt={title || "Blog image"} src={hero} fill unoptimized className="object-cover" />
          </div>
        </div>
      ) : (
        <div className="te-panel overflow-hidden bg-white">
          <div className="relative aspect-[16/9] w-full">
            <div className="absolute inset-0 bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#fff7ed]" />
          </div>
        </div>
      )}

      <div className="te-panel">
        <div className="te-panelBody">
          <div className="te-body" style={{ whiteSpace: "pre-wrap" }}>
            {body || md}
          </div>
        </div>
      </div>
    </div>
  );
}

