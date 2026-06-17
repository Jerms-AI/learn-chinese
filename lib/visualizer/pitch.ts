// Fundamental-frequency (F0) detection by autocorrelation — the actual pitch of
// a voice, not a brightness proxy. This is the "ACF2+" approach widely used for
// real-time browser pitch detection: trim silence, autocorrelate, take the
// first strong peak after the initial dip, refine with parabolic interpolation.

/** Estimate pitch in Hz from a time-domain buffer (-1..1). Returns -1 if the
 *  signal is too quiet or has no clear periodicity (unvoiced). */
export function autoCorrelate(buf: ArrayLike<number>, sampleRate: number): number {
  const SIZE = buf.length;
  if (SIZE < 8) return -1;

  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet to be a voiced sound

  // Trim near-silent ends so the correlation locks onto the voiced part.
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  if (r2 <= r1 + 2) { r1 = 0; r2 = SIZE - 1; }

  const n = r2 - r1;
  const c = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) c[i] += buf[r1 + j] * buf[r1 + j + i];
  }

  // Skip the initial downslope, then find the highest peak (the period).
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  let T0 = maxpos;
  if (T0 <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  const hz = sampleRate / T0;
  if (hz < 50 || hz > 1000) return -1; // outside a plausible voice range
  return hz;
}

/** Map a pitch in Hz to 0..1 on a log scale across a vocal range, so the middle
 *  of the range sits near 0.5. Returns -1 for no pitch. */
export function pitchToNorm(hz: number, fmin = 80, fmax = 350): number {
  if (!(hz > 0)) return -1;
  const t = (Math.log(hz) - Math.log(fmin)) / (Math.log(fmax) - Math.log(fmin));
  return Math.min(1, Math.max(0, t));
}
