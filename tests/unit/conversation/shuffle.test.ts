import { describe, it, expect } from "vitest";
import { shuffled } from "@/lib/conversation/orchestrator";

/** Deterministic rng for tests: cycles through fixed values. */
function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("shuffled", () => {
  it("returns a new array with the same elements", () => {
    const input = ["a", "b", "c", "d", "e"];
    const out = shuffled(input, fixedRng([0.5, 0.1, 0.9, 0.3]));
    expect(out).not.toBe(input);
    expect(input).toEqual(["a", "b", "c", "d", "e"]); // input untouched
    expect([...out].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("actually changes order for a non-trivial rng", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffled(input, fixedRng([0.9, 0.2, 0.7, 0.4, 0.05]));
    expect(out).not.toEqual(input);
  });

  it("is deterministic for a fixed rng", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const rngValues = [0.8, 0.3, 0.6, 0.1, 0.9];
    const a = shuffled(input, fixedRng(rngValues));
    const b = shuffled(input, fixedRng(rngValues));
    expect(a).toEqual(b);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffled([], fixedRng([0.5]))).toEqual([]);
    expect(shuffled([42], fixedRng([0.5]))).toEqual([42]);
  });
});
