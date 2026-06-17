import { describe, it, expect } from "vitest";
import { clampGlobals, DEFAULT_GLOBALS, GLOBAL_SCHEMA } from "@/lib/visualizer/config";
import { computeFrame } from "@/lib/visualizer/engine";
import { DEFAULT_PROFILES } from "@/lib/visualizer/profile";

describe("clampGlobals", () => {
  it("clamps every knob into its schema range", () => {
    const wild = { ...DEFAULT_GLOBALS, glowMult: 999, posMult: -5, flowWidth: 0 };
    const c = clampGlobals(wild);
    expect(c.glowMult).toBe(5);
    expect(c.posMult).toBe(0);
    expect(c.flowWidth).toBe(0.02);
  });

  it("has a schema entry for every key", () => {
    const keys = GLOBAL_SCHEMA.map((l) => l.key).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_GLOBALS).sort());
  });
});

describe("computeFrame config", () => {
  const base = {
    from: DEFAULT_PROFILES.speaking,
    to: DEFAULT_PROFILES.speaking,
    k: 1,
    level: 1,
    bands: [0.5, 0.5, 0.5, 0.5],
    t: 0,
  };
  const reach = (pts: { x: number; y: number }[]) =>
    Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));

  it("defaults to the shipped multipliers when no config is passed", () => {
    const withDefault = computeFrame(base);
    const withExplicit = computeFrame({ ...base, config: DEFAULT_GLOBALS });
    expect(reach(withDefault.points)).toBeCloseTo(reach(withExplicit.points), 5);
  });

  it("a bigger posMult pushes points further out", () => {
    // Varied bands — mean-centered displacement is zero for a flat spectrum.
    const varied = { ...base, bands: [1, 0, 0.8, 0.1, 0.9, 0, 0.6, 0.05] };
    const low = computeFrame({ ...varied, config: { ...DEFAULT_GLOBALS, posMult: 0.1 } });
    const high = computeFrame({ ...varied, config: { ...DEFAULT_GLOBALS, posMult: 1.8 } });
    expect(reach(high.points)).toBeGreaterThan(reach(low.points));
  });
});
