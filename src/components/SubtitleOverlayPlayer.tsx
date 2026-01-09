"use client";

import { useEffect, useMemo, useState } from "react";

export type SubtitleCue = { id: string; text: string };

export function SubtitleOverlayPlayer({
  enabled,
  cues,
}: {
  enabled: boolean;
  cues: SubtitleCue[];
}) {
  const safeCues = useMemo(() => (Array.isArray(cues) ? cues.filter((c) => c?.text) : []), [cues]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setIdx(0);
    setVisible(true);
  }, [safeCues.length]);

  useEffect(() => {
    if (!enabled) return;
    if (!safeCues.length) return;
    const interval = window.setInterval(() => {
      // fade out → swap → fade in
      setVisible(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % safeCues.length);
        setVisible(true);
      }, 220);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [enabled, safeCues.length]);

  if (!enabled || safeCues.length === 0) return null;
  const cue = safeCues[idx]!;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex items-end justify-center px-3">
      <div className="pointer-events-none relative w-full max-w-[920px]">
        <div
          className={[
            "pointer-events-none rounded-xl bg-black/70 px-4 py-3 text-[14px] leading-snug text-white",
            "transition-opacity duration-200 ease-out",
            visible ? "opacity-100" : "opacity-0",
          ].join(" ")}
          aria-live="polite"
        >
          {cue.text}
        </div>

        <div className="pointer-events-auto absolute -top-10 right-0">
          <button
            type="button"
            className="rounded-lg border border-black/10 bg-white/90 px-3 py-1 text-[12px] text-slate-900 hover:bg-white"
            onClick={() => setIdx((i) => (i + 1) % safeCues.length)}
            aria-label="Next subtitle"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}


