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
  /**
   * - "conversation": pass; advance to next phrase (aiUtterance set if AI speaks next).
   * - "tutor": user mostly said the phrase but a specific word was off → drill that word.
   * - "retry-full": user's audio was largely incomplete (didn't catch most of it) →
   *   stay on the same phrase, prompt them to try again.
   */
  routeTo: "conversation" | "tutor" | "retry-full";
  tutorPayload?: {
    targetWord: string;
    diagnosis: string;
    referenceAudioUrl: string;
    retryPrompt: string;
  };
  /** Friendly nudge to display when routeTo is "retry-full". */
  retryHint?: string;
};

const PASS_THRESHOLD = 80;        // full-sentence attempts
const RETRY_PASS_THRESHOLD = 65;  // single-character drills in tutor mode
const COMPLETENESS_FLOOR = 50;    // below this, treat as "didn't catch most of it"

async function mockOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const threshold = input.isRetry ? RETRY_PASS_THRESHOLD : PASS_THRESHOLD;

  // Distinguish "didn't catch most of the phrase" from "right phrase, tones off".
  // Skip this branch for tutor retries — single-character drills naturally have
  // wildly variable completeness against a single-char reference.
  if (
    input.lastUserScore &&
    !input.isRetry &&
    input.lastUserScore.completeness < COMPLETENESS_FLOOR
  ) {
    return {
      speakerNext: "user",
      routeTo: "retry-full",
      retryHint:
        "I didn't catch most of that — try the whole phrase again, a bit slower.",
    };
  }

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

  if (decision.decision === "retry_full") {
    return {
      speakerNext: "user",
      routeTo: "retry-full",
      retryHint: decision.retryHint ?? "Try the whole phrase again.",
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
