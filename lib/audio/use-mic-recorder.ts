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
  const optsRef = useRef<MicRecorderOptions | undefined>(opts);
  optsRef.current = opts;

  // Keep the mic stream warm across recordings. Re-acquiring getUserMedia on
  // every press costs up to ~1s on Windows — long enough to clip an entire
  // short utterance into a header-only blob (observed: 534 bytes), which the
  // STT model then hallucinates into filler text. Acquire once, reuse for
  // every press, release only on unmount.
  const getStream = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current;
    if (existing && existing.getTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

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
