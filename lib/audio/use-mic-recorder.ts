"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useMicRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep the mic stream warm across recordings. Re-acquiring getUserMedia on
  // every press costs up to ~1s on Windows — long enough to clip an entire
  // short utterance into a header-only blob (observed: 534 bytes), which the
  // STT model then hallucinates into filler text. Acquire once, reuse for
  // every press, release only on unmount.
  const getStream = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current;
    // NOTE: do not gate reuse on track.muted — Chrome reports idle tracks as
    // muted until audio flows, so that check forces a cold re-acquire on every
    // press (clipping short recordings). Silent-stream recovery is handled by
    // reset() instead, called when a transcription comes back empty.
    if (existing && existing.getTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    existing?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  /** Drop the cached stream so the next press re-acquires a fresh mic. Called
   * when recorded audio turns out to be silent (empty transcription) — the
   * track can go quiet without ever leaving the "live" state. */
  const reset = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const stream = await getStream();
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [getStream]);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec) { resolve(new Blob([])); return; }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        recorderRef.current = null;
        setIsRecording(false);
        resolve(blob);
      };
      rec.stop();
    });
  }, []);

  // Release the mic (and the browser's recording indicator) when the
  // component using the hook unmounts.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return { isRecording, start, stop, reset };
}
