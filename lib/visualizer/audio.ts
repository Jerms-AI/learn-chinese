"use client";

import { sampleLogBands } from "./spectrum";
import { autoCorrelate, pitchToNorm } from "./pitch";

// A single shared Web Audio AnalyserNode that the visualizer reads each frame.
//
// Design notes / gotchas:
// - The analyser is a pure TAP: it is NEVER connected onward to destination.
//   That way the mic can feed it without creating audible feedback.
// - For TTS playback we still need sound, so the element source connects to
//   destination AND (separately) to the analyser.
// - createMediaElementSource may be called only once per element, so element
//   sources are cached in a WeakMap.
// - Mic and TTS never overlap in time, so a single analyser is enough.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sink: GainNode | null = null; // silent path keeping the analyser "pulled"
let freq: Uint8Array<ArrayBuffer> | null = null;
let timeBuf: Float32Array<ArrayBuffer> | null = null; // time domain, for pitch
let pitchEnv = 0.5; // smoothed normalized pitch (0.5 = neutral)
let micSource: MediaStreamAudioSourceNode | null = null;
const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

const BANDS = 48;
let desiredSmoothing = 0.2;
let releaseFactor = 0.85;

// Envelope-follower state (persists across frames). Multiple RAF loops read the
// spectrum, so the envelope is advanced at most once per animation frame.
let envBands: number[] = [];
let lastReadAt = -1;
let cachedLevel = 0;

/** Live-update the analyser's raw temporal smoothing (kept low; the envelope
 *  follower does the perceptual smoothing). */
export function setSmoothing(v: number): void {
  desiredSmoothing = Math.min(0.95, Math.max(0, v));
  if (analyser) analyser.smoothingTimeConstant = desiredSmoothing;
}

/** Live-update the envelope release (gravity). Higher = slower decay / stickier
 *  peaks; lower = snappier tracking of cadence. */
export function setRelease(v: number): void {
  releaseFactor = Math.min(0.99, Math.max(0, v));
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; // 1024 bins — fine resolution for the voice fundamental
    analyser.smoothingTimeConstant = desiredSmoothing;
    // Map the useful dB window onto the 0..255 byte range. Tighter than the
    // -100/-30 default → more contrast and sensitivity for speech.
    analyser.minDecibels = -90;
    analyser.maxDecibels = -38;
    freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    // Keep the analyser on a (silent) path to the destination. Some browsers
    // only update nodes that reach the destination, so a dead-end analyser
    // returns all zeros — which kills every reactive state. Zero-gain sink
    // makes it audibly a no-op while guaranteeing the analyser is pulled.
    sink = ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(ctx.destination);
  }
  return ctx;
}

/** Resume the context after a user gesture (autoplay policy). */
export function resumeAudio(): void {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}

/** Route the live mic stream into the analyser (listening state). */
export function attachMicStream(stream: MediaStream): void {
  const c = ensure();
  if (!c || !analyser) return;
  void c.resume();
  detachMicStream();
  micSource = c.createMediaStreamSource(stream);
  micSource.connect(analyser);
}

export function detachMicStream(): void {
  if (micSource) {
    try {
      micSource.disconnect();
    } catch {
      /* already disconnected */
    }
    micSource = null;
  }
}

/** Route a TTS audio element through the analyser AND to the speakers. Call
 *  before play(). Safe to call repeatedly for the same element. */
export function routeElement(el: HTMLMediaElement): void {
  const c = ensure();
  if (!c || !analyser) return;
  void c.resume();
  let src = elementSources.get(el);
  if (!src) {
    src = c.createMediaElementSource(el);
    src.connect(c.destination); // keep it audible
    elementSources.set(el, src);
  }
  src.connect(analyser); // tap for analysis
}

/** Stop analysing an element (audio keeps playing via its destination link). */
export function unrouteElement(el: HTMLMediaElement): void {
  const src = elementSources.get(el);
  if (src && analyser) {
    try {
      src.disconnect(analyser);
    } catch {
      /* not connected */
    }
  }
}

/** Read the current spectrum. Returns zeros when nothing is wired up. */
export function readSpectrum(): { level: number; bands: number[]; pitch: number } {
  if (!analyser || !freq) return { level: 0, bands: [], pitch: 0.5 };

  // Several RAF loops (visualizer + level meter) read this; advance the
  // envelope only once per frame so the decay rate stays correct.
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (envBands.length === BANDS && now - lastReadAt < 8) {
    return { level: cachedLevel, bands: envBands, pitch: pitchEnv };
  }
  lastReadAt = now;

  analyser.getByteFrequencyData(freq);
  // Log + triangular bucketing over the vocal range (~90 Hz–5.6 kHz at fft 2048).
  const raw = sampleLogBands(freq, BANDS, 4, 240);

  // Asymmetric envelope follower: instant attack (jump up to a louder value),
  // gravity release (decay otherwise). Punchy transients, smooth tails —
  // tracks speech cadence instead of mushy symmetric smoothing.
  if (envBands.length !== BANDS) {
    envBands = raw.slice();
  } else {
    for (let b = 0; b < BANDS; b++) {
      const decayed = envBands[b] * releaseFactor;
      envBands[b] = raw[b] > decayed ? raw[b] : decayed;
    }
  }
  cachedLevel = envBands.reduce((a, x) => a + x, 0) / Math.max(1, BANDS);

  // Pitch (fundamental frequency) → normalized 0..1, smoothed. Held through
  // unvoiced gaps so the arc glides rather than snapping back to neutral.
  if (timeBuf && ctx) {
    analyser.getFloatTimeDomainData(timeBuf);
    const norm = pitchToNorm(autoCorrelate(timeBuf, ctx.sampleRate));
    if (norm >= 0) pitchEnv = pitchEnv * 0.6 + norm * 0.4;
  }

  return { level: cachedLevel, bands: envBands, pitch: pitchEnv };
}
