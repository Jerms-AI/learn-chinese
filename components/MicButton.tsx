"use client";
import { useEffect, useRef } from "react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

export function MicButton({
  onAudio,
  onAsk,
  onRecordingChange,
  onStream,
}: {
  /** Mandarin answer (spacebar / click). */
  onAudio: (blob: Blob) => void;
  /** English question — "ask in English" (hold E). */
  onAsk?: (blob: Blob) => void;
  onRecordingChange?: (recording: boolean) => void;
  onStream?: (stream: MediaStream) => void;
}) {
  const { isRecording, start, stop } = useMicRecorder({ onStream });
  // Which flow the in-flight recording belongs to, decided at press time so the
  // release routes the audio to the right handler.
  const modeRef = useRef<"answer" | "ask">("answer");

  // Surface recording transitions so the page can drive visualizer state.
  useEffect(() => {
    onRecordingChange?.(isRecording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const beginRecord = async (mode: "answer" | "ask") => {
    if (!isRecording) {
      modeRef.current = mode;
      await start();
    }
  };
  const endRecord = async () => {
    if (isRecording) {
      const blob = await stop();
      if (modeRef.current === "ask") onAsk?.(blob);
      else onAudio(blob);
    }
  };

  useEffect(() => {
    // Only suppress push-to-talk when focus is in a TEXT-entry field (where the
    // key would type). A focused slider / checkbox / button must NOT block it.
    const isTextEntry = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
      if (el.tagName === "INPUT") {
        const type = (el as HTMLInputElement).type;
        return !["range", "checkbox", "radio", "button", "submit", "reset"].includes(type);
      }
      return false;
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat || isTextEntry()) return;
      if (e.code === "Space") {
        e.preventDefault();
        beginRecord("answer");
      } else if (e.code === "KeyE" && onAsk) {
        e.preventDefault();
        beginRecord("ask");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "KeyE") { e.preventDefault(); endRecord(); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, onAsk]);

  const asking = isRecording && modeRef.current === "ask";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onMouseDown={() => beginRecord("answer")}
        onMouseUp={endRecord}
        onTouchStart={() => beginRecord("answer")}
        onTouchEnd={endRecord}
        className={`mx-auto block rounded-full px-8 py-4 text-lg transition ${
          isRecording
            ? asking
              ? "bg-emerald-700 text-white"
              : "bg-terracotta text-white"
            : "bg-card border"
        }`}
        aria-label="Hold to talk"
      >
        {isRecording
          ? asking
            ? "● listening (English)…"
            : "● recording…"
          : "🎤 hold to talk (space)"}
      </button>
      {onAsk && !isRecording && (
        <p className="text-xs text-ink-soft">
          hold <kbd className="rounded border px-1">E</kbd> to ask in English (e.g. &ldquo;how do I say water?&rdquo;)
        </p>
      )}
    </div>
  );
}
