import path from "node:path";
import type { Turn, Score } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickNextPair } from "@/lib/decks/selector";

export type OrchestratorInput = {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  mock?: boolean;
};

export type OrchestratorOutput = {
  speakerNext: "ai" | "user";
  aiUtterance?: Phrase & { audioUrl: string };
  routeTo: "conversation" | "tutor";
  tutorPayload?: {
    targetWord: string;
    diagnosis: string;
    referenceAudioUrl: string;
    retryPrompt: string;
  };
};

const PASS_THRESHOLD = 80;

async function mockOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  if (input.lastUserScore && (input.lastUserScore.accuracy < PASS_THRESHOLD || !input.lastUserScore.tonesOk)) {
    const worst = [...input.lastUserScore.words].sort((a, b) => a.accuracy - b.accuracy)[0];
    return {
      speakerNext: "user",
      routeTo: "tutor",
      tutorPayload: {
        targetWord: worst?.word ?? "?",
        diagnosis: `Your "${worst?.word ?? "?"}" came in low (accuracy ${worst?.accuracy ?? 0}). Try again with a clearer tone.`,
        referenceAudioUrl: "/mocks/silence.mp3",
        retryPrompt: worst?.word ?? "?",
      },
    };
  }

  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const pair = pickNextPair(filtered.length > 0 ? filtered : decks, {
    seenIds: input.history.filter((t) => t.speaker === "ai").map((t) => t.text),
  });
  const phrase = pair.q ?? pair.statement!;

  return {
    speakerNext: "ai",
    routeTo: "conversation",
    aiUtterance: {
      hanzi: phrase.hanzi,
      pinyin: phrase.pinyin,
      english: phrase.english,
      audioUrl: "/mocks/ai-utterance.mp3",
    },
  };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  // Real Claude integration lands in Phase 9. For now, always use mock.
  return mockOrchestrator(input);
}
