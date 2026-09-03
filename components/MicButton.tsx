"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

type Mode = "answer" | "ask";

/** Long-press hygiene for touch: no text selection, no iOS callout sheet, no
 *  context menu, and no browser gesture handling (scroll/zoom) stealing the
 *  pointer mid-hold. */
const HOLD_STYLE: CSSProperties = {
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
};

/** Coarse pointer (phone/tablet) → hide the keyboard hints, they're noise
 *  there. External-store subscription so SSR renders the desktop copy and the
 *  client corrects it without a hydration mismatch or a setState-in-effect. */
const COARSE = "(pointer: coarse)";
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia?.(COARSE);
  if (!mq) return () => {};
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}
const getCoarse = () => window.matchMedia?.(COARSE)?.matches ?? false;
const getCoarseServer = () => false;

function HoldButton({
  onHoldStart,
  onHoldEnd,
  active,
  className,
  label,
  children,
}: {
  onHoldStart: () => void;
  onHoldEnd: () => void;
  active: boolean;
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  // Pointer events unify mouse + touch + pen, and preventDefault on pointerdown
  // suppresses the synthetic mouse events that would otherwise double-start the
  // recorder on touch devices. Capturing the pointer means the release fires on
  // this element even if the finger slides off the button.
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* jsdom / unsupported */ }
    onHoldStart();
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onHoldEnd();
  };
  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      style={HOLD_STYLE}
      className={className}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function MicButton({
  onAudio,
  onAsk,
  onRecordingChange,
  onStream,
}: {
  /** Mandarin answer (hold the mic button / spacebar). */
  onAudio: (blob: Blob) => void;
  /** English question — "ask in English" (hold the ask button / E). */
  onAsk?: (blob: Blob) => void;
  onRecordingChange?: (recording: boolean) => void;
  onStream?: (stream: MediaStream) => void;
}) {
  const { isRecording, start, stop } = useMicRecorder({ onStream });
  // Which flow the in-flight recording belongs to, decided at press time so the
  // release routes the audio to the right handler. Ref for the release handler
  // (never stale), mirrored state for rendering.
  const modeRef = useRef<Mode>("answer");
  const [mode, setMode] = useState<Mode>("answer");
  const touch = useSyncExternalStore(subscribeCoarse, getCoarse, getCoarseServer);

  // Surface recording transitions so the page can drive visualizer state.
  useEffect(() => {
    onRecordingChange?.(isRecording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // A cold mic (first getUserMedia on a phone) can take longer than a short
  // hold. If the release lands while start() is still opening the stream, the
  // recorder would otherwise keep running with nobody left to stop it. Track
  // the in-flight start and honour an early release as soon as it resolves.
  const startingRef = useRef(false);
  const releasedWhileStartingRef = useRef(false);

  const deliver = async () => {
    const blob = await stop();
    if (modeRef.current === "ask") onAsk?.(blob);
    else onAudio(blob);
  };
  const beginRecord = async (mode: Mode) => {
    if (isRecording || startingRef.current) return;
    modeRef.current = mode;
    setMode(mode);
    startingRef.current = true;
    releasedWhileStartingRef.current = false;
    try {
      await start();
    } catch {
      startingRef.current = false;
      return; // mic denied / unavailable — nothing to stop
    }
    startingRef.current = false;
    if (releasedWhileStartingRef.current) {
      releasedWhileStartingRef.current = false;
      await deliver();
    }
  };
  const endRecord = async () => {
    if (startingRef.current) { releasedWhileStartingRef.current = true; return; }
    if (isRecording) await deliver();
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

  const asking = isRecording && mode === "ask";
  const answering = isRecording && !asking;

  return (
    <div className="flex flex-col items-center gap-3">
      <HoldButton
        onHoldStart={() => beginRecord("answer")}
        onHoldEnd={endRecord}
        active={answering}
        label="Hold to talk"
        className={`mx-auto block rounded-full px-8 py-4 text-lg transition ${
          answering ? "bg-terracotta text-white" : asking ? "bg-card border opacity-50" : "bg-card border"
        }`}
      >
        {answering ? "● recording…" : touch ? "🎤 hold to talk" : "🎤 hold to talk (space)"}
      </HoldButton>

      {onAsk && (
        <HoldButton
          onHoldStart={() => beginRecord("ask")}
          onHoldEnd={endRecord}
          active={asking}
          label="Hold to ask in English"
          className={`mx-auto block rounded-full px-5 py-2 text-sm transition ${
            asking ? "bg-emerald-700 text-white" : answering ? "bg-card border opacity-50" : "bg-card border text-ink-soft"
          }`}
        >
          {asking
            ? "● listening (English)…"
            : touch
              ? "hold to ask in English"
              : <>hold to ask in English <span className="opacity-70">(or <kbd className="rounded border px-1">E</kbd>)</span></>}
        </HoldButton>
      )}
      {onAsk && !isRecording && (
        <p className="text-xs text-ink-soft">e.g. &ldquo;how do I say water?&rdquo;</p>
      )}
    </div>
  );
}
