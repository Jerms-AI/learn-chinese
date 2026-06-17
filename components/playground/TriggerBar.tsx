"use client";

import { useState } from "react";
import { MicButton } from "@/components/MicButton";
import { MicLevelMeter } from "./MicLevelMeter";

/** The "talk to it / it talks back" controls: speak arbitrary text (exercises
 *  the speaking state), hold-to-talk (listening), and run one real orchestrator
 *  turn (the genuine idle→processing→speaking flow). */
export function TriggerBar({
  onSpeak,
  onRealTurn,
  onRecordingChange,
  onStream,
  busy,
}: {
  onSpeak: (text: string) => void;
  onRealTurn: () => void;
  onRecordingChange: (recording: boolean) => void;
  onStream: (stream: MediaStream) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("你好，今天过得怎么样？");

  return (
    <div className="space-y-2 rounded-lg border border-ink-soft/15 bg-card/60 p-3">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text for it to speak…"
          className="flex-1 rounded border border-ink-soft/20 bg-card px-2 py-1 text-sm text-ink"
        />
        <button
          onClick={() => onSpeak(text)}
          disabled={busy}
          className="rounded bg-terracotta px-3 py-1 text-xs text-white disabled:opacity-40"
        >
          Speak
        </button>
      </div>

      <MicButton onAudio={() => {}} onRecordingChange={onRecordingChange} onStream={onStream} />

      <MicLevelMeter />

      <button
        onClick={onRealTurn}
        disabled={busy}
        className="w-full rounded border border-ink-soft/20 px-3 py-1.5 text-xs text-ink hover:bg-parchment disabled:opacity-40"
      >
        Run a real turn (idle → processing → speaking)
      </button>
    </div>
  );
}
