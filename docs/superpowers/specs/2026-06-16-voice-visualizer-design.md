# Voice Visualizer — Design Spec

**Date:** 2026-06-16
**Status:** Approved — ready for implementation plan
**Author:** Jeremy (with Claude)

---

## Purpose

A Siri-like, audio-reactive voice visualizer that lives under the mic button and gives
the conversation loop a "floating, glowing, wiggling" presence. It reacts live to the
user's voice while listening, runs a self-driven motion while processing, and reacts
live to the AI's speech while speaking.

The point of this build is **not** a single orb. It is a **swappable, tweakable engine**
where the shape (dot / line / triangle / orb / blob…), the colors, the motion, and the
render style are all open-ended variables, and where the set of **states** is extensible.
Every variable is designed from the start to become a **lever in a future playground**.

This first effort **proves the engine**: it ships hardcoded, sensible per-state profiles
and demonstrates morphing + frequency-reactive motion. The playground control panel is a
**later, separate effort** (see Out of Scope).

---

## Locked Design Decisions

| Decision | Choice |
|---|---|
| Placement | Directly under the mic button. Layout is not a concern. |
| Per-state vs global | **Per-state profiles** — each state is a complete "look" (shape, size, color, motion, style all vary per state). |
| Shape representation | **Points-based** — every shape is the same N points placed differently; morphing = point-by-point interpolation. |
| Transitions | **Morph** — forms physically flow into each other between states. |
| Reactivity granularity | **Frequency spectrum** — bands spread across the points; the form ripples like a living spectrum analyzer. |
| What sound drives | **All four channels** — position, size, color, glow — each with its own independent strength lever (0–1) per profile. |
| Config shape | **Schema-driven** — every variable is a declared, typed, ranged lever so the future playground auto-generates its controls. |
| Render technology | **Canvas 2D now; renderer is a pluggable axis** so a WebGL/shader renderer can drop in later without touching the engine. |
| Playground panel | **Later, separate effort.** This build hardcodes profiles. |

---

## Architecture

Three decoupled layers — **audio in → engine → renderer out** — none aware of the
others' internals.

```
  mic MediaStream ─┐
                   ├─► useAudioSpectrum ──► { level, bands[] }
  TTS <audio>     ─┘                              │
                                                  ▼
   app state + busy ──► state-map ──► visualizer state ──► engine ──► (points, colors, style) ──► renderer ──► <canvas>
                                                            ▲
                                          profiles + schema ┘
```

### 1. The points model (the spine)

Every shape is a function `shape(i, N, t) → {x, y}` producing N base points in a unit space:

- **dot** = points clustered; **line** = points in a row; **orb** = points on a circle;
  **triangle** = points along three edges. Each generator is a few lines of math.
- **Morphing** = lerp each point from `shapeA(i)` to `shapeB(i)` by a 0–1 progress.
  Because shapes are parametric (`shape(i, N, t)` resamples to any N), the engine renders a
  transition at a single working point count — the **max of the outgoing and incoming
  profiles' `pointCount`** — and samples both forms at that N. So `pointCount` stays a
  per-profile lever without breaking the point-by-point morph.
- Each point carries a normalized position `p = i / N` (0→1 along the form). This single
  value powers the color system: the **ombre** is a gradient sampled at `p`; the **flowing
  highlight** ("yellow flows through it") is a bright band whose center slides across `p`
  over time and swells with sound.
- **Frequency reactivity**: map each point's `p` to a frequency band and displace the point
  outward by `band_energy × posStrength`.

### 2. Profiles (per-state looks)

A `VisualizerProfile` is one complete look for one state — a flat bag of typed, ranged levers:

- **Form:** `shape`, `size`, `pointCount`
- **Color:** `colorStops` (gradient as `[{pos, color}]`), `flowColor`, `flowStrength` (reactive highlight)
- **Reactivity strengths (0–1 each):** `posStrength`, `sizeStrength`, `colorStrength`, `glowStrength`
- **Idle motion (time-driven, plays without sound):** `motionType` (breathe | wave | spin | none),
  `motionAmp`, `motionSpeed`
- **Visualness:** `glow`, `fill` (solid | gradient | stroke), `softness`, `backdropBlur`
  (the "smokey, blurs what's underneath" look via CSS `backdrop-filter`), `opacity`
- **Transition:** `transitionMs` — how long the morph *into* this state takes

Profiles are keyed by state: `{ idle, listening, processing, speaking }`.
**Adding a state later = add one profile + one mapping line.**

### 3. The schema (what makes the playground free)

Every lever is declared once in a `ProfileSchema`: `{ key, type, min, max, default, label }`.
The future playground reads this schema and **auto-generates its sliders/toggles**. Adding a
lever makes it appear in the playground automatically — no hand-wired UI, ever. The schema
also validates/clamps incoming values.

