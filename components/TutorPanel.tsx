"use client";
import { useEffect, useState } from "react";
import { MicButton } from "./MicButton";
import { postTts } from "@/lib/api-client";

export type TutorPayload = {
  targetWord: string;
  diagnosis: string;
  referenceAudioUrl: string;
  retryPrompt: string;
};

export function TutorPanel({
  payload,
  onRetry,
  onSkip,
}: {
  payload: TutorPayload;
  onRetry: (blob: Blob) => void;
  onSkip: () => void;
}) {
  const [refUrl, setRefUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    postTts(payload.targetWord)
      .then((url) => { if (!cancelled) setRefUrl(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [payload.targetWord]);

  return (
    <div className="rounded-2xl bg-card p-8 shadow-md border-l-4 border-terracotta space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-terracotta font-medium">
          ◆ Tutor mode — let&apos;s drill this
        </span>
        <button onClick={onSkip} className="text-xs text-ink-soft underline">
          skip
        </button>
      </div>

      <div className="text-center">
        <div className="font-serif text-7xl tracking-wide">{payload.targetWord}</div>
      </div>

      <p className="text-sm text-ink-soft leading-relaxed">{payload.diagnosis}</p>

      {refUrl ? (
        <div className="space-y-1">
          <div className="text-xs text-ink-soft">listen ↓</div>
          <audio controls src={refUrl} className="w-full" autoPlay />
        </div>
      ) : (
        <div className="text-xs text-ink-soft text-center">loading reference audio…</div>
      )}

      <div className="border-t pt-4">
        <div className="text-xs text-ink-soft mb-2 text-center">now try it →</div>
        <MicButton onAudio={onRetry} />
      </div>
    </div>
  );
}
