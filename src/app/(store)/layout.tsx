import type { ReactNode } from "react";
import { Manrope, Playfair_Display } from "next/font/google";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { StoreInspectRail } from "@/components/store/StoreInspectRail";
import { StoreAnalyticsClient } from "@/components/store/StoreAnalyticsClient";

import "./store.css";

const storeSans = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--ss-font-sans",
});

const storeDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--ss-font-display",
});

export default async function StoreLayout({ children }: { children: ReactNode }) {
  return (
    // Atlas-style split pane: only the left pane scrolls, the right rail stays fixed,
    // and the command center is pinned to the bottom of the visible viewport.
    <div className={`ss-store ${storeSans.variable} ${storeDisplay.variable} flex h-[100dvh] flex-col overflow-hidden`}>
      <StoreHeader />
      <StoreAnalyticsClient />
      <div className="flex-1 overflow-hidden">
        <div className="te-container h-full">
          <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_36%]">
            <main className="min-w-0 min-h-0 overflow-y-auto overscroll-contain" style={{ scrollbarGutter: "stable" as any }}>
              {children}
              <div className="mt-10">
                <StoreFooter />
              </div>
            </main>
            <aside className="min-w-0 min-h-0 h-full">
              <StoreInspectRail domain="sunnystep.com" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