### 4. Engine + renderer

`VoiceVisualizer` owns a `<canvas>` and a `requestAnimationFrame` loop. Each frame:

1. Resolve the active profile — or a **morph-blend of two** profiles during a transition.
2. Sample audio → `{ level, bands[] }`.
3. Compute the point set: base geometry from `shape`, displaced by reactivity, scaled by size.
4. Resolve colors (gradient at `p` + reactive flow highlight).
5. Hand `(points, colors, style)` to the **active renderer**.

The renderer sits behind a `Renderer` interface. `canvas2d` ships now; a `webgl` renderer
can be added later **without touching the engine**.

### 5. Audio (how it hears)

A `useAudioSpectrum` hook wraps a Web Audio `AnalyserNode`, producing `{ level, bands[] }`
per frame:

- attaches to the **mic `MediaStream`** while recording → drives *listening*
- attaches to the **TTS `<audio>` element** while playing → drives *speaking*
- emits zeros during *idle* / *processing* → those run on time-driven motion only

`level` is overall RMS amplitude (0–1); `bands` is a normalized frequency spectrum
(e.g. 16–32 bands, 0–1 each).

### 6. State mapping

`state-map.ts` turns the app's real status into a visualizer state:

| Visualizer state | Condition |
|---|---|
| `listening` | mic is actively recording |
| `processing` | `busy` (transcribe / turn / tts in flight) |
| `speaking` | TTS audio is currently playing |
| `idle` | none of the above |

---

## Integration With the Existing App

Mount `<VoiceVisualizer ... />` under `<MicButton>` in `app/page.tsx`. Two small touches to
existing code are required to feed it live audio:

1. **Surface the mic `MediaStream`** out of `useMicRecorder` (currently held internally) so
   the visualizer can attach an analyser while recording.
2. **Route `playAudio`'s `Audio` element through an analyser** (a `MediaElementAudioSourceNode`)
   so the speaking state reacts to the AI's voice.

The page already exposes `busy`, `state.mode`, the mic-blob flow, and TTS playback via
`playAudio`, so visualizer-state derivation is a thin layer on top.

Profile config persists to `localStorage` (consistent with existing prefs like
`hide-translations` and `active-deck`) so future hand-tuning survives reloads.

---

## File Layout (compartmentalized — one purpose each)

```
lib/visualizer/
  audio.ts          # useAudioSpectrum → { level, bands }
  shapes.ts         # shape generators + registry        (add a shape here)
  profile.ts        # Profile type + ProfileSchema + per-state defaults  (add a state/lever here)
  engine.ts         # frame math: profile/morph → points → colors → style
  state-map.ts      # app state + busy → visualizer state
  renderers/
    types.ts        # Renderer interface
    canvas2d.ts     # today's renderer                   (add a renderer here later)
components/
  VoiceVisualizer.tsx   # canvas + RAF loop, wires hook + engine + renderer
```

This keeps every axis independent:
- Add a **shape** → edit `shapes.ts`.
- Add a **state** → add a profile in `profile.ts` + a line in `state-map.ts`.
- Add a **renderer** → new file in `renderers/`.
- Add a **lever** → add to `ProfileSchema`, consume in `engine.ts`.

---

## Testing Strategy

Follows the project convention (TDD pure logic, run-the-app for visual/live pieces).

**Unit-tested (pure):**
- `shapes.ts` — point coordinates for known N (line/orb/triangle/dot)
- morph lerp — midpoint between two shapes
- color sampling at `p` — gradient interpolation, flow-highlight position
- band → point mapping
- `ProfileSchema` — clamping / validation of out-of-range values
- `state-map.ts` — truth table for state derivation

**Verified by running the app (jsdom has no canvas/WebAudio):**
- the RAF render loop
- live mic + TTS reactivity
- morph transitions between states

---

## Build Order

1. **Pure core** — `shapes.ts`, `profile.ts` + schema, `engine.ts` math, `state-map.ts`,
   all with unit tests. No pixels yet.
2. **Canvas2D renderer + `VoiceVisualizer` component**, mounted under the mic with hardcoded
   profiles, driven by synthetic data — watch it breathe and morph.
3. **Wire real audio** — mic stream + TTS element through `useAudioSpectrum` for true reactivity.

---

## Out of Scope (this effort)

Deliberately deferred to keep this build focused on proving the engine:

- **The playground control panel** — auto-generated sliders/toggles bound to `ProfileSchema`.
  This is the eventual payoff, but it comes after the engine is proven. (Own spec → plan.)
- **WebGL / shader renderer** — the `Renderer` interface reserves space for it; not built now.
- **Additional shapes beyond dot / line / triangle / orb** — the registry makes these cheap
  to add later.
- **Additional states beyond idle / listening / processing / speaking.**
- **Per-user / saved profile presets**, import/export of configs.
