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
    <div className="rounded-2xl bg-card p-8 shadow-md border-l-4 border-terracotta space-y-4">
      <div className="text-center">
        <div className="font-serif text-6xl">{payload.targetWord}</div>
      </div>
      <p className="text-sm text-muted">{payload.diagnosis}</p>
      {refUrl ? (
        <audio controls src={refUrl} className="w-full" autoPlay />
      ) : (
        <div className="text-xs text-muted text-center">loading reference audio…</div>
      )}
      <MicButton onAudio={onRetry} />
      <button onClick={onSkip} className="text-xs text-muted underline mx-auto block">
        skip and move on
      </button>
    </div>
  );
}
