import path from "node:path";
import type { Turn, Score, Mastery } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickPhraseProgressive } from "@/lib/decks/selector";
import { getAnthropic, CLAUDE_HAIKU_MODEL } from "@/lib/providers/anthropic";
import { isMastered } from "./state";
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

type FreeFormResult = {
  /** What the user said, augmented with pinyin + english translation. */
  userAugmented?: Phrase;
  /** The AI's natural reply (with optional segue to the next scripted Q). */
  aiReply?: Phrase;
  /** Pair ID Claude picked from the candidate pool, if any. Validated by caller. */
  chosenPairId?: string;
};

async function generateContextualReply(
  ctx: FreeFormContext,
  candidates: Pair[],
  introducedIds: string[],
  mastery: Record<string, import("./state").Mastery>
): Promise<FreeFormResult> {
  // Annotate candidates with status so Claude knows what to prefer.
  const introducedSet = new Set(introducedIds);
  const annotated = candidates.map((p) => ({
    id: p.id,
    q: p.q,
    a: p.a,
    statement: p.statement,
    tags: p.tags,
    status: !introducedSet.has(p.id) ? "new" : isMastered(mastery[p.id]) ? "mastered" : "learning",
  }));

  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 400,
      system: `You are a friendly Mandarin tutor leading a free-flowing conversation that stays within a fixed pool of chapter phrases. The user just said something free-form. You will do THREE things in JSON:

1. user: pinyin (with tone marks) + English translation of what the user said.
2. reply: ONE or TWO short Mandarin statement sentences as a natural conversational reply. Do NOT ask a question — the scripted phrase comes after.
3. chosenPairId: pick the next scripted phrase to drill from the candidates list.

Picking rules:
- Pick what fits the CONVERSATIONAL CONTEXT — if the user asked about food, choose a food-related candidate; if they asked about your day, a time/feelings one. Build coherent dialogue threads.
- PREFER candidates with status "new" or "learning" (the learner makes progress). "mastered" candidates are review-only; pick them only if no contextual fit exists in new/learning.
- DON'T pick a candidate whose q/statement closely resembles the prevScriptedQ — don't immediately re-ask the same kind of question.
- Your reply's last sentence should gently segue to the topic of the picked phrase so the transition feels natural.

Output ONLY this JSON (no markdown):
{
  "user": { "pinyin": "...", "english": "..." },
  "reply": { "hanzi": "...", "pinyin": "...", "english": "..." },
  "chosenPairId": "<id from candidates>"
}`,
      messages: [{
        role: "user",
        content: JSON.stringify({
          userSaid: ctx.userTranscript,
          recentHistory: ctx.recentHistory.slice(-6),
          prevScriptedQ: ctx.prevScriptedQ,
          prevUserAnswer: ctx.prevUserAnswer,
          candidates: annotated,
        }),
      }],
    });
    const textBlock = resp.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
    const cleaned = (textBlock?.text ?? "").replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      user?: { pinyin?: string; english?: string };
      reply?: { hanzi?: string; pinyin?: string; english?: string };
      chosenPairId?: string;
    };
    const userAugmented = parsed.user?.pinyin && parsed.user?.english
      ? { hanzi: ctx.userTranscript, pinyin: parsed.user.pinyin, english: parsed.user.english }
      : undefined;
    const aiReply = parsed.reply?.hanzi && parsed.reply?.pinyin && parsed.reply?.english
      ? { hanzi: parsed.reply.hanzi, pinyin: parsed.reply.pinyin, english: parsed.reply.english }
      : { hanzi: "好。", pinyin: "hǎo.", english: "OK." };
    return { userAugmented, aiReply, chosenPairId: parsed.chosenPairId };
  } catch {
    return { aiReply: { hanzi: "好。", pinyin: "hǎo.", english: "OK." } };
  }
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

  // Hunt back through history for the most recent scripted AI Q + user scripted answer.
  const reversed = [...input.history].reverse();
  const prevAiTurn = reversed.find((t) => t.speaker === "ai");
  const prevUserTurn = reversed.find((t) => t.speaker === "user");
  const prevScriptedQ = prevAiTurn?.speaker === "ai" ? prevAiTurn.phrase : null;
  const prevUserAnswer = prevUserTurn?.speaker === "user" ? prevUserTurn.text : null;

  // FREE-FORM PATH: Claude picks the next scripted phrase contextually from the
  // active chapter's pool + composes the conversational reply.
  if (input.userFreeFormTranscript) {
    const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
    const filtered = input.activeDeckIds.length > 0
      ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
      : decks;
    const candidatePool = filtered
      .flatMap((d) => d.pairs)
      .filter((p) => p.id !== input.currentPairId)
      .slice(0, 30);

    const result = await generateContextualReply(
      {
        userTranscript: input.userFreeFormTranscript,
        recentHistory: input.history,
        nextScriptedQ: null,
        nextExpectedResponse: null,
        prevScriptedQ,
        prevUserAnswer,
      },
      candidatePool,
      input.introducedIds ?? [],
      input.mastery ?? {}
    );

    // Look up the chosen pair from the candidate pool. Fall back to the
    // deterministic selector if Claude's id is invalid (hallucinated, missing, etc.).
    let pickedPair = candidatePool.find((p) => p.id === result.chosenPairId);
    let pickedIsNew = !!pickedPair && !(input.introducedIds ?? []).includes(pickedPair.id);
    if (!pickedPair) {
      const fb = await pickNextScripted(input);
      pickedPair = fb.pair;
      pickedIsNew = fb.isNew;
    }
    const aiSays = pickedPair.q ?? pickedPair.statement!;
    const userSays = pickedPair.a ?? pickedPair.statement ?? aiSays;

    return {
      speakerNext: "ai",
      routeTo: "conversation",
      pairId: pickedPair.id,
      isNewPhrase: pickedIsNew,
      aiResponse: result.aiReply,
      userAugmented: result.userAugmented,
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

  // INITIAL AI TURN — no free-form input. Use the deterministic selector.
  const { pair, isNew, aiSays, userSays } = await pickNextScripted(input);
  return {
    speakerNext: "ai",
    routeTo: "conversation",
    pairId: pair.id,
    isNewPhrase: isNew,
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
