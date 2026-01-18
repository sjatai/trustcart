"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PrimaryIntent } from "@/lib/siteIntent";

const KEY = "trusteye_primary_intent";

export type SiteIntentEvent = {
  // High-level event type for demo/analytics.
  type: "page_view" | "section_open" | "cta_shown" | "cta_clicked" | "form_submit";
  // Optional page identifier (eg. "/site/locations/phoenix").
  page?: string;
  // Optional semantic label (eg. "hours", "appointment", "service_pricing").
  label?: string;
  // Anything else you want to attach (kept small).
  meta?: Record<string, unknown>;
};

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

/**
 * Best-effort event record to backend (no blocking, no mock).
 * The backend route already exists at /api/events in this repo.
 */
export async function recordSiteIntentEvent(customerDomain: string | undefined, intent: PrimaryIntent, ev: SiteIntentEvent) {
  if (typeof window === "undefined") return;
  try {
    // keepalive helps on navigation; failures are fine (best-effort).
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // keep payload small to avoid edge/server limits
      body: JSON.stringify({
        type: "site_intent",
        customerDomain,
        intent,
        event: {
          ...ev,
          page: ev.page || window.location.pathname,
        },
      }),
      keepalive: true,
    });
  } catch {
    // Intentionally swallow; demo must never break UX.
  }
}

/**
 * Convenience: set intent + emit + record an event (best-effort).
 */
export async function setIntentAndRecord(
  args: {
    customerDomain?: string;
    intent: PrimaryIntent;
    event: SiteIntentEvent;
  }
) {
  setStoredIntent(args.intent);
  await recordSiteIntentEvent(args.customerDomain, args.intent, args.event);
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

/**
 * Optional richer hook: intent + helpers for rules-driven UX.
 * This does NOT auto-run anything; caller decides when to invoke.
 */
export function useSiteIntentActions(customerDomain?: string) {
  const intent = useSiteIntent();

  const set = useCallback(
    async (next: PrimaryIntent, ev?: SiteIntentEvent) => {
      if (ev) {
        await setIntentAndRecord({ customerDomain, intent: next, event: ev });
      } else {
        setStoredIntent(next);
      }
    },
    [customerDomain]
  );

  const record = useCallback(
    async (ev: SiteIntentEvent) => {
      await recordSiteIntentEvent(customerDomain, intent, ev);
    },
    [customerDomain, intent]
  );

  return useMemo(
    () => ({ intent, setIntent: set, record }),
    [intent, set, record]
  );
}
