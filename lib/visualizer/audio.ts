"use client";

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
let micSource: MediaStreamAudioSourceNode | null = null;
const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

const BANDS = 32;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins
    analyser.smoothingTimeConstant = 0.8;
    freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
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
export function readSpectrum(): { level: number; bands: number[] } {
  if (!analyser || !freq) return { level: 0, bands: [] };
  analyser.getByteFrequencyData(freq);

  const bins = freq.length;
  const bands: number[] = new Array(BANDS);
  const per = Math.max(1, Math.floor(bins / BANDS));
  let total = 0;
  for (let b = 0; b < BANDS; b++) {
    let sum = 0;
    const start = b * per;
    const end = Math.min(bins, start + per);
    for (let i = start; i < end; i++) sum += freq[i];
    const avg = sum / Math.max(1, end - start);
    bands[b] = avg / 255;
    total += avg;
  }
  const level = total / Math.max(1, BANDS) / 255;
  return { level, bands };
}
