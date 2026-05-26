"use client";
import { useCallback, useRef, useState } from "react";

// Minimal Web Speech API typing — TS lib.dom doesn't always ship it cleanly.
type LiveSpeechEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> };
type LiveSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: LiveSpeechEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};
type LiveSpeechCtor = new () => LiveSpeechRecognition;

export function useMicRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<LiveSpeechRecognition | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    rec.start();
    setIsRecording(true);

    // Run the browser's Web Speech API in parallel for live interim transcription.
    // This is separate from Azure (which scores the final blob); Web Speech gives
    // us free real-time partial transcripts as the user is still speaking. Works
    // in Chromium-based browsers; Safari/Firefox support is patchy — we degrade
    // silently when unavailable.
    setLiveTranscript("");
    const Ctor: LiveSpeechCtor | undefined =
      (window as unknown as { SpeechRecognition?: LiveSpeechCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: LiveSpeechCtor }).webkitSpeechRecognition;
    if (Ctor) {
      try {
        const sr = new Ctor();
        sr.lang = "zh-CN";
        sr.interimResults = true;
        sr.continuous = true;
        sr.onresult = (e: LiveSpeechEvent) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) {
            const result = e.results[i];
            if (result && result[0]) text += result[0].transcript;
          }
          setLiveTranscript(text);
        };
        sr.onerror = () => {}; // ignore — Azure final result is the source of truth
        sr.start();
        recognitionRef.current = sr;
      } catch {
        // No live transcription — that's fine, we still have Azure on release.
      }
    }
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;

      const rec = recorderRef.current;
      if (!rec) { resolve(new Blob([])); return; }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        streamRef.current = null;
        setIsRecording(false);
        resolve(blob);
      };
      rec.stop();
    });
  }, []);

  return { isRecording, liveTranscript, start, stop };
}
