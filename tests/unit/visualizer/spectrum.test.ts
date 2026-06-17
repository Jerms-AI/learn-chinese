import { describe, it, expect } from "vitest";
import { sampleLogBands } from "@/lib/visualizer/spectrum";

describe("sampleLogBands", () => {
  it("returns bandCount values, all in 0..1", () => {
    const freq = new Array(128).fill(128);
    const bands = sampleLogBands(freq, 32, 1, 24);
    expect(bands).toHaveLength(32);
    for (const v of bands) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("spreads low-frequency energy across many bands, not just the first few", () => {
    // Energy only in the low bins (1-8) — like a voice.
    const freq = new Array(128).fill(0);
    for (let i = 1; i <= 8; i++) freq[i] = 255;

    const log = sampleLogBands(freq, 32, 1, 24);
    const hotLog = log.filter((v) => v > 0.5).length;

    // A naive LINEAR mapping would concentrate this in ~2 of 32 bands.
    const linear = Array.from({ length: 32 }, (_, b) => freq[Math.floor((b / 32) * 24) + 1] / 255 || 0);
    const hotLinear = linear.filter((v) => v > 0.5).length;

    expect(hotLog).toBeGreaterThan(hotLinear);
    expect(hotLog).toBeGreaterThan(10); // reaches well past the left end
  });

  it("degrades safely on an empty buffer", () => {
    expect(sampleLogBands([], 32, 1, 24)).toEqual(new Array(32).fill(0));
  });
});
