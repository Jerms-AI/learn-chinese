import { describe, it, expect } from "vitest";
import { sampleGradient, parseColor, computeFrame } from "@/lib/visualizer/engine";
import { DEFAULT_PROFILES } from "@/lib/visualizer/profile";

describe("parseColor", () => {
  it("parses #rrggbb", () => {
    expect(parseColor("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
  });
  it("parses shorthand #rgb", () => {
    expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0 });
  });
});

describe("sampleGradient", () => {
  const stops = [
    { pos: 0, color: "#000000" },
    { pos: 1, color: "#ffffff" },
  ];
  it("returns the first stop at p=0", () => {
    expect(sampleGradient(stops, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });
  it("returns the last stop at p=1", () => {
    expect(sampleGradient(stops, 1)).toEqual({ r: 255, g: 255, b: 255 });
  });
  it("interpolates the midpoint", () => {
    const mid = sampleGradient(stops, 0.5);
    expect(mid.r).toBeCloseTo(127.5, 1);
  });
  it("clamps below the first and above the last stop", () => {
    expect(sampleGradient(stops, -1)).toEqual({ r: 0, g: 0, b: 0 });
    expect(sampleGradient(stops, 2)).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe("computeFrame", () => {
  const base = {
    from: DEFAULT_PROFILES.speaking,
    to: DEFAULT_PROFILES.speaking,
    k: 1,
    bands: [] as number[],
    t: 0,
  };

  it("emits one colored point per shared point count", () => {
    const frame = computeFrame({ ...base, level: 0 });
    expect(frame.points).toHaveLength(DEFAULT_PROFILES.speaking.pointCount);
    expect(typeof frame.points[0].color).toBe("string");
  });

  it("grows the form when loudness rises (sizeStrength > 0)", () => {
    const quiet = computeFrame({ ...base, level: 0 });
    const loud = computeFrame({ ...base, level: 1 });
    const reach = (pts: { x: number; y: number }[]) =>
      Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));
    expect(reach(loud.points)).toBeGreaterThan(reach(quiet.points));
  });
});
