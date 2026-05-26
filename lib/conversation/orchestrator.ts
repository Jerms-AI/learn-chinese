import path from "node:path";
import type { Turn, Score, Mastery } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickPhraseProgressive } from "@/lib/decks/selector";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/providers/anthropic";

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
  /** When set, the user just spoke free-form Mandarin (not a scripted answer).
   * The orchestrator should produce a natural response AND choose the next scripted Q. */
  userFreeFormTranscript?: string;
  mock?: boolean;
};

export type OrchestratorOutput = {
  speakerNext: "ai" | "user";
  /** Optional free-form natural response from the AI, played BEFORE the scripted aiUtterance. */
  aiResponse?: Phrase;
  aiUtterance?: Phrase & { audioUrl: string };
  /** What the user should say next. Used as the reference text for Azure pronunciation scoring. */
  expectedUserResponse?: Phrase;
  /** Which deck pair this turn is about — needed for client-side mastery tracking. */
  pairId?: string;
  /** True when this pair is being introduced for the first time. */
  isNewPhrase?: boolean;
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

type FreeFormContext = {
  userTranscript: string;
  recentHistory: Turn[];
  /** The next scripted question the tutor will deliver after this reply. */
  nextScriptedQ: Phrase | null;
  /** The expected user answer to that scripted Q. Lets Claude tell if the
   * scenario has changed even when the question looks the same. */
  nextExpectedResponse: Phrase | null;
  /** The most recent scripted Q the user already answered (if any). */
  prevScriptedQ: Phrase | null;
  /** What the user actually said in their last scripted answer. */
  prevUserAnswer: string | null;
};

async function generateFreeFormReply(ctx: FreeFormContext): Promise<Phrase | undefined> {
  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 350,
      system: `You are a friendly Mandarin tutor responding to a user's free-form question or statement in Mandarin. After your reply, the system plays a scripted practice question (nextScriptedQ) which the user should answer with nextExpectedResponse.

Rules:
1. Respond in ONE OR TWO short Mandarin sentences — like a friend, not a lecturer.
2. Your response MUST be a statement. Do NOT ask the user any question — the scripted Q comes next.
3. Do NOT include or paraphrase the scripted Q itself.
4. SEGUE NATURALLY toward the next scripted Q's topic:
   - Normal case (new topic): end with one short statement mentioning the topic. e.g. user: "你好吗?" + nextScriptedQ: "你是美国人吗?" → "我很好，谢谢。我还没去过美国。"
   - SAME-QUESTION-DIFFERENT-ANSWER case: if nextScriptedQ closely resembles prevScriptedQ but nextExpectedResponse differs from prevUserAnswer (Pimsleur teaches multiple variant answers), frame the segue as a scenario shift so the user knows to give a different answer. e.g. prev: "你会说英文吗?" / user said "我会说一点儿" / next: "你会说英文吗?" / expected: "我不会说英文" → "好。现在想象另一种情况，别人完全不会英文。" (OK. Now imagine a different scenario — someone who doesn't speak English at all.)
   - For variations (greeting changes, polite vs. casual), say something like "好的。我换一种问法。" (Good. Let me ask in a different way.)
5. Don't pile on context; keep total reply to two short sentences max.

Output ONLY a JSON object: {"hanzi": "...", "pinyin": "...", "english": "..."}`,
      messages: [{
        role: "user",
        content: JSON.stringify({
          userSaid: ctx.userTranscript,
          recentHistory: ctx.recentHistory.slice(-6),
          prevScriptedQ: ctx.prevScriptedQ,
          prevUserAnswer: ctx.prevUserAnswer,
          nextScriptedQ: ctx.nextScriptedQ,
          nextExpectedResponse: ctx.nextExpectedResponse,
        }),
      }],
    });
    const textBlock = resp.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
    const cleaned = (textBlock?.text ?? "").replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as Phrase;
    if (parsed.hanzi && parsed.pinyin && parsed.english) return parsed;
  } catch {
    // fall through to default
  }
  return { hanzi: "好。", pinyin: "hǎo.", english: "OK." };
}

const FULL_PASS_THRESHOLD = 80;
const FULL_PASS_COMPLETENESS = 50;

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const useMock = input.mock || !process.env.ANTHROPIC_API_KEY;
  if (useMock) return mockOrchestrator(input);

  // PASS branch — user just answered a scripted phrase correctly and hasn't yet
  // spoken free-form. Hand the floor to the user. No Claude call needed.
  if (input.lastUserScore && !input.userFreeFormTranscript && !input.isRetry) {
    const s = input.lastUserScore;
    const passed = s.accuracy >= FULL_PASS_THRESHOLD && s.tonesOk && s.completeness >= FULL_PASS_COMPLETENESS;
    if (passed) {
      return { speakerNext: "user", routeTo: "conversation" };
    }
  }

  // FAIL branch — score below threshold or completeness low. Use the heuristic
  // routing from the mock orchestrator (worst-word for tutor, retry-full for
  // low completeness). Claude diagnosis can layer on top later.
  if (input.lastUserScore) {
    const fallback = await mockOrchestrator(input);
    if (fallback.routeTo === "tutor" || fallback.routeTo === "retry-full") {
      return fallback;
    }
  }

  // SCRIPTED CONTENT — initial turn OR following a free-form user turn.
  // The deck-driven selector picks the next pair (mastery-aware). Claude only
  // composes the conversational reply text when the user spoke free-form.
  const { pair, isNew, aiSays, userSays } = await pickNextScripted(input);

  // Hunt back through history for the most recent scripted AI Q + user scripted answer
  // so Claude can detect "same question, different expected answer" cases.
  const reversed = [...input.history].reverse();
  const prevAiTurn = reversed.find((t) => t.speaker === "ai");
  const prevUserTurn = reversed.find((t) => t.speaker === "user");
  const prevScriptedQ = prevAiTurn?.speaker === "ai" ? prevAiTurn.phrase : null;
  const prevUserAnswer = prevUserTurn?.speaker === "user" ? prevUserTurn.text : null;

  const aiResponse = input.userFreeFormTranscript
    ? await generateFreeFormReply({
        userTranscript: input.userFreeFormTranscript,
        recentHistory: input.history,
        nextScriptedQ: { hanzi: aiSays.hanzi, pinyin: aiSays.pinyin, english: aiSays.english },
        nextExpectedResponse: { hanzi: userSays.hanzi, pinyin: userSays.pinyin, english: userSays.english },
        prevScriptedQ,
        prevUserAnswer,
      })
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
      audioUrl: "/mocks/silence.mp3",
    },
    expectedUserResponse: {
      hanzi: userSays.hanzi,
      pinyin: userSays.pinyin,
      english: userSays.english,
    },
  };
}
