"use client";
import { useEffect } from "react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

export function MicButton({
  onAudio,
  onRecordStart,
  disabled = false,
  micResetRef,
}: {
  onAudio: (blob: Blob) => void;
  /** Fires the moment recording begins — used to cancel the answer timer. */
  onRecordStart?: () => void;
  /** Greyed out with a pause glyph; press-to-talk ignored (tutor takeover). */
  disabled?: boolean;
  /** Receives the recorder's reset fn — the page calls it when a transcription
   * comes back empty (silent stream) so the next press re-acquires the mic. */
  micResetRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { isRecording, start, stop, reset } = useMicRecorder();

  useEffect(() => {
    if (micResetRef) micResetRef.current = reset;
  }, [micResetRef, reset]);

  const beginRecord = async () => {
    if (disabled || isRecording) return;
    onRecordStart?.();
    await start();
  };
  const endRecord = async () => {
    if (isRecording) {
      const blob = await stop();
      onAudio(blob);
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        beginRecord();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); endRecord(); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, disabled]);

  return (
    <button
      onMouseDown={beginRecord}
      onMouseUp={endRecord}
      onTouchStart={beginRecord}
      onTouchEnd={endRecord}
      disabled={disabled}
      className={`mx-auto block rounded-full px-8 py-4 text-lg transition ${
        disabled
          ? "bg-ink-soft/10 text-ink-soft/50 border border-ink-soft/20 cursor-not-allowed"
          : isRecording
            ? "bg-terracotta text-white"
            : "bg-card border"
      }`}
      aria-label={disabled ? "Microphone paused" : "Hold to talk"}
    >
      {disabled ? "⏸ one moment…" : isRecording ? "● recording…" : "🎤 hold to talk (space)"}
    </button>
  );
}
