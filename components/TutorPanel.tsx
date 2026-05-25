"use client";
import { MicButton } from "./MicButton";

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
  return (
    <div className="rounded-2xl bg-card p-8 shadow-md border-l-4 border-terracotta space-y-4">
      <div className="text-center">
        <div className="font-serif text-6xl">{payload.targetWord}</div>
      </div>
      <p className="text-sm text-muted">{payload.diagnosis}</p>
      <audio controls src={payload.referenceAudioUrl} className="w-full" />
      <MicButton onAudio={onRetry} />
      <button onClick={onSkip} className="text-xs text-muted underline mx-auto block">
        skip and move on
      </button>
    </div>
  );
}
