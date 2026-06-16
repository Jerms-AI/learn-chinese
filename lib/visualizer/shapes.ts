// Shape generators for the voice visualizer.
//
// Every shape is the SAME cloud of N points placed differently, so the engine
// can morph between any two shapes by interpolating point-by-point. Each
// generator maps point index i (0..n-1) into a unit space roughly within
// [-1, 1], centered on the origin. Pixel scaling + translation happen later in
// the renderer; these are pure geometry.

export type Point = { x: number; y: number };
export type ShapeFn = (i: number, n: number, t: number) => Point;
export type ShapeName = "dot" | "line" | "triangle" | "orb";

const TAU = Math.PI * 2;

/** A small disc — points around a tiny circle so it still has body to glow. */
const dot: ShapeFn = (i, n) => {
  const u = n <= 1 ? 0 : i / n;
  const a = u * TAU;
  const r = 0.42; // a real disc, not a speck — reads as a glowing ball
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

/** A horizontal line, left (-1) to right (+1). Point order = left→right, so the
 *  normalized position p = i/(n-1) runs cleanly along it for ombre gradients. */
const line: ShapeFn = (i, n) => {
  const u = n <= 1 ? 0.5 : i / (n - 1);
  return { x: u * 2 - 1, y: 0 };
};

/** A circle of radius 1, starting at the top and going clockwise. */
const orb: ShapeFn = (i, n) => {
  const u = n <= 0 ? 0 : i / n;
  const a = u * TAU - Math.PI / 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

/** An upward triangle — points walk the three edges in order. */
const triangle: ShapeFn = (i, n) => {
  const u = n <= 0 ? 0 : i / n; // [0, 1)
  const verts: Point[] = [
    { x: 0, y: -1 },
    { x: 0.866, y: 0.5 },
    { x: -0.866, y: 0.5 },
  ];
  const edge = Math.min(2, Math.floor(u * 3));
  const f = u * 3 - edge;
  const a = verts[edge];
  const b = verts[(edge + 1) % 3];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
};

export const SHAPES: Record<ShapeName, ShapeFn> = { dot, line, triangle, orb };
export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/** Shapes that close back on themselves (affects how the renderer connects the
 *  path). A line is open; everything else wraps. */
export const CLOSED_SHAPES: Record<ShapeName, boolean> = {
  dot: true,
  line: false,
  triangle: true,
  orb: true,
};

/** Sample a shape into n points. Unknown names fall back to orb. */
export function shapePoints(name: ShapeName, n: number, t = 0): Point[] {
  const fn = SHAPES[name] ?? orb;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push(fn(i, n, t));
  return pts;
}

/** Linear interpolation between two equal-length point clouds. */
export function morphPoints(a: Point[], b: Point[], k: number): Point[] {
  const n = Math.min(a.length, b.length);
  const out: Point[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      x: a[i].x + (b[i].x - a[i].x) * k,
      y: a[i].y + (b[i].y - a[i].y) * k,
    };
  }
  return out;
}
