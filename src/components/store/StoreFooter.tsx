import Link from "next/link";

export function StoreFooter() {
  return (
    <footer className="border-t border-[var(--te-border)] bg-[var(--te-bg)]">
      <div className="te-container">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <div className="text-sm font-semibold">sunnystep.com</div>
            <div className="te-meta" style={{ marginTop: 8 }}>
              A SunnyStep-inspired demo storefront for BET. Built to show “content → publish → score improves” in a single flow.
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">Explore</div>
            <div className="mt-2 flex flex-col gap-2">
              <Link className="te-meta hover:underline" href="/products">
                Products
              </Link>
              <Link className="te-meta hover:underline" href="/blog">
                Blog
              </Link>
              <Link className="te-meta hover:underline" href="/faq">
                FAQ
              </Link>
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">Demo</div>
            <div className="te-meta mt-2">
              Tip: use the right-rail Inspect panel to publish product/blog/FAQ answers and watch your trust + AI readiness improve.
            </div>
          </div>
        </div>
        <div className="te-meta" style={{ marginTop: 18 }}>
          © {new Date().getFullYear()} BET demo
        </div>
      </div>
    </footer>
  );
}

