import { describe, it, expect } from "vitest";
import { autoCorrelate, pitchToNorm } from "@/lib/visualizer/pitch";

function sine(freq: number, sampleRate: number, n: number): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return buf;
}

describe("autoCorrelate", () => {
  const sr = 48000;
  it("detects a low pitch (~120 Hz)", () => {
    expect(autoCorrelate(sine(120, sr, 2048), sr)).toBeCloseTo(120, -1); // within ~10%
  });
  it("detects a high pitch (~280 Hz)", () => {
    expect(autoCorrelate(sine(280, sr, 2048), sr)).toBeCloseTo(280, -1);
  });
  it("returns -1 for silence", () => {
    expect(autoCorrelate(new Float32Array(2048), sr)).toBe(-1);
  });
});

describe("pitchToNorm", () => {
  it("maps the range ends to 0 and 1", () => {
    expect(pitchToNorm(80)).toBeCloseTo(0, 5);
    expect(pitchToNorm(350)).toBeCloseTo(1, 5);
  });
  it("a higher pitch yields a higher norm", () => {
    expect(pitchToNorm(250)).toBeGreaterThan(pitchToNorm(120));
  });
  it("returns -1 for no pitch", () => {
    expect(pitchToNorm(-1)).toBe(-1);
  });
});
