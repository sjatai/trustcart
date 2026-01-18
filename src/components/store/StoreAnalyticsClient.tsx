"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { STORE_DEMO_KEYS, type ViewCounters } from "@/lib/store-demo/state";

function readViews(): ViewCounters {
  try {
    const raw = localStorage.getItem(STORE_DEMO_KEYS.views);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ViewCounters;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeViews(v: ViewCounters) {
  try {
    localStorage.setItem(STORE_DEMO_KEYS.views, JSON.stringify(v));
  } catch {
    // ignore
  }
}

export function StoreAnalyticsClient() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const key = pathname;
    const views = readViews();
    views[key] = (views[key] || 0) + 1;
    writeViews(views);
  }, [pathname]);

  return null;
}

