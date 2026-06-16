"use client";
import { useEffect } from "react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

export function MicButton({
  onAudio,
  onRecordingChange,
  onStream,
}: {
  onAudio: (blob: Blob) => void;
  onRecordingChange?: (recording: boolean) => void;
  onStream?: (stream: MediaStream) => void;
}) {
  const { isRecording, start, stop } = useMicRecorder({ onStream });

  // Surface recording transitions so the page can drive visualizer state.
  useEffect(() => {
    onRecordingChange?.(isRecording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const beginRecord = async () => { if (!isRecording) await start(); };
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
  }, [isRecording]);

  return (
    <button
      onMouseDown={beginRecord}
      onMouseUp={endRecord}
      onTouchStart={beginRecord}
      onTouchEnd={endRecord}
      className={`mx-auto block rounded-full px-8 py-4 text-lg transition ${
        isRecording ? "bg-terracotta text-white" : "bg-card border"
      }`}
      aria-label="Hold to talk"
    >
      {isRecording ? "● recording…" : "🎤 hold to talk (space)"}
    </button>
  );
}
