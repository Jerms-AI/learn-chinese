// The engine: turn (two profiles + morph progress + live audio + time) into a
// concrete frame of colored points the renderer can draw. Pure & synchronous.

import {
  shapePoints,
  morphPoints,
  CLOSED_SHAPES,
  type Point,
} from "./shapes";
import type { ColorStop, FillMode, Profile } from "./profile";
import { DEFAULT_GLOBALS, type GlobalConfig } from "./config";

const TAU = Math.PI * 2;

export type FramePoint = { x: number; y: number; color: string };

export type Frame = {
  points: FramePoint[]; // px offsets from the visualizer center
  glow: number;
  fill: FillMode;
  softness: number;
  opacity: number;
  backdropBlur: number;
  closed: boolean;
};

export type FrameInput = {
  from: Profile;
  to: Profile;
  k: number; // 0..1 morph progress (from -> to)
  level: number; // overall loudness 0..1
  bands: number[]; // frequency spectrum 0..1 each
  t: number; // seconds
  pitch?: number; // normalized fundamental pitch 0..1 (0.5 neutral); steers the arch
  config?: GlobalConfig; // global multipliers (defaults reproduce shipped look)
};

// --- color helpers (exported for testing) -----------------------------------

type RGB = { r: number; g: number; b: number };

export function parseColor(hex: string): RGB {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRGB(a: RGB, b: RGB, k: number): RGB {
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}

/** Sample a gradient (sorted or not) at position p in [0,1]. */
export function sampleGradient(stops: ColorStop[], p: number): RGB {
  if (stops.length === 0) return { r: 255, g: 255, b: 255 };
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (p <= sorted[0].pos) return parseColor(sorted[0].color);
  const last = sorted[sorted.length - 1];
  if (p >= last.pos) return parseColor(last.color);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (p >= a.pos && p <= b.pos) {
      const span = b.pos - a.pos || 1;
      const f = (p - a.pos) / span;
      return mixRGB(parseColor(a.color), parseColor(b.color), f);
    }
  }
  return parseColor(last.color);
}

// --- scalar / math helpers --------------------------------------------------

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Circular distance on [0,1) — so flow highlights wrap on closed shapes. */
function circDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function bandAt(bands: number[], p: number): number {
  if (bands.length === 0) return 0;
  const idx = Math.min(bands.length - 1, Math.max(0, Math.floor(p * bands.length)));
  return bands[idx];
}

/** Tukey-style edge taper: 1 across the middle, smooth cosine ramp to 0 within
 *  `margin` of each end. Anchors an OPEN form's endpoints so loud low-frequency
 *  bands at the edges don't pop. */
export function edgeTaper(p: number, margin: number): number {
  if (margin <= 0) return 1;
  if (p < margin) return 0.5 * (1 - Math.cos((Math.PI * p) / margin));
  if (p > 1 - margin) return 0.5 * (1 - Math.cos((Math.PI * (1 - p)) / margin));
  return 1;
}

/** Sensitivity curve: gain the signal up, lift quiet detail (gamma < 1), then
 *  gate out the noise floor so silence is truly still. */
export function shapeSignal(v: number, gain: number, gamma: number, gate: number): number {
  let x = v * gain;
  if (x > 1) x = 1;
  x = Math.pow(x, gamma);
  return x < gate ? 0 : x;
}

/** Outward normal at point i, from neighbor tangent, flipped to face away from
 *  the origin so reactive displacement bulges outward rather than denting in. */
