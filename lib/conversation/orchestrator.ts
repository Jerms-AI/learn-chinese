import path from "node:path";
import type { Turn, Score } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickNextPair } from "@/lib/decks/selector";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/providers/anthropic";
import { SYSTEM_PROMPT, parseClaudeJson, type ClaudeDecision } from "./claude-prompt";

export type OrchestratorInput = {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  /** True when this is a tutor-mode retry on a single character, not a full-sentence attempt. */
  isRetry?: boolean;
  mock?: boolean;
};

export type OrchestratorOutput = {
  speakerNext: "ai" | "user";
  aiUtterance?: Phrase & { audioUrl: string };
  /** What the user should say next. Used as the reference text for Azure pronunciation scoring. */
  expectedUserResponse?: Phrase;
  routeTo: "conversation" | "tutor";
  tutorPayload?: {
    targetWord: string;
    diagnosis: string;
    referenceAudioUrl: string;
    retryPrompt: string;
  };
};

const PASS_THRESHOLD = 80;       // full-sentence attempts
const RETRY_PASS_THRESHOLD = 65; // single-character drills in tutor mode

async function mockOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const threshold = input.isRetry ? RETRY_PASS_THRESHOLD : PASS_THRESHOLD;
  if (input.lastUserScore && (input.lastUserScore.accuracy < threshold || !input.lastUserScore.tonesOk)) {
    const worst = [...input.lastUserScore.words].sort((a, b) => a.accuracy - b.accuracy)[0];
    return {
      speakerNext: "user",
      routeTo: "tutor",
      tutorPayload: {
        targetWord: worst?.word ?? "?",
        diagnosis: `That's close — your "${worst?.word ?? "?"}" came in a bit off. Listen to the reference, then give it another shot.`,
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

  // For Q/A pairs, flip the role half the time so the user practices both
  // answering (AI asks q → user says a) and asking (AI says a → user says q).
  // Statement-only pairs (e.g. "thank you") always have user repeat the statement.
  const flipRole = pair.q && pair.a && Math.random() < 0.5;
  const aiSays = flipRole ? pair.a! : (pair.q ?? pair.statement!);
  const userSays = flipRole ? pair.q! : (pair.a ?? pair.statement ?? aiSays);

  return {
    speakerNext: "ai",
    routeTo: "conversation",
    aiUtterance: {
      hanzi: aiSays.hanzi,
      pinyin: aiSays.pinyin,
      english: aiSays.english,
      audioUrl: "/mocks/ai-utterance.mp3",
    },
    expectedUserResponse: {
      hanzi: userSays.hanzi,
      pinyin: userSays.pinyin,
      english: userSays.english,
    },
  };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const useMock = input.mock || !process.env.ANTHROPIC_API_KEY;
  if (useMock) return mockOrchestrator(input);

  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const availablePhrases = filtered.flatMap((d) => d.pairs).slice(0, 40);

  const client = getAnthropic();
  const userMsg = JSON.stringify({
    history: input.history.slice(-12),
    lastUserScore: input.lastUserScore,
    availablePhrases,
    metaIntent: input.metaIntent,
  });

  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });

  const textBlock = resp.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  const text = textBlock?.text ?? "";
  const decision: ClaudeDecision = parseClaudeJson(text);

  if (decision.decision === "tutor" && decision.tutor) {
    return {
      speakerNext: "user",
      routeTo: "tutor",
      tutorPayload: {
        targetWord: decision.tutor.targetWord,
        diagnosis: decision.tutor.diagnosis,
        referenceAudioUrl: "/mocks/silence.mp3",
        retryPrompt: decision.tutor.retryPrompt,
      },
    };
  }

  if (decision.decision === "ai_speak" && decision.aiUtterance) {
    return {
      speakerNext: "ai",
      routeTo: "conversation",
      aiUtterance: { ...decision.aiUtterance, audioUrl: "/mocks/silence.mp3" },
      expectedUserResponse: decision.expectedUserResponse,
    };
  }

  return {
    speakerNext: "user",
    routeTo: "conversation",
    expectedUserResponse: decision.expectedUserResponse,
  };
}
