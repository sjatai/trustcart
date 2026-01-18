import { getActiveRecommendations, getAssetMarkdown, getStoreBlogAssets, parseMarkdownHeading } from "@/lib/storeDb";
import { BlogCard } from "@/components/store/BlogCard";
import { TrustEyeRecommendBar } from "@/components/store/TrustEyeRecommendBar";

export default async function BlogPage() {
  const assets = await getStoreBlogAssets();
  const recs = await getActiveRecommendations("sunnystep.com");
  const blogRecs = (recs || []).filter((r: any) => String(r.publishTarget) === "BLOG");
  const posts = assets.map((a) => {
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
    <div className="grid gap-6">
      <div>
        <h1 className="te-h1">Blog</h1>
        <div className="te-meta mt-2">Blog inventory seeded from discovery crawl.</div>
      </div>

      <TrustEyeRecommendBar domain="sunnystep.com" label="Blog" recommendations={blogRecs as any} />

      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((p) => (
          <BlogCard key={p.id} post={p as any} />
        ))}
      </div>
    </div>
  );
}

