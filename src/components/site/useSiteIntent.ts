"use client";

import { useEffect, useState } from "react";
import type { PrimaryIntent } from "@/lib/siteIntent";

const KEY = "trusteye_primary_intent";

export function getStoredIntent(): PrimaryIntent {
  if (typeof window === "undefined") return "unknown";
  const v = window.localStorage.getItem(KEY);
  return (v as PrimaryIntent) || "unknown";
}

export function setStoredIntent(intent: PrimaryIntent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, intent);
  window.dispatchEvent(new CustomEvent("trusteye:intent", { detail: { intent } }));
}

export function useSiteIntent() {
  // Important: keep the initial render deterministic across SSR + client hydration.
  // We intentionally do NOT read localStorage during initial render to avoid
  // server/client mismatches when a previous intent is stored.
  const [intent, setIntent] = useState<PrimaryIntent>("unknown");

  useEffect(() => {
    // Hydrate from localStorage after mount (safe).
    setIntent(getStoredIntent());
    const onStorage = () => setIntent(getStoredIntent());
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<{ intent?: PrimaryIntent }>;
      if (ce?.detail?.intent) setIntent(ce.detail.intent);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("trusteye:intent", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("trusteye:intent", onCustom);
    };
  }, []);

  return intent;
}


