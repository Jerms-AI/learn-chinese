import path from "node:path";
import type { Turn, Score, Mastery } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickPhraseProgressive } from "@/lib/decks/selector";
import { getAnthropic, CLAUDE_HAIKU_MODEL } from "@/lib/providers/anthropic";
import type { Pair } from "@/lib/decks/schema";

export type OrchestratorInput = {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  /** True when this is a tutor-mode retry on a single character, not a full-sentence attempt. */
  isRetry?: boolean;
  /** The pair ID currently being practiced (so we don't pick the same one twice in a row). */
  currentPairId?: string;
  /** Comprehensible-input state: which pairs the learner has been introduced to + their mastery records. */
  introducedIds?: string[];
  mastery?: Record<string, Mastery>;
  /** Per-pair usage counts + last-turn index. Used to bias Claude toward
   * pairs it has touched least and least recently, so the dialogue organically
   * cycles through the whole chapter instead of looping on a few favorites. */
  pairUsage?: Record<string, { count: number; lastTurn: number }>;
  /** Total turn count at the moment of this call (= state.history.length).
   * Pairs with this lastTurn value of pairUsage will compute as "turnsAgo=0". */
  historyTurnCount?: number;
  /** When set, the user just spoke free-form Mandarin (not a scripted answer).
   * The orchestrator should produce a natural response AND choose the next scripted Q. */
  userFreeFormTranscript?: string;
  mock?: boolean;
};

