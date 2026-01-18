import Link from "next/link";

export function StoreHeader() {
  return (
    <header className="border-b border-[var(--te-border)] bg-[var(--te-bg)]/80 backdrop-blur">
      <div className="te-container" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="no-underline hover:no-underline">
              <span className="text-[15px] font-semibold tracking-[-0.01em]">SunnySteps</span>
            </Link>
            <span className="te-meta">demo store</span>
          </div>

          <nav className="flex items-center gap-4">
            <Link className="te-meta hover:underline" href="/products">
              Products
            </Link>
            <Link className="te-meta hover:underline" href="/blog">
              Blog
            </Link>
            <Link className="te-meta hover:underline" href="/faq">
              FAQ
            </Link>
            <span className="te-meta">|</span>
            <Link className="te-meta hover:underline" href="/mission-control">
              Mission Control
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

