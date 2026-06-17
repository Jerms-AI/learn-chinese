import { describe, it, expect } from "vitest";
import { sampleGradient, parseColor, computeFrame, shapeSignal } from "@/lib/visualizer/engine";
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

describe("shapeSignal", () => {
  it("gains up and lifts quiet sounds (gamma < 1)", () => {
    // A quiet 0.1 signal should end up well above its raw value.
    expect(shapeSignal(0.1, 2.6, 0.6, 0.02)).toBeGreaterThan(0.2);
  });
  it("gates true silence to zero", () => {
    expect(shapeSignal(0, 2.6, 0.6, 0.02)).toBe(0);
  });
  it("never exceeds 1", () => {
    expect(shapeSignal(1, 8, 0.5, 0)).toBeLessThanOrEqual(1);
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

  it("tapers the open line's endpoints so a hot low band doesn't pop the edges", () => {
    // Hot lowest band → in mirror layout that lands on BOTH edges (q=0).
    const bands = new Array(48).fill(0);
    bands[0] = 1;
    bands[1] = 1;
    const line = { ...DEFAULT_PROFILES.listening, pitchStrength: 0 }; // isolate displacement
    const frame = computeFrame({ from: line, to: line, k: 1, level: 1, bands, t: 0 });
    const pts = frame.points;
    const endY = Math.abs(pts[0].y);
    const innerY = Math.abs(pts[Math.floor(pts.length * 0.2)].y);
    // The very endpoint is anchored near the baseline; the low-band energy shows
    // just inside it, not as an edge spike.
    expect(endY).toBeLessThan(innerY);
  });

  it("input pitch domes the line up for high pitch, dips it down for low", () => {
    const line = DEFAULT_PROFILES.listening; // shape line, pitchStrength > 0
    const bands = new Array(48).fill(0.3); // flat spectrum → isolate the pitch arch
    const mk = (pitch: number) =>
      computeFrame({ from: line, to: line, k: 1, level: 1, bands, pitch, t: 0 });
    const centerY = (f: ReturnType<typeof mk>) => f.points[Math.floor(f.points.length / 2)].y;
    // High pitch center sits above (smaller y) the low-pitch center.
    expect(centerY(mk(0.9))).toBeLessThan(centerY(mk(0.1)));
    expect(centerY(mk(0.9))).toBeLessThan(0); // domed up, above baseline
    expect(centerY(mk(0.1))).toBeGreaterThan(0); // dipped down, below baseline
  });

  it("pitch arch lifts the line for high-frequency (high pitch) vs low", () => {
    const line = { ...DEFAULT_PROFILES.listening }; // pitchStrength > 0
    const mk = (bands: number[]) =>
      computeFrame({ from: line, to: line, k: 1, level: 1, bands, t: 0 });

    const high = new Array(48).fill(0);
    for (let i = 40; i < 48; i++) high[i] = 1; // bright → centroid high
    const low = new Array(48).fill(0);
    for (let i = 0; i < 8; i++) low[i] = 1; // dark → centroid low

    const meanY = (f: ReturnType<typeof mk>) =>
      f.points.reduce((a, p) => a + p.y, 0) / f.points.length;
    // The WHOLE waveform should sit higher (smaller y) for high pitch than low.
    expect(meanY(mk(high))).toBeLessThan(meanY(mk(low)));
    // And the two should land on opposite sides of the y=0 baseline.
    expect(meanY(mk(high))).toBeLessThan(0);
    expect(meanY(mk(low))).toBeGreaterThan(0);
  });

  it("mirror freqMap puts high-frequency energy at the center of the line", () => {
    // Energy only in the HIGH bands.
    const bands = new Array(48).fill(0);
    for (let i = 40; i < 48; i++) bands[i] = 1;
    // Isolate the frequency layout from the pitch arch.
    const lineMirror = { ...DEFAULT_PROFILES.listening, pitchStrength: 0 };
    const frame = computeFrame({
      from: lineMirror,
      to: lineMirror,
      k: 1,
      level: 1,
      bands,
      t: 0,
    });
    const pts = frame.points;
    const mid = pts[Math.floor(pts.length / 2)];
    const edge = pts[1];
    // Center (high freq) should be displaced far from the baseline; edge (low) near it.
    expect(Math.abs(mid.y)).toBeGreaterThan(Math.abs(edge.y) + 20);
  });
});
