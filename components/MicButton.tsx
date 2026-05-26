"use client";
import { useEffect } from "react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

export function MicButton({
  onAudio,
  onLiveTranscript,
}: {
  /** Fires when the user releases the mic. Receives the captured audio blob
   * AND the Web Speech API's final transcript (browser-side, no API call). */
  onAudio: (blob: Blob, transcript: string) => void;
  /** Called with interim transcripts from the browser's Web Speech API while the
   * user is still holding the mic. Best-effort; not available in every browser. */
  onLiveTranscript?: (text: string) => void;
}) {
  const { isRecording, liveTranscript, start, stop } = useMicRecorder();

  const beginRecord = async () => { if (!isRecording) await start(); };
  const endRecord = async () => {
    if (isRecording) {
      const { blob, transcript } = await stop();
      onAudio(blob, transcript);
    }
  };

  // Pipe live transcript out to the parent as it streams in.
  useEffect(() => {
    onLiveTranscript?.(liveTranscript);
  }, [liveTranscript, onLiveTranscript]);

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
