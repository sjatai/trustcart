import Link from "next/link";
import Image from "next/image";

type BlogCardModel = {
  id: string;
  slug: string;
  headline: string;
  description?: string | null;
  image?: string | null;
};

function resolveImageSrc(img?: string | null) {
  const s = String(img || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `/api/assets/${s}`;
}

export function BlogCard({ post }: { post: BlogCardModel }) {
  const hero = resolveImageSrc(post.image);
  return (
    <Link href={`/blog/${post.slug}`} className="group te-panel overflow-hidden no-underline hover:no-underline" style={{ display: "block" }}>
      <div className="relative aspect-[16/9] w-full bg-white">
        {hero ? (
          <Image alt={post.headline} src={hero} fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#fff7ed]" />
        )}
      </div>
      <div className="te-panelBody">
        <div className="text-sm font-semibold leading-tight">{post.headline}</div>
        <div className="te-meta mt-3 line-clamp-3">{post.description || ""}</div>
      </div>
    </Link>
  );
}

