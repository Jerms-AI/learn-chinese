"use client";
import { useCallback, useRef, useState } from "react";

// Minimal Web Speech API typing — TS lib.dom doesn't always ship it cleanly.
type LiveSpeechResult = { isFinal: boolean; 0: { transcript: string } };
type LiveSpeechEvent = { resultIndex: number; results: ArrayLike<LiveSpeechResult> };
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

export type MicCapture = { blob: Blob; transcript: string };

export function useMicRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<LiveSpeechRecognition | null>(null);
  // Mirror of the latest live transcript in a ref so stop() can read it without
  // depending on React state being flushed by the time the promise resolves.
  const transcriptRef = useRef("");

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    rec.start();
    setIsRecording(true);

    // Web Speech API for real-time + final transcription. Mandarin via lang=zh-CN.
    // Chrome/Edge work well; Safari/Firefox degrade silently (no transcript).
    setLiveTranscript("");
    transcriptRef.current = "";
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
            const r = e.results[i];
            if (r && r[0]) text += r[0].transcript;
          }
          transcriptRef.current = text;
          setLiveTranscript(text);
        };
        sr.onerror = () => {};
        sr.start();
        recognitionRef.current = sr;
      } catch {
        // ignored — no live transcript available
      }
    }
  }, []);

  const stop = useCallback((): Promise<MicCapture> => {
    return new Promise((resolve) => {
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;

      const rec = recorderRef.current;
      if (!rec) { resolve({ blob: new Blob([]), transcript: transcriptRef.current }); return; }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        streamRef.current = null;
        setIsRecording(false);
        resolve({ blob, transcript: transcriptRef.current });
      };
      rec.stop();
    });
  }, []);

  return { isRecording, liveTranscript, start, stop };
}
