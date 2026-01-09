import type { OverlayCue } from "@/lib/agents/types";

export const Overlays = {
  authority: (): OverlayCue => ({ id: "authority", text: "Authority starts with verified facts." }),
  demandAnswers: (): OverlayCue => ({ id: "demand", text: "Demand is answered questions." }),
  testAI: (): OverlayCue => ({ id: "test_ai", text: "We test what AI believes." }),
  publishAnswers: (): OverlayCue => ({ id: "publish", text: "We publish verified answers." }),
  measurable: (): OverlayCue => ({ id: "measurable", text: "Visibility becomes measurable." }),
  gated: (): OverlayCue => ({ id: "gated", text: "Automation is gated by trust." }),
  birdeyeSOR: (): OverlayCue => ({ id: "sor", text: "Birdeye stays the system of record." }),
} as const;
