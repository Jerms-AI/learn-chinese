// Global engine knobs — the multipliers that used to be hardcoded in engine.ts.
// Lifting them here makes the overall "drama" tunable in the playground without
// touching per-state profiles. Defaults reproduce the shipped look exactly.

export type GlobalConfig = {
  breatheMult: number; // breathe motion -> size oscillation
  waveMult: number; // wave motion -> ripple amplitude
  posMult: number; // sound -> outward displacement
  sizeMult: number; // sound -> overall size pulse
  glowMult: number; // sound -> glow intensity
  flowWidth: number; // width of the travelling flow highlight (in p-space)
  flowSpeed: number; // how fast the flow highlight slides along the form
  // --- audio responsiveness ("how it hears") ---
  smoothing: number; // analyser raw temporal smoothing (kept low)
  release: number; // envelope-follower decay: higher = stickier peaks
  gain: number; // input sensitivity multiplier
  gamma: number; // response curve: <1 lifts quiet sounds (more sensitive)
  gate: number; // noise floor below which the signal reads as silence
};

export const DEFAULT_GLOBALS: GlobalConfig = {
  breatheMult: 0.55,
  waveMult: 0.6,
  posMult: 0.6,
  sizeMult: 0.6,
  glowMult: 2.5,
  flowWidth: 0.18,
  flowSpeed: 0.3,
  smoothing: 0.2,
  release: 0.85,
  gain: 3,
  gamma: 0.6,
  gate: 0.02,
};

export type GlobalLeverSpec = {
  key: keyof GlobalConfig;
  label: string;
  min: number;
  max: number;
  step: number;
};

export const GLOBAL_SCHEMA: GlobalLeverSpec[] = [
  { key: "breatheMult", label: "Breathe ×", min: 0, max: 2, step: 0.01 },
  { key: "waveMult", label: "Wave ×", min: 0, max: 2, step: 0.01 },
  { key: "posMult", label: "Sound → position ×", min: 0, max: 2, step: 0.01 },
  { key: "sizeMult", label: "Sound → size ×", min: 0, max: 2, step: 0.01 },
  { key: "glowMult", label: "Sound → glow ×", min: 0, max: 5, step: 0.01 },
  { key: "flowWidth", label: "Flow width", min: 0.02, max: 0.5, step: 0.01 },
  { key: "flowSpeed", label: "Flow speed", min: 0, max: 2, step: 0.01 },
  { key: "smoothing", label: "Smoothing (lower = snappier)", min: 0, max: 0.95, step: 0.01 },
  { key: "release", label: "Release (higher = stickier)", min: 0, max: 0.99, step: 0.01 },
  { key: "gain", label: "Sensitivity (gain)", min: 0.5, max: 8, step: 0.1 },
  { key: "gamma", label: "Curve (lower lifts quiet)", min: 0.3, max: 2, step: 0.01 },
  { key: "gate", label: "Noise gate", min: 0, max: 0.2, step: 0.005 },
];

export function clampGlobals(g: GlobalConfig): GlobalConfig {
  const out = { ...g };
  for (const lever of GLOBAL_SCHEMA) {
    const v = out[lever.key];
    out[lever.key] = Math.min(lever.max, Math.max(lever.min, Number.isFinite(v) ? v : lever.min));
  }
  return out;
}
