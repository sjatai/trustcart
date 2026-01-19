import { getActiveRecommendations, getAssetMarkdown, getStoreBlogAssets, parseMarkdownHeading } from "@/lib/storeDb";
import { BlogCard } from "@/components/store/BlogCard";
import { TrustEyeRecommendBar } from "@/components/store/TrustEyeRecommendBar";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const assets = await getStoreBlogAssets();
  const recs = await getActiveRecommendations("sunnystep.com");
  const blogRecsAll = (recs || []).filter((r: any) => String(r.publishTarget) === "BLOG");
  // We only want the "recommended blog" UI when there's something to *do* (draft/approve/publish).
  // If the recommendation is already PUBLISHED, hide the rec UI and show the blog card once in the normal list.
  const blogRecs = blogRecsAll.filter((r: any) => String(r.status || "").toUpperCase() !== "PUBLISHED");
  const featuredRec =
    blogRecs.find((r: any) => String(r.title || "").toLowerCase().includes("comfort science for walking + running")) || blogRecs[0];
  const sortedBlogRecs = featuredRec ? [featuredRec, ...blogRecs.filter((r: any) => r?.id !== featuredRec?.id)] : blogRecs;
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
  const comfortSlug = "comfort-science-walking-running";
  const hasComfortPost = posts.some((p) => p.slug === comfortSlug);
  const sortedPostsRaw = hasComfortPost
    ? [
        ...posts.filter((p) => p.slug === comfortSlug),
        ...posts.filter((p) => p.slug !== comfortSlug),
      ]
    : posts;
  const showRecommendedBlogCard = sortedBlogRecs.length > 0;
  const showBlogRecsUi = sortedBlogRecs.length > 0;
  // Avoid duplicate: if we are showing the recommended blog editor flow for the comfort post,
  // hide the already-published comfort post card from the list until the rec is published.
  const sortedPosts =
    showRecommendedBlogCard && hasComfortPost ? sortedPostsRaw.filter((p) => p.slug !== comfortSlug) : sortedPostsRaw;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="te-h1">Blog</h1>
        <div className="te-meta mt-2">Blog inventory seeded from discovery crawl.</div>
      </div>

      {showBlogRecsUi ? <TrustEyeRecommendBar domain="sunnystep.com" label="Blog" recommendations={sortedBlogRecs as any} /> : null}

      {showRecommendedBlogCard ? (
        <div className="rounded-2xl border border-[var(--te-border)] bg-white p-4">
          <div className="text-[12px] font-semibold text-[var(--te-text)]">Recommended blog</div>
          {hasComfortPost ? <div className="mt-1 text-[12px] text-[var(--te-muted)]">Already created — open the editor/publish flow here.</div> : null}
          <div className="mt-2 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            {/* Dedicated hero image for the recommended blog card (avoid reusing an older blog post's hero). */}
            <div
              className="rounded-xl border border-[var(--te-border)] bg-[#fbfcff]"
              style={{
                // Prefer the demo AVIF if present; fallback to the SVG hero.
                backgroundImage:
                  "url(/images/blogs/woman_doing_run_walk_method.avif), url(/api/assets/images/blogs/00_comfort-science_hero.svg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                aspectRatio: "4 / 3",
              }}
            />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[var(--te-text)]">{String(sortedBlogRecs[0]?.title || "Recommended blog")}</div>
              <div className="mt-1 text-[12px] text-[var(--te-muted)]">
                Lifestyle content (comfort science, walking/running, recovery). Add an image + publish when ready.
              </div>
              <div className="mt-3">
                <Link
                  className="rounded-xl border border-[rgba(27,98,248,0.25)] bg-[rgba(27,98,248,0.06)] px-3 py-2 text-[12px] font-semibold text-slate-900 hover:bg-[rgba(27,98,248,0.09)]"
                  href={`/drafts/${sortedBlogRecs[0].id}?domain=sunnystep.com`}
                >
                  Open recommended content
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {sortedPosts.map((p) => (
          <BlogCard key={p.id} post={p as any} />
        ))}
      </div>
    </div>
  );
}

