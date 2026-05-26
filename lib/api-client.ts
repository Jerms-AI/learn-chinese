"use client";
import type { Score, Turn, Mastery } from "@/lib/conversation/state";
import type { OrchestratorOutput } from "@/lib/conversation/orchestrator";
// Score is still imported for the fetchTurn input type (lastUserScore) — kept
// in the type system in case scoring comes back. The postScore/postTranscribe
// helpers are gone; transcription is browser-side via Web Speech API.

export async function fetchTurn(args: {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  isRetry?: boolean;
  currentPairId?: string;
  introducedIds?: string[];
  mastery?: Record<string, Mastery>;
  userFreeFormTranscript?: string;
}): Promise<OrchestratorOutput> {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`/api/turn ${res.status}`);
  return res.json();
}

export async function postTts(text: string, rate?: number): Promise<string> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, rate }),
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
}
