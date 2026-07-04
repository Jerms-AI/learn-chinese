"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Optional lifecycle hook: `onStream` fires with the live MediaStream each
 *  time recording begins, so a visualizer can tap it. */
export type MicRecorderOptions = {
  onStream?: (stream: MediaStream) => void;
};

export function useMicRecorder(opts?: MicRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const acquiringRef = useRef<Promise<MediaStream> | null>(null);
  const optsRef = useRef<MicRecorderOptions | undefined>(opts);
  optsRef.current = opts;

  // Keep the mic stream warm across recordings. Re-acquiring getUserMedia on
  // every press costs up to ~1s on Windows — long enough to clip an entire
  // short utterance into a header-only blob (observed: 534 bytes), which the
  // STT model then hallucinates into filler text. Acquire once, reuse for
  // every press, release only on unmount. Concurrent callers share one in-flight
  // acquisition so we never open two streams.
  const getStream = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current;
    if (existing && existing.getTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    if (acquiringRef.current) return acquiringRef.current;
    const p = navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        acquiringRef.current = null;
        return stream;
      })
      .catch((err) => {
        acquiringRef.current = null;
        throw err;
      });
    acquiringRef.current = p;
    return p;
  }, []);

  // Pre-warm the mic on the user's FIRST interaction anywhere on the page, so the
  // first real hold isn't a cold getUserMedia (which clips a short utterance into
  // a header-only blob → "I didn't catch that"). getUserMedia needs a user
  // gesture, so we hook the first pointerdown/keydown, then unhook.
  useEffect(() => {
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      getStream().catch(() => {}); // ignore denials/errors — real presses re-try
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
    window.addEventListener("pointerdown", warm);
    window.addEventListener("keydown", warm);
    return () => {
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
  }, [getStream]);

  const start = useCallback(async () => {
    const stream = await getStream();
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    rec.start();
    setIsRecording(true);
    optsRef.current?.onStream?.(stream);
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

  return { isRecording, start, stop };
}