function outwardNormal(pts: Point[], i: number, closed: boolean): Point {
  const n = pts.length;
  const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
  const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
  let tx = next.x - prev.x;
  let ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  // perpendicular
  let nx = -ty;
  let ny = tx;
  // face away from origin
  const cur = pts[i];
  if (nx * cur.x + ny * cur.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

export function computeFrame(input: FrameInput): Frame {
  const { from, to, k, level, bands, t } = input;
  const cfg = input.config ?? DEFAULT_GLOBALS;

  // Discrete params: pick the dominant profile. Geometry morphs continuously;
  // shape/fill/closed flip at the halfway point.
  const dom = k < 0.5 ? from : to;
  const closed = CLOSED_SHAPES[dom.shape];

  // Continuous params blend across the morph.
  const size = lerp(from.size, to.size, k);
  const glowBase = lerp(from.glow, to.glow, k);
  const softness = lerp(from.softness, to.softness, k);
  const opacity = lerp(from.opacity, to.opacity, k);
  const backdropBlur = lerp(from.backdropBlur, to.backdropBlur, k);
  const posStrength = lerp(from.posStrength, to.posStrength, k);
  const sizeStrength = lerp(from.sizeStrength, to.sizeStrength, k);
  const colorStrength = lerp(from.colorStrength, to.colorStrength, k);
  const glowStrength = lerp(from.glowStrength, to.glowStrength, k);
  const flowStrength = lerp(from.flowStrength, to.flowStrength, k);
  const motionAmp = lerp(from.motionAmp, to.motionAmp, k);
  const motionSpeed = lerp(from.motionSpeed, to.motionSpeed, k);
  const motionType = dom.motionType;
  const flowColor = parseColor(dom.flowColor);

  // Geometry: sample both shapes at a shared point count, then morph.
  const N = Math.max(from.pointCount, to.pointCount);

  // Spin motion rotates the whole form.
  const spin = motionType === "spin" ? t * motionSpeed * 0.8 : 0;
  const ptsFrom = shapePoints(from.shape, N, t);
  const ptsTo = shapePoints(to.shape, N, t);
  const base = morphPoints(ptsFrom, ptsTo, k);

  // Sensitivity curve applied to the live loudness before it drives anything.
  const sLevel = shapeSignal(level, cfg.gain, cfg.gamma, cfg.gate);

  // Pitch → arch bend. Prefer a real fundamental-frequency estimate (passed in
  // as 0..1); fall back to the spectral centroid when none is provided (tests).
  let pitchBend: number;
  if (input.pitch !== undefined && input.pitch >= 0) {
    pitchBend = Math.max(-1, Math.min(1, (input.pitch - 0.5) * 2));
  } else {
    let cWsum = 0;
    let cSum = 0;
    for (let bi = 0; bi < bands.length; bi++) {
      cWsum += bands[bi] * bi;
      cSum += bands[bi];
    }
    const centroid = cSum > 0 ? cWsum / cSum / Math.max(1, bands.length - 1) : 0.5;
    pitchBend = Math.max(-1, Math.min(1, (centroid - 0.5) * 2.4));
  }
  const pitchStrength = lerp(from.pitchStrength, to.pitchStrength, k);

  // Overall size: breathe motion + sound-driven pulse.
  const breathe =
    motionType === "breathe" ? 1 + Math.sin(t * TAU * motionSpeed) * motionAmp * cfg.breatheMult : 1;
  const sizePx = size * breathe * (1 + sLevel * sizeStrength * cfg.sizeMult);

  const glow = glowBase * (1 + sLevel * glowStrength * cfg.glowMult);

  // Flow highlight center slides along p over time; sound makes it brighter.
  const flowCenter = (t * cfg.flowSpeed) % 1;
  const flowIntensity = flowStrength * (0.4 + sLevel * 0.9);

  const cos = Math.cos(spin);
  const sin = Math.sin(spin);

  // Pre-pass: per-point frequency energy + its mean, so the spectral detail can
  // oscillate AROUND a baseline (mean-centered). The pitch arch then decides
  // where that baseline sits, instead of a one-sided push biasing it downward.
  const energies = new Array<number>(N);
  let energyMean = 0;
  for (let i = 0; i < N; i++) {
    const pp = N <= 1 ? 0 : i / (N - 1);
    const qq = dom.freqMap === "mirror" ? 1 - Math.abs(pp * 2 - 1) : pp;
    const e = shapeSignal(bandAt(bands, qq), cfg.gain, cfg.gamma, cfg.gate);
    energies[i] = e;
    energyMean += e;
  }
  energyMean /= Math.max(1, N);

  const points: FramePoint[] = new Array(N);
  for (let i = 0; i < N; i++) {
    let bx = base[i].x;
    let by = base[i].y;
    if (spin !== 0) {
      const rx = bx * cos - by * sin;
      const ry = bx * sin + by * cos;
      bx = rx;
      by = ry;
    }

    const p = N <= 1 ? 0 : i / (N - 1);
    const energy = energies[i];
    const normal = outwardNormal(base, i, closed);

    // wave motion = travelling ripple along the form (time-driven, no sound)
    const wave =
      motionType === "wave"
        ? Math.sin(p * TAU * 3 + t * TAU * motionSpeed) * motionAmp * cfg.waveMult
        : 0;
    // Mean-centered so the detail oscillates around the (pitch-set) baseline.
    // Tapered at the ends of an open form so the edges don't pop.
    const taper = closed ? 1 : edgeTaper(p, 0.1);
    const disp = ((energy - energyMean) * posStrength * cfg.posMult + wave) * taper;

    // Pitch arch: a parabola peaking at the CENTER and easing to 0 at the edges
    // ("from the middle out"). High pitch domes it up, low pitch dips it down.
    // Gated by volume so silence stays flat.
    const archShape = 1 - (2 * p - 1) * (2 * p - 1);
    const pitchY = archShape * pitchBend * sLevel * pitchStrength * sizePx * 0.9;
    const x = (bx + normal.x * disp) * sizePx;
    const y = (by + normal.y * disp) * sizePx - pitchY;

    // color: gradient along p, then mix in flow highlight + sound brightening
    let color = sampleGradient(dom.colorStops, p);
    const flowW = Math.max(0, 1 - circDist(p, flowCenter) / cfg.flowWidth);
    const mixAmt = clamp01(flowW * flowIntensity + energy * colorStrength * 0.6);
    if (mixAmt > 0) color = mixRGB(color, flowColor, mixAmt);

    points[i] = { x, y, color: rgbCss(color) };
  }

  return { points, glow, fill: dom.fill, softness, opacity, backdropBlur, closed };
}
