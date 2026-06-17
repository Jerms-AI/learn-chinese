"use client";

import type { ColorStop } from "@/lib/visualizer/profile";

/** Edit a gradient's color stops. Stored order is left untouched (the engine
 *  sorts when sampling); only the preview bar sorts for display, so editing a
 *  stop's position never reshuffles the rows under your cursor. */
export function GradientEditor({
  stops,
  onChange,
}: {
  stops: ColorStop[];
  onChange: (stops: ColorStop[]) => void;
}) {
  const update = (i: number, patch: Partial<ColorStop>) =>
    onChange(stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(stops.filter((_, idx) => idx !== i));
  const add = () => onChange([...stops, { pos: 1, color: "#ffffff" }]);

  const css = `linear-gradient(to right, ${[...stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${Math.round(s.pos * 100)}%`)
    .join(", ")})`;

  return (
    <div className="space-y-1.5">
      <div className="h-5 rounded border border-ink-soft/20" style={{ background: css }} />
      {stops.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            value={s.color}
            onChange={(e) => update(i, { color: e.target.value })}
            className="h-6 w-8 rounded border border-ink-soft/20 bg-transparent"
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={s.pos}
            onChange={(e) => update(i, { pos: parseFloat(e.target.value) })}
            className="flex-1"
          />
          <span className="w-9 text-right text-[10px] tabular-nums text-ink-soft">
            {Math.round(s.pos * 100)}%
          </span>
          <button
            onClick={() => remove(i)}
            disabled={stops.length <= 1}
            className="text-xs text-ink-soft hover:text-destructive disabled:opacity-30"
            aria-label="Remove stop"
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-terracotta underline">
        + stop
      </button>
    </div>
  );
}
