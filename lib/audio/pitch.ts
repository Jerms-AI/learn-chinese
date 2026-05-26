"use client";
import { PitchDetector } from "pitchy";

/** A pitch sample. Hz=0 means "unvoiced/silence" (no clear pitch detected). */
export type PitchSample = { tMs: number; hz: number };

/** Decode any browser-playable audio blob into a mono Float32 sample array. */
async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  ctx.close();
  // Downmix to mono if needed.
  if (audioBuffer.numberOfChannels === 1) {
    return { samples: audioBuffer.getChannelData(0), sampleRate: audioBuffer.sampleRate };
  }
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const out = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) out[i] = (left[i] + right[i]) * 0.5;
  return { samples: out, sampleRate: audioBuffer.sampleRate };
}

/**
 * Extract a pitch contour. Samples every `stepMs` milliseconds; each sample
 * reports the dominant pitch (Hz) over a sliding window centered on that time.
 * Hz=0 indicates the segment wasn't voiced enough (clarity below threshold).
 */
export async function extractPitchContour(
  blob: Blob,
  opts: { stepMs?: number; windowSize?: number; clarityThreshold?: number } = {}
): Promise<PitchSample[]> {
  const stepMs = opts.stepMs ?? 15;
  const windowSize = opts.windowSize ?? 2048;
  const clarityThreshold = opts.clarityThreshold ?? 0.85;

  const { samples, sampleRate } = await decodeToMono(blob);
  const stepSamples = Math.max(1, Math.floor((stepMs / 1000) * sampleRate));
  const detector = PitchDetector.forFloat32Array(windowSize);
  detector.minVolumeDecibels = -45; // ignore near-silence

  const out: PitchSample[] = [];
  for (let i = 0; i + windowSize < samples.length; i += stepSamples) {
    const window = samples.slice(i, i + windowSize);
    const [hz, clarity] = detector.findPitch(window, sampleRate);
    const tMs = Math.round((i / sampleRate) * 1000);
    out.push({ tMs, hz: clarity >= clarityThreshold && hz > 50 && hz < 600 ? hz : 0 });
  }
  return out;
}

/** Fetch an audio URL and extract its pitch contour. */
export async function extractPitchContourFromUrl(url: string): Promise<PitchSample[]> {
  const res = await fetch(url);
  const blob = await res.blob();
  return extractPitchContour(blob);
}
