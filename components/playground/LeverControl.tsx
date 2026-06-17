"use client";

import type { ColorStop, LeverSpec } from "@/lib/visualizer/profile";
import { GradientEditor } from "./GradientEditor";

type LeverValue = number | string | ColorStop[];

/** Render one profile lever, chosen by its schema-declared type. This is the
 *  whole point of the schema: add a lever to PROFILE_SCHEMA and a control for
 *  it appears here automatically. */
export function LeverControl({
  spec,
  value,
  onChange,
  help,
}: {
  spec: LeverSpec;
  value: LeverValue;
  onChange: (v: LeverValue) => void;
  help?: string;
}) {
  const Help = help ? <p className="mt-0.5 text-[10px] leading-snug text-ink-soft/70">{help}</p> : null;

  if (spec.type === "number") {
    const v = value as number;
    const display = spec.step < 1 ? v.toFixed(2) : Math.round(v).toString();
    return (
      <label className="block">
        <div className="flex justify-between text-xs text-ink-soft">
          <span>{spec.label}</span>
          <span className="tabular-nums">{display}</span>
        </div>
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={v}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full"
        />
        {Help}
      </label>
    );
  }

  if (spec.type === "select") {
    return (
      <div>
        <label className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-soft">{spec.label}</span>
          <select
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="rounded border border-ink-soft/20 bg-card px-2 py-1 text-xs text-ink"
          >
            {spec.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        {Help}
      </div>
    );
  }

  if (spec.type === "color") {
    return (
      <div>
        <label className="flex items-center justify-between">
          <span className="text-xs text-ink-soft">{spec.label}</span>
          <input
            type="color"
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="h-6 w-10 rounded border border-ink-soft/20 bg-transparent"
          />
        </label>
        {Help}
      </div>
    );
  }

  // gradient
  return (
    <div>
      <div className="mb-1 text-xs text-ink-soft">{spec.label}</div>
      <GradientEditor stops={value as ColorStop[]} onChange={onChange} />
      {Help}
    </div>
  );
}
