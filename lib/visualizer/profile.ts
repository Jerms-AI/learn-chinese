// Per-state visual profiles + the lever schema that drives them.
//
// A Profile is ONE complete look for ONE state. Every field here is a "lever":
// a typed, ranged value. PROFILE_SCHEMA declares those ranges so (a) values can
// be clamped/validated and (b) a future playground can auto-generate its
// controls without any hand-wiring. Add a lever -> add a schema entry -> it
// becomes tweakable everywhere.

import { SHAPE_NAMES, type ShapeName } from "./shapes";

export type VisualizerState = "idle" | "listening" | "processing" | "speaking";
export const VISUALIZER_STATES: VisualizerState[] = [
  "idle",
  "listening",
  "processing",
  "speaking",
];

export type MotionType = "breathe" | "wave" | "spin" | "none";
export const MOTION_TYPES: MotionType[] = ["breathe", "wave", "spin", "none"];

export type FillMode = "solid" | "gradient" | "stroke";
export const FILL_MODES: FillMode[] = ["solid", "gradient", "stroke"];

export type ColorStop = { pos: number; color: string };

export type Profile = {
  shape: ShapeName;
  size: number; // base radius in px
  pointCount: number;

  // color
  colorStops: ColorStop[]; // gradient sampled along the form (the ombre)
  flowColor: string; // reactive highlight color ("the flowing yellow")
  flowStrength: number; // 0-1 — how strong the flow highlight is

  // what sound drives (each 0-1; 0 = ignore sound on that channel)
  posStrength: number;
  sizeStrength: number;
  colorStrength: number;
  glowStrength: number;

  // time-driven idle motion (plays without any sound)
  motionType: MotionType;
  motionAmp: number; // 0-1
  motionSpeed: number; // cycles/sec-ish

  // visualness
  glow: number; // px blur baseline
  fill: FillMode;
  softness: number; // 0-1 — stroke width / soft edge
  backdropBlur: number; // px — frosts what's underneath
  opacity: number; // 0-1

  // transition
  transitionMs: number; // morph duration INTO this state
};

// --- Schema -----------------------------------------------------------------

export type LeverSpec =
  | { key: keyof Profile; label: string; type: "number"; min: number; max: number; step: number }
  | { key: keyof Profile; label: string; type: "select"; options: readonly string[] }
  | { key: keyof Profile; label: string; type: "color" }
  | { key: keyof Profile; label: string; type: "gradient" };

export const PROFILE_SCHEMA: LeverSpec[] = [
  { key: "shape", label: "Shape", type: "select", options: SHAPE_NAMES },
  { key: "size", label: "Size", type: "number", min: 4, max: 240, step: 1 },
  { key: "pointCount", label: "Points", type: "number", min: 8, max: 200, step: 1 },
  { key: "colorStops", label: "Gradient", type: "gradient" },
  { key: "flowColor", label: "Flow color", type: "color" },
  { key: "flowStrength", label: "Flow strength", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "posStrength", label: "Sound → position", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "sizeStrength", label: "Sound → size", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "colorStrength", label: "Sound → color", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "glowStrength", label: "Sound → glow", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "motionType", label: "Idle motion", type: "select", options: MOTION_TYPES },
  { key: "motionAmp", label: "Motion amount", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "motionSpeed", label: "Motion speed", type: "number", min: 0, max: 3, step: 0.01 },
  { key: "glow", label: "Glow", type: "number", min: 0, max: 60, step: 1 },
  { key: "fill", label: "Fill", type: "select", options: FILL_MODES },
  { key: "softness", label: "Softness", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "backdropBlur", label: "Backdrop blur", type: "number", min: 0, max: 30, step: 1 },
  { key: "opacity", label: "Opacity", type: "number", min: 0, max: 1, step: 0.01 },
  { key: "transitionMs", label: "Transition (ms)", type: "number", min: 0, max: 3000, step: 10 },
];

/** Clamp numbers to their schema range and snap selects to valid options.
 *  Returns a new profile; the future playground feeds raw values through this. */
