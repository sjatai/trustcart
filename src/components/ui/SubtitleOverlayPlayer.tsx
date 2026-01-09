"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SubtitleCue = { id: string; text: string };

export function SubtitleOverlayPlayer({
  cues,
  presentation,
}: {
  cues: SubtitleCue[];
  presentation: boolean;
}) {
  const enabled = presentation && (cues?.length || 0) > 0;
  const queue = useMemo(() => (enabled ? cues : []), [cues, enabled]);

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const current = queue[idx]?.text || "";

  const advance = () => {
    setVisible(false);
    window.setTimeout(() => {
      setIdx((i) => ((i + 1) % Math.max(1, queue.length)) || 0);
    }, 260);
  };

  useEffect(() => {
    setIdx(0);
    setVisible(false);
    if (!enabled) return;

    const tick = () => {
      // Show current cue
      setVisible(true);
      // Fade out near the end
      window.setTimeout(() => setVisible(false), 3150);
      // Advance at 3.5s
      timerRef.current = window.setTimeout(() => {
        setIdx((i) => ((i + 1) % queue.length) || 0);
        tick();
      }, 3500);
    };

    tick();

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled, queue.length]);

  if (!enabled) return null;

  return (
    <div className="te-subtitle" aria-live="polite" aria-atomic="true">
      <div className={`te-subtitleInner ${visible ? "te-subtitleVisible" : ""}`.trim()}>{current}</div>
      {presentation ? (
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center", pointerEvents: "auto" }}>
          <button type="button" className="te-tab" onClick={advance}>
            Next subtitle
          </button>
        </div>
      ) : null}
    </div>
  );
}


