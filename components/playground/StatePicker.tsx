"use client";

import { VISUALIZER_STATES, type VisualizerState } from "@/lib/visualizer/profile";

export type PreviewMode = VisualizerState | "auto";

/** Pick which state to force-preview (and therefore edit), or "auto" to follow
 *  the real signals from the triggers. */
export function StatePicker({
  value,
  onChange,
}: {
  value: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  const modes: PreviewMode[] = [...VISUALIZER_STATES, "auto"];
  return (
    <div className="flex flex-wrap gap-1">
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded px-3 py-1 text-xs capitalize transition ${
            value === m ? "bg-terracotta text-white" : "border border-ink-soft/20 bg-card text-ink"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
