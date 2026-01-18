import { getActiveRecommendations, getAssetMarkdown, getStoreBlogAssets, parseMarkdownHeading } from "@/lib/storeDb";
import { BlogCard } from "@/components/store/BlogCard";
import { TrustEyeRecommendBar } from "@/components/store/TrustEyeRecommendBar";
import Link from "next/link";

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

      {blogRecs.length ? (
        <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
          <div className="text-[12px] font-semibold text-[var(--te-text)]">Recommended blog</div>
          <div className="mt-2 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            {/* Use an existing Sunnystep-style hero image so it matches the current blog tone */}
            <div
              className="rounded-xl border border-[var(--te-border)] bg-[#fbfcff]"
              style={{
                backgroundImage: "url(/api/assets/images/blogs/11_one-step-at-a-time_hero.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                aspectRatio: "4 / 3",
              }}
            />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">{String(blogRecs[0]?.title || "Recommended blog")}</div>
              <div className="mt-1 text-[12px] text-[var(--te-muted)]">
                Lifestyle content (comfort science, walking/running, recovery). Add an image + publish when ready.
              </div>
              <div className="mt-3">
                <Link className="rounded-xl border border-[rgba(27,98,248,0.25)] bg-[rgba(27,98,248,0.06)] px-3 py-2 text-[12px] font-semibold text-slate-900 hover:bg-[rgba(27,98,248,0.09)]" href={`/drafts/${blogRecs[0].id}?domain=sunnystep.com`}>
                  Open recommended content
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((p) => (
          <BlogCard key={p.id} post={p as any} />
        ))}
      </div>
    </div>
  );
}