export function clampProfile(p: Profile): Profile {
  const out = { ...p };
  for (const lever of PROFILE_SCHEMA) {
    if (lever.type === "number") {
      const v = out[lever.key] as unknown as number;
      const clamped = Math.min(lever.max, Math.max(lever.min, Number.isFinite(v) ? v : lever.min));
      (out as Record<string, unknown>)[lever.key] =
        lever.key === "pointCount" ? Math.round(clamped) : clamped;
    } else if (lever.type === "select") {
      const v = out[lever.key] as unknown as string;
      if (!lever.options.includes(v)) {
        (out as Record<string, unknown>)[lever.key] = lever.options[0];
      }
    }
  }
  return out;
}

// --- Default profiles (hardcoded looks for this first build) ----------------

export const DEFAULT_PROFILES: Record<VisualizerState, Profile> = {
  // Idle — a warm glowing ball, visibly breathing. No sound to react to.
  idle: {
    shape: "dot",
    size: 64,
    pointCount: 72,
    colorStops: [
      { pos: 0, color: "#c2410c" },
      { pos: 1, color: "#f59e0b" },
    ],
    flowColor: "#fde68a",
    flowStrength: 0.2,
    posStrength: 0,
    sizeStrength: 0,
    colorStrength: 0,
    glowStrength: 0,
    motionType: "breathe",
    motionAmp: 0.6,
    motionSpeed: 0.7,
    glow: 28,
    fill: "gradient",
    softness: 0.5,
    backdropBlur: 0,
    opacity: 0.95,
    transitionMs: 650,
  },

  // Listening — a wide purple→blue→orange line that ripples to YOUR voice,
  // with yellow flowing across it.
  listening: {
    shape: "line",
    size: 150,
    pointCount: 120,
    colorStops: [
      { pos: 0, color: "#7c3aed" },
      { pos: 0.5, color: "#2563eb" },
      { pos: 1, color: "#f97316" },
    ],
    flowColor: "#fde047",
    flowStrength: 0.9,
    posStrength: 1,
    sizeStrength: 0.4,
    colorStrength: 1,
    glowStrength: 1,
    motionType: "wave",
    motionAmp: 0.3,
    motionSpeed: 0.9,
    glow: 28,
    fill: "stroke",
    softness: 0.5,
    backdropBlur: 0,
    opacity: 1,
    transitionMs: 450,
  },

  // Processing — a multicolor orb churning on its own (no live audio), rolling
  // waves to say "thinking".
  processing: {
    shape: "orb",
    size: 78,
    pointCount: 120,
    colorStops: [
      { pos: 0, color: "#8b5cf6" },
      { pos: 0.33, color: "#2563eb" },
      { pos: 0.66, color: "#14b8a6" },
      { pos: 1, color: "#f97316" },
    ],
    flowColor: "#ffffff",
    flowStrength: 0.6,
    posStrength: 0,
    sizeStrength: 0,
    colorStrength: 0,
    glowStrength: 0,
    motionType: "wave",
    motionAmp: 0.6,
    motionSpeed: 1.3,
    glow: 32,
    fill: "gradient",
    softness: 0.55,
    backdropBlur: 0,
    opacity: 0.97,
    transitionMs: 500,
  },

  // Speaking — a warm glowing orb pulsing live to the AI's voice.
  speaking: {
    shape: "orb",
    size: 56,
    pointCount: 120,
    colorStops: [
      { pos: 0, color: "#c2410c" },
      { pos: 0.5, color: "#f59e0b" },
      { pos: 1, color: "#fcd34d" },
    ],
    flowColor: "#fff7cc",
    flowStrength: 0.9,
    posStrength: 1,
    sizeStrength: 0.6,
    colorStrength: 1,
    glowStrength: 1,
    motionType: "breathe",
    motionAmp: 0.45,
    motionSpeed: 0.6,
    glow: 36,
    fill: "gradient",
    softness: 0.55,
    backdropBlur: 0,
    opacity: 1,
    transitionMs: 450,
  },
};
