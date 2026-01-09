"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Cue = { id: string; text: string };

export function SubtitleOverlay({ cues, enabled }: { cues: Cue[]; enabled: boolean }) {
  const queue = useMemo(() => (enabled ? cues || [] : []), [cues, enabled]);
  const [active, setActive] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const idxRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    idxRef.current = 0;
    setActive("");
    setVisible(false);

    if (!queue || queue.length === 0) return;

    const showNext = () => {
      const cue = queue[idxRef.current];
      if (!cue) return;

      setActive(cue.text);
      setVisible(true);

      // ~2.5s display, with fade out at end
      window.setTimeout(() => setVisible(false), 2200);
      timerRef.current = window.setTimeout(() => {
        idxRef.current += 1;
        if (idxRef.current < queue.length) showNext();
      }, 2500);
    };

    showNext();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [queue]);

  if (!enabled || !active) return null;

  return (
    <div className="te-subtitle" aria-live="polite" aria-atomic="true">
      <div className={`te-subtitleInner ${visible ? "te-subtitleVisible" : ""}`.trim()}>{active}</div>
    </div>
  );
}


