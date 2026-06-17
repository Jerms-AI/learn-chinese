"use client";

import { useEffect, useRef } from "react";
import { readSpectrum } from "@/lib/visualizer/audio";

/** A live bar of the analyser's current loudness (mic while recording, TTS
 *  while speaking). Updates the bar width directly via a ref each frame so it
 *  doesn't re-render React 60×/sec. Makes "is it hearing me?" unambiguous. */
export function MicLevelMeter() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { level } = readSpectrum();
      if (barRef.current) {
        // ×2 so normal speech fills a satisfying chunk of the bar
        barRef.current.style.width = `${Math.min(100, level * 200)}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-ink-soft">signal</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-soft/15">
        <div
          ref={barRef}
          className="h-full bg-emerald-500"
          style={{ width: "0%" }}
        />
      </div>
    </div>
  );
}