export type OrchestratorOutput = {
  speakerNext: "ai" | "user";
  /** Optional free-form natural response from the AI, played BEFORE the scripted aiUtterance. */
  aiResponse?: Phrase;
  /** When the user just spoke free-form, the orchestrator returns the user's transcript
   * augmented with pinyin + english translation — shown in "your line" on the card. */
  userAugmented?: Phrase;
  aiUtterance?: Phrase & { audioUrl: string };
  /** What the user should say next. Used as the reference text for Azure pronunciation scoring. */
  expectedUserResponse?: Phrase;
  /** Which deck pair this turn is about — needed for client-side mastery tracking. */
  pairId?: string;
  /** True when this pair is being introduced for the first time. */
  isNewPhrase?: boolean;
  /** All chapter pairs Claude drew vocabulary from in this turn — useful for the
   * library card to mark them as "encountered" without a strict per-pair drill. */
  usedPairIds?: string[];
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

/** Pick the next scripted phrase for the user to practice (shared by mock + Claude branches). */
async function pickNextScripted(input: OrchestratorInput) {
  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const { pair, isNew } = pickPhraseProgressive(filtered.length > 0 ? filtered : decks, {
    introducedIds: input.introducedIds ?? [],
    mastery: input.mastery ?? {},
    avoidId: input.currentPairId,
  });

  // User only speaks scripted ANSWERS (pair.a). AI always poses pair.q.
  // Statement-only pairs (e.g. "thank you") still have user repeat the statement.
  const aiSays = pair.q ?? pair.statement!;
  const userSays = pair.a ?? pair.statement ?? aiSays;
  return { pair, isNew, aiSays, userSays };
}

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

  // PASS branch with no free-form input yet: don't auto-advance to the next
  // scripted Q. Hand the floor to the user so they can ask something first.
  if (input.lastUserScore && !input.userFreeFormTranscript) {
    return { speakerNext: "user", routeTo: "conversation" };
  }

  const { pair, isNew, aiSays, userSays } = await pickNextScripted(input);

  // Free-form branch: user just asked something. Append a brief ack response,
  // then transition into the next scripted Q. Real conversational reasoning
  // requires Claude; this is a pleasant fallback when no API key is set.
  const aiResponse = input.userFreeFormTranscript
    ? { hanzi: "好的。", pinyin: "hǎo de.", english: "OK." }
    : undefined;

  return {
    speakerNext: "ai",
    routeTo: "conversation",
    pairId: pair.id,
    isNewPhrase: isNew,
    aiResponse,
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

type ConversationalTurnResult = {
  /** What the user said, augmented with pinyin + english (only when user just spoke). */
  userAugmented?: Phrase;
  /** Claude's combined utterance: a brief acknowledgement of what the user said
   * (when applicable) + a follow-up question that uses chapter vocab. Single
   * piece of audio, no separate scripted phrase to drill. */
  utterance: Phrase;
  /** IDs of chapter pairs Claude actually used in its utterance. Used to mark
   * them as "introduced" in the library so the user sees their progress. */
  usedPairIds: string[];
};

/** Parses Claude's JSON reply for a conversational turn. Pure — exported for
 * tests. Throws on non-JSON; the caller catches and substitutes its fallback.
 * userAugmented.hanzi is the raw transcript; Claude only adds pinyin/english. */
export function parseConversationalTurn(rawText: string, userTranscript: string | null): ConversationalTurnResult {
  const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    user?: { pinyin?: string; english?: string };
    utterance?: { hanzi?: string; pinyin?: string; english?: string };
    usedPairIds?: string[];
  };
  const userAugmented = userTranscript && parsed.user?.pinyin && parsed.user?.english
    ? { hanzi: userTranscript, pinyin: parsed.user.pinyin, english: parsed.user.english }
    : undefined;
  const utterance = parsed.utterance?.hanzi && parsed.utterance?.pinyin && parsed.utterance?.english
    ? { hanzi: parsed.utterance.hanzi, pinyin: parsed.utterance.pinyin, english: parsed.utterance.english }
    : { hanzi: "你好！", pinyin: "nǐ hǎo!", english: "Hello!" };
  const usedPairIds = Array.isArray(parsed.usedPairIds) ? parsed.usedPairIds.filter((id) => typeof id === "string") : [];
  return { userAugmented, utterance, usedPairIds };
}

/** Generates one conversational AI turn. Used for both the initial opener
 * (no user transcript yet) and follow-up replies (user transcript present).
 * The chapter pool informs Claude's vocab but is not a strict script — Claude
 * is free to recombine + paraphrase to keep the dialogue flowing naturally. */
async function generateConversationalTurn(
  userTranscript: string | null,
  recentHistory: Turn[],
  chapterPool: Pair[],
  introducedIds: string[],
  pairUsage: Record<string, { count: number; lastTurn: number }>,
  historyTurnCount: number,
): Promise<ConversationalTurnResult> {
  const introducedSet = new Set(introducedIds);
  // Annotate every pair with usage count + how many turns ago it was last drawn
  // from. Claude reads these as preference signals: prefer count=0 (un-used),
  // then by ascending count, with a recency tiebreaker (turnsAgo high = stale,
  // good to revisit). This is what drives organic chapter coverage.
  const annotated = chapterPool.map((p) => {
    const usage = pairUsage[p.id];
    return {
      id: p.id,
      q: p.q,
      a: p.a,
      statement: p.statement,
      tags: p.tags,
      introduced: introducedSet.has(p.id),
      usageCount: usage?.count ?? 0,
      turnsAgo: usage ? Math.max(0, historyTurnCount - usage.lastTurn) : null,
    };
  });

  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 400,
      system: `You are a friendly Mandarin tutor having a natural back-and-forth conversation with a learner. Your job is to keep a coherent dialogue going while staying within the vocabulary and grammar patterns of the active chapter (chapterPool). Vocabulary outside the chapter is allowed sparingly when it would feel unnatural to avoid, but mostly use the chapter's words and patterns.

Each turn you produce ONE combined Mandarin utterance: a brief, natural response to what the user said + a follow-up question that keeps the dialogue moving. Speak like a friend, not a textbook. Aim for 1-3 short sentences total.

If userSaid is null (initial turn), greet the learner and ask an opening question grounded in chapter topics.

If userSaid has content, respond to it naturally then segue to your next question. The flow should feel like ping-pong — answer something → ask something → user replies → you answer + ask → etc.

Picking vocabulary — the goal is to organically cover the WHOLE chapter over the course of the conversation, not to loop on a few favorites:
- Every pair in chapterPool has a usageCount (how many turns you've drawn from it) and turnsAgo (how many turns since the last time, or null if never used).
- Strongly prefer pairs with usageCount=0 — these are the under-served topics the learner hasn't been exposed to yet. Weave them in naturally, even if it requires a small conversational pivot.
- Among already-used pairs, prefer those with the highest turnsAgo (stale, due for revisit). Avoid pairs used in the last 1-2 turns unless it would feel unnatural to drop the thread.
- Don't repeat the exact same phrase verbatim turn after turn — recombine, paraphrase, ask the same vocabulary in a different frame.
- Track which chapter pairs you actually drew vocabulary from and list their ids in usedPairIds.

Output ONLY this JSON (no markdown):
{
  ${userTranscript ? '"user": { "pinyin": "...", "english": "..." },' : ""}
  "utterance": { "hanzi": "...", "pinyin": "...", "english": "..." },
  "usedPairIds": ["...", "..."]
}`,
      messages: [{
        role: "user",
        content: JSON.stringify({
          userSaid: userTranscript,
          recentHistory: recentHistory.slice(-8),
          chapterPool: annotated,
        }),
      }],
    });
    const textBlock = resp.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
    return parseConversationalTurn(textBlock?.text ?? "", userTranscript);
  } catch {
    return {
      utterance: { hanzi: "你好！", pinyin: "nǐ hǎo!", english: "Hello!" },
      usedPairIds: [],
    };
  }
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const useMock = input.mock || !process.env.ANTHROPIC_API_KEY;
  if (useMock) return mockOrchestrator(input);

  // Build the active-chapter pool (filtered by active deck selection). No slice
  // cap — even the biggest cumulative pool (Pimsleur 1-5 = ~70 pairs) fits
  // comfortably in a Haiku prompt, and capping silently drops vocab the user
  // selected.
  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const chapterPool = filtered.flatMap((d) => d.pairs);

  // Pure ping-pong: one Claude call per turn. Initial turn (no userFreeFormTranscript)
  // produces an opener; subsequent turns produce a response + follow-up question.
  // No scripted Q/A drilling — the chapter pool informs vocab but the dialogue
  // is free-flowing.
  const result = await generateConversationalTurn(
    input.userFreeFormTranscript ?? null,
    input.history,
    chapterPool,
    input.introducedIds ?? [],
    input.pairUsage ?? {},
    input.historyTurnCount ?? input.history.length,
  );

  // Mark the first used pair as the "currentPair" for the library highlight.
  // (We're keeping a single tracked pair for backward compat with the library
  // card. usedPairIds carries the rest; the page can dispatch them all as
  // "introduced" so the library shows progress.)
  const introducedSet = new Set(input.introducedIds ?? []);
  const newUsed = result.usedPairIds.filter((id) => !introducedSet.has(id) && chapterPool.some((p) => p.id === id));
  const primaryPairId = result.usedPairIds.find((id) => chapterPool.some((p) => p.id === id));

  return {
    speakerNext: "user",
    routeTo: "conversation",
    pairId: primaryPairId,
    isNewPhrase: !!primaryPairId && newUsed.includes(primaryPairId),
    usedPairIds: result.usedPairIds,
    aiUtterance: {
      hanzi: result.utterance.hanzi,
      pinyin: result.utterance.pinyin,
      english: result.utterance.english,
      audioUrl: "/mocks/silence.mp3",
    },
    userAugmented: result.userAugmented,
    // No expectedUserResponse — the user responds free-form, no scripted scoring.
  };
}
