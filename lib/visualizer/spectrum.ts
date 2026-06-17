// Turn raw FFT magnitudes into the band array the engine spreads across points.
//
// Why log + triangular: a voice's energy sits almost entirely in the low
// frequencies, so a linear mapping lights up only the first few bands (the left
// end of a line). Pro analyzers (audioMotion-analyzer et al.) bucket the linear
// FFT bins into LOG-spaced bands using TRIANGULAR filters — each band is a
// weighted average of the bins under a triangle peaked at its center frequency.
// That spreads the vocal range across the whole form and smooths bin noise.

/** Log-spaced triangular filterbank over [minBin, maxBin], normalized to 0..1. */
export function sampleLogBands(
  freq: ArrayLike<number>,
  bandCount: number,
  minBin = 1,
  maxBin = 24,
): number[] {
  const out = new Array<number>(Math.max(0, bandCount)).fill(0);
  const bins = freq.length;
  if (bins === 0 || bandCount <= 0) return out;

  const hi = Math.min(bins - 1, maxBin);
  const lo = Math.max(1, Math.min(minBin, hi - 1));
  const ratio = hi / lo;
  // Per-step factor so the first/last bands get a symmetric outer skirt.
  const step = bandCount <= 1 ? ratio : Math.pow(ratio, 1 / (bandCount - 1));
  const center = (b: number) => lo * Math.pow(ratio, bandCount <= 1 ? 0 : b / (bandCount - 1));

  for (let b = 0; b < bandCount; b++) {
    const c = center(b);
    const left = b > 0 ? center(b - 1) : c / step;
    const right = b < bandCount - 1 ? center(b + 1) : c * step;

    const i0 = Math.max(1, Math.floor(left));
    const i1 = Math.min(bins - 1, Math.ceil(right));
    let sum = 0;
    let wsum = 0;
    for (let i = i0; i <= i1; i++) {
      // triangular weight: 1 at center c, ramping to 0 at left/right edges
      const w = i <= c ? (c > left ? (i - left) / (c - left) : 1) : right > c ? (right - i) / (right - c) : 1;
      if (w > 0) {
        sum += freq[i] * w;
        wsum += w;
      }
    }
    out[b] = wsum > 0 ? sum / wsum / 255 : 0;
  }
  return out;
}
