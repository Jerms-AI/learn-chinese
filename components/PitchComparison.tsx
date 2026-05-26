"use client";
import { useEffect, useState } from "react";
import { extractPitchContour, extractPitchContourFromUrl, type PitchSample } from "@/lib/audio/pitch";

const WIDTH = 280;
const HEIGHT = 110;
const MIN_HZ = 70;
const MAX_HZ = 400;

function pitchToPath(samples: PitchSample[]): string {
  if (samples.length === 0) return "";
  // Time-normalize to width: each pitch curve fills the chart regardless of
  // actual duration. The shape — not the length — is what matters for tones.
  const lastT = samples[samples.length - 1].tMs || 1;
  const segments: string[] = [];
  let inVoiced = false;
  for (const s of samples) {
    const x = (s.tMs / lastT) * WIDTH;
    if (s.hz === 0) {
      inVoiced = false;
      continue;
    }
    const clamped = Math.max(MIN_HZ, Math.min(MAX_HZ, s.hz));
    const y = HEIGHT - ((clamped - MIN_HZ) / (MAX_HZ - MIN_HZ)) * HEIGHT;
    segments.push(`${inVoiced ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    inVoiced = true;
  }
  return segments.join(" ");
}

function PitchTrack({
  samples,
  color,
  label,
  loading,
}: {
  samples: PitchSample[] | null;
  color: string;
  label: string;
  loading: boolean;
}) {
  const voicedCount = samples?.filter((s) => s.hz > 0).length ?? 0;
  const dotData = samples ? voicedDotPositions(samples) : [];
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-ink-soft mb-1">
        <span>{label}</span>
        <span className="italic normal-case tracking-normal">
          {loading ? "computing…" : samples ? `${voicedCount} samples` : ""}
        </span>
      </div>
      <div className="rounded-md bg-parchment/50 border border-ink-soft/10" style={{ width: WIDTH, height: HEIGHT }}>
        {samples && (
          <svg width={WIDTH} height={HEIGHT} className="block">
            {[100, 150, 200, 250, 300].map((hz) => {
              const y = HEIGHT - ((hz - MIN_HZ) / (MAX_HZ - MIN_HZ)) * HEIGHT;
              return (
                <g key={hz}>
                  <line x1={0} x2={WIDTH} y1={y} y2={y} stroke="rgba(0,0,0,0.05)" />
                  <text x={2} y={y - 2} fontSize="8" fill="rgba(0,0,0,0.3)">{hz}</text>
                </g>
              );
            })}
            <path d={pitchToPath(samples)} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {/* Render each voiced sample as a small dot so isolated points stay visible. */}
            {dotData.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={1.4} fill={color} />
            ))}
            {voicedCount === 0 && (
              <text x={WIDTH / 2} y={HEIGHT / 2} fontSize="10" fill="rgba(0,0,0,0.4)" textAnchor="middle">
                no pitch detected
              </text>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

function voicedDotPositions(samples: PitchSample[]): Array<{ x: number; y: number }> {
  const lastT = samples[samples.length - 1]?.tMs || 1;
  const out: Array<{ x: number; y: number }> = [];
  for (const s of samples) {
    if (s.hz === 0) continue;
    const clamped = Math.max(MIN_HZ, Math.min(MAX_HZ, s.hz));
    out.push({
      x: (s.tMs / lastT) * WIDTH,
      y: HEIGHT - ((clamped - MIN_HZ) / (MAX_HZ - MIN_HZ)) * HEIGHT,
    });
  }
  return out;
}

export function PitchComparison({
  userBlob,
  referenceUrl,
}: {
  userBlob: Blob | null;
  referenceUrl: string | null;
}) {
  const [refSamples, setRefSamples] = useState<PitchSample[] | null>(null);
  const [userSamples, setUserSamples] = useState<PitchSample[] | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    if (!referenceUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear cached samples when url goes away
      setRefSamples(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flip loading flag as we kick off async work
    setRefLoading(true);
    extractPitchContourFromUrl(referenceUrl)
      .then((s) => { if (!cancelled) setRefSamples(s); })
      .catch(() => { if (!cancelled) setRefSamples([]); })
      .finally(() => { if (!cancelled) setRefLoading(false); });
    return () => { cancelled = true; };
  }, [referenceUrl]);

  useEffect(() => {
    if (!userBlob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear cached samples when blob goes away
      setUserSamples(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flip loading flag as we kick off async work
    setUserLoading(true);
    extractPitchContour(userBlob)
      .then((s) => { if (!cancelled) setUserSamples(s); })
      .catch(() => { if (!cancelled) setUserSamples([]); })
      .finally(() => { if (!cancelled) setUserLoading(false); });
    return () => { cancelled = true; };
  }, [userBlob]);

  if (!userBlob && !referenceUrl) return null;

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm space-y-4">
      <div className="text-xs uppercase tracking-widest text-ink-soft">Pitch comparison</div>
      <PitchTrack samples={refSamples} loading={refLoading} color="var(--color-terracotta)" label="reference" />
      <PitchTrack samples={userSamples} loading={userLoading} color="var(--color-ink)" label="you" />
      <p className="text-[11px] text-ink-soft italic leading-relaxed">
        Curves are time-normalized so shapes can be compared regardless of length. Mandarin tones are pitch shapes —
        flat (1), rising (2), dipping (3), falling (4). Match the contour, not the absolute pitch.
      </p>
    </div>
  );
}
