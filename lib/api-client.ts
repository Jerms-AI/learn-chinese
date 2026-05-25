"use client";
import type { Score, Turn, Mastery } from "@/lib/conversation/state";
import type { OrchestratorOutput } from "@/lib/conversation/orchestrator";

export async function fetchTurn(args: {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  isRetry?: boolean;
  currentPairId?: string;
  introducedIds?: string[];
  mastery?: Record<string, Mastery>;
}): Promise<OrchestratorOutput> {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`/api/turn ${res.status}`);
  return res.json();
}

export async function postScore(audio: Blob, referenceText: string): Promise<Score & { transcript: string }> {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  form.append("referenceText", referenceText);
  const res = await fetch("/api/score", { method: "POST", body: form });
  if (!res.ok) throw new Error(`/api/score ${res.status}`);
  return res.json();
}

export async function postTts(text: string): Promise<string> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
}
