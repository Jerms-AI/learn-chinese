// UI metadata for the playground: which category each lever belongs to and a
// one-sentence explanation. Kept separate from the engine schema so tuning the
// copy never touches logic.

export const LEVER_GROUP: Record<string, string> = {
  // profile
  shape: "Form",
  size: "Form",
  pointCount: "Form",
  colorStops: "Color",
  flowColor: "Color",
  flowStrength: "Color",
  posStrength: "Sound reactivity",
  sizeStrength: "Sound reactivity",
  colorStrength: "Sound reactivity",
  glowStrength: "Sound reactivity",
  freqMap: "Sound reactivity",
  pitchStrength: "Sound reactivity",
  motionType: "Idle motion",
  motionAmp: "Idle motion",
  motionSpeed: "Idle motion",
  glow: "Look",
  fill: "Look",
  softness: "Look",
  backdropBlur: "Look",
  opacity: "Look",
  transitionMs: "Transition",
  // globals
  breatheMult: "Motion strength",
  waveMult: "Motion strength",
  posMult: "Motion strength",
  sizeMult: "Motion strength",
  glowMult: "Motion strength",
  flowWidth: "Flow",
  flowSpeed: "Flow",
  smoothing: "Audio sensitivity",
  release: "Audio sensitivity",
  gain: "Audio sensitivity",
  gamma: "Audio sensitivity",
  gate: "Audio sensitivity",
};

export const LEVER_HELP: Record<string, string> = {
  shape: "The base shape — dot, line, triangle, or orb.",
  size: "Overall size of the form.",
  pointCount: "How many points form the shape (higher = smoother).",
  colorStops: "Color gradient mapped along the form.",
  flowColor: "Color of the highlight that flows through on sound.",
  flowStrength: "How strongly that flowing highlight shows.",
  posStrength: "How much sound pushes the shape outward.",
  sizeStrength: "How much loudness pulses the overall size.",
  colorStrength: "How much sound shifts the colors.",
  glowStrength: "How much sound brightens the glow.",
  freqMap: "Linear: lows left, highs right. Mirror: lows at both edges, highs in the center.",
  pitchStrength: "How much your pitch arcs the line up (high) or down (low).",
  motionType: "Built-in motion when there's no sound.",
  motionAmp: "Size of that idle motion.",
  motionSpeed: "Speed of that idle motion.",
  glow: "Glow / bloom around the form.",
  fill: "How the shape is filled in.",
  softness: "Line thickness and edge softness.",
  backdropBlur: "Blurs whatever is behind the form.",
  opacity: "Overall transparency.",
  transitionMs: "How long it takes to morph into this state.",
  breatheMult: "Master scale for breathing motion.",
  waveMult: "Master scale for wave ripple.",
  posMult: "Master scale for the sound-driven push.",
  sizeMult: "Master scale for the sound-driven size pulse.",
  glowMult: "Master scale for the sound-driven glow.",
  flowWidth: "Width of the flowing highlight band.",
  flowSpeed: "How fast the highlight travels across.",
  smoothing: "Lower = snappier, tracks fast changes.",
  release: "Higher = peaks hang and fall more slowly.",
  gain: "Overall mic sensitivity.",
  gamma: "Lower lifts quiet detail.",
  gate: "Silences background noise below this level.",
};

export const GROUP_ICON: Record<string, string> = {
  Form: "◇",
  Color: "🎨",
  "Sound reactivity": "🔊",
  "Idle motion": "🌀",
  Look: "✨",
  Transition: "⏱",
  "Audio sensitivity": "🎚",
  "Motion strength": "📊",
  Flow: "💧",
};

// Display order within each panel.
export const PROFILE_GROUPS = ["Form", "Sound reactivity", "Color", "Idle motion", "Look", "Transition"];
export const GLOBAL_GROUPS = ["Audio sensitivity", "Motion strength", "Flow"];

// Categories expanded by default; the rest start collapsed to cut clutter.
export const DEFAULT_OPEN = new Set(["Form", "Sound reactivity", "Audio sensitivity"]);
