import { describe, it, expect } from "vitest";
import { shapePoints, morphPoints, SHAPE_NAMES } from "@/lib/visualizer/shapes";

describe("shapePoints", () => {
  it("produces the requested number of points for every shape", () => {
    for (const name of SHAPE_NAMES) {
      expect(shapePoints(name, 50)).toHaveLength(50);
    }
  });

  it("places a line from left (-1) to right (+1)", () => {
    const pts = shapePoints("line", 11);
    expect(pts[0].x).toBeCloseTo(-1, 5);
    expect(pts[10].x).toBeCloseTo(1, 5);
    expect(pts[0].y).toBeCloseTo(0, 5);
  });

  it("starts the orb at the top", () => {
    const pts = shapePoints("orb", 4);
    expect(pts[0].x).toBeCloseTo(0, 5);
    expect(pts[0].y).toBeCloseTo(-1, 5);
  });

  it("keeps orb points on the unit circle", () => {
    for (const p of shapePoints("orb", 24)) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 5);
    }
  });

  it("falls back to orb for an unknown shape name", () => {
    // @ts-expect-error testing the runtime fallback
    const pts = shapePoints("nope", 8);
    expect(pts).toHaveLength(8);
    expect(Math.hypot(pts[0].x, pts[0].y)).toBeCloseTo(1, 5);
  });
});

describe("morphPoints", () => {
  it("returns the midpoint of two clouds at k=0.5", () => {
    const a = [{ x: 0, y: 0 }, { x: 2, y: 4 }];
    const b = [{ x: 4, y: 0 }, { x: 0, y: 0 }];
    const mid = morphPoints(a, b, 0.5);
    expect(mid[0]).toEqual({ x: 2, y: 0 });
    expect(mid[1]).toEqual({ x: 1, y: 2 });
  });

  it("returns the source at k=0 and target at k=1", () => {
    const a = [{ x: 1, y: 1 }];
    const b = [{ x: 9, y: 9 }];
    expect(morphPoints(a, b, 0)[0]).toEqual({ x: 1, y: 1 });
    expect(morphPoints(a, b, 1)[0]).toEqual({ x: 9, y: 9 });
  });
});
