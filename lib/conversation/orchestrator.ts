import path from "node:path";
import type { Turn, Score, Mastery } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickPhraseProgressive } from "@/lib/decks/selector";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/providers/anthropic";
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
  /** How far the tutor may stray from the active lesson (0-3):
   * 0 = on-lesson (near-verbatim), 1 = recombine known words only (default),
   * 2 = may pull from other lessons in the same track, 3 = free natural talk. */
  organicLevel?: number;
  /** Words the learner personally asked for ("how do I say X"). Merged into the
   * vocab pool as ALWAYS in-scope regardless of organicLevel, so they resurface
   * in conversation over time. */
  userPhrases?: Array<{ id: string; hanzi: string; pinyin: string; english: string }>;
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

/** Fisher–Yates copy-shuffle with injectable rng (same idiom as decks/selector).
 * Used to randomize the chapterPool listing per turn: LLMs are strongly biased
 * by list order, which made every conversation walk the deck top-to-bottom in
 * the same sequence. Coverage still comes from usageCount/turnsAgo signals. */
export function shuffled<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

/** Which broad family a deck id belongs to, so "organic level 2" can widen the
 * pool to sibling lessons (all Pimsleur, or all HSK) without crossing tracks. */
export function deckFamily(id: string): string {
  if (id.startsWith("pimsleur")) return "pimsleur";
  if (id.startsWith("hsk")) return "hsk";
  return id;
}

/** The vocabulary-strictness clause injected into the system prompt, keyed to
 * the organic-level slider (0 strict → 3 free). chapterPool is the vocab the
 * model is given; this text governs how far it may reach beyond it. */
export function vocabPolicy(level: number): string {
  switch (level) {
    case 0:
      return `VOCABULARY — ON LESSON (strictest): Use ONLY phrases from chapterPool, staying as close to their exact wording as possible. Do not introduce any new words, and avoid inventive recombination — echo and lightly adapt the chapter's own phrases. If a topic can't continue with chapter phrases, pick a different chapter phrase.`;
    case 2:
      return `VOCABULARY — MORE ORGANIC: Prefer chapterPool, but you MAY draw on the wider pool you've been given (sibling lessons from the same track). Keep any word from beyond the learner's current lesson occasional, and make sure its meaning is clear from the english translation you output. Do not invent words that appear nowhere in chapterPool.`;
    case 3:
      return `VOCABULARY — MUCH MORE ORGANIC: Converse naturally like a real tutor. Prefer chapterPool vocabulary, but use whatever words the conversation genuinely calls for — including words beyond any lesson — as long as you stay comprehensible and the english translation always conveys the meaning. Keep it anchored to the current topic; don't show off with rare vocabulary.`;
    case 1:
    default:
      return `VOCABULARY — BARELY ORGANIC (default): Use ONLY words and grammar that appear in chapterPool — the learner hasn't been taught anything else, so one unknown word breaks the exercise. BUT recombine and rephrase those known words freely to keep the dialogue fresh: new sentences, different framings, varied questions. Variety comes from novel combinations of known words, never from new words. E.g. if drinks are in scope but "hot/cold" is not, ask "coffee or tea?" (in-chapter), never "hot or cold?".`;
  }
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
  organicLevel: number,
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
      // Learner's own asked-for word — always usable, and worth resurfacing.
      userRequested: (p.tags ?? []).includes("user-word"),
    };
  });

  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: CLAUDE_MODEL,
      // Adaptive thinking gives Sonnet 5 a brief reasoning pass to catch
      // state-tracking slips (don't re-ask a settled question, don't parrot the
      // user's line). Low effort keeps that pass short so latency stays modest;
      // max_tokens is raised so the thinking tokens don't crowd out the JSON.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      max_tokens: 2000,
      system: `You are a friendly Mandarin tutor having a natural back-and-forth conversation with a learner. Your job is to keep a coherent dialogue going, drawing on the active chapter (chapterPool) for vocabulary and grammar.

${vocabPolicy(organicLevel)}

Each turn you produce ONE combined Mandarin utterance: a brief, natural response to what the user said + a follow-up question that keeps the dialogue moving. Speak like a friend, not a textbook. Aim for 1-3 short sentences total.

CRITICAL — one coherent topic per turn. This is the most important rule; it overrides the vocabulary-coverage guidance below. Requirements:
- Ask exactly ONE question.
- That question MUST stay in the same semantic domain as what the user just said and your own response. If the user talked about food/eating, ask a food/eating question. If they talked about time, ask a time question.
- NEVER answer about one topic and then ask about an unrelated one in the same turn. Concretely: after "I want to eat lunch," do NOT ask "what time is it?" — ask something still about eating (what they want to eat, whether they're hungry, eating together). Jumping from food to time, or greetings to drinks, is exactly the failure to avoid.
- Changing topics is allowed, but only as a smooth segue on a LATER turn once the current thread reaches a natural close — never as an abrupt pivot tacked onto the current reply.
Before finalizing, check: does my question belong to the same topic as the exchange I'm responding to? If not, pick a different question.

CRITICAL — your role and voice. You are the learner's conversation PARTNER. You speak only YOUR OWN side of the dialogue.
- Each chapterPool pair has a "q" (the asker's line) and an "a" (the answerer's line). These show both sides of an exchange — they are NOT both yours to say. When the learner is answering you, the "a" line is THEIR line, not yours. Never speak the user's answer back to them as if it were your own (e.g. after they order coffee, do NOT say "two cups, thank you" — that's their line). Acknowledge in your own voice ("好，两杯咖啡" / "OK, two coffees") and move the conversation forward.
- React like a real person to the MEANING of what they said, don't just echo their words.

CRITICAL — track what's already settled. Read recentHistory and the user's latest message before choosing your question. NEVER ask something that has already been answered or established. If the user just said they want coffee, do NOT ask "coffee or tea?" — that's already decided; ask the natural next thing (how many, sugar if in scope, etc.). Re-asking a settled question is a serious error; a coverage signal (usageCount=0) never justifies asking something the conversation has already resolved.

If userSaid is null (initial turn), greet the learner briefly, then build your opening question from the openerSeeds pairs — a random draw for this session. Do NOT fall back to the most obvious chapter opener (e.g. "do you speak Mandarin?") unless it is in openerSeeds; the point is that each session starts somewhere different.

If userSaid has content, respond to it naturally then segue to your next question. The flow should feel like ping-pong — answer something → ask something → user replies → you answer + ask → etc.

Picking vocabulary — the goal is to organically cover the WHOLE chapter over the course of the conversation, not to loop on a few favorites:
- chapterPool is listed in RANDOM order, re-shuffled every turn. The listing order carries NO meaning — do not prefer earlier-listed pairs and do not walk the list in sequence. usageCount and turnsAgo are the only preference signals.
- Vary the conversational path between sessions: open from different angles (time, food, language, greetings — whatever the chapter offers) and pivot between topics in a different order each conversation, rather than following one fixed progression.
- Every pair in chapterPool has a usageCount (how many turns you've drawn from it) and turnsAgo (how many turns since the last time, or null if never used).
- Coherence beats coverage on any single turn. Prefer pairs with usageCount=0 (under-served topics) ONLY when they connect naturally to the current thread. Never sacrifice a coherent turn just to touch an unused pair — coverage is a goal across the WHOLE conversation, not something to force every turn. Introduce a new topic on a fresh turn with a smooth segue, not by tacking an unrelated question onto your current reply.
- Among already-used pairs, prefer those with the highest turnsAgo (stale, due for revisit). Avoid pairs used in the last 1-2 turns unless it would feel unnatural to drop the thread.
- Don't repeat the exact same phrase verbatim turn after turn — recombine, paraphrase, ask the same vocabulary in a different frame.
- Pairs with "userRequested": true are words the learner personally asked you to teach them. They are ALWAYS allowed no matter the vocabulary policy above (the learner explicitly wanted them), and you should weave them into the conversation from time to time to reinforce them — especially freshly-added ones (usageCount 0). Don't force one in every turn; let them surface naturally like any other under-served pair.
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
          // Pool order is already shuffled per turn, so the head of the list
          // is a uniform random draw — used to force opener variety.
          openerSeeds: userTranscript === null ? annotated.slice(0, 2).map((p) => p.id) : [],
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
  const level = input.organicLevel ?? 1;
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  // Organic level >= 2 widens the vocab pool to sibling lessons in the same
  // track (all Pimsleur, or all HSK), so the tutor can reach a step beyond the
  // selected lesson. Levels 0-1 stay strictly within the selected chapter.
  const poolDecks = level >= 2 && input.activeDeckIds.length > 0
    ? decks.filter((d) => new Set(input.activeDeckIds.map(deckFamily)).has(deckFamily(d.deck.id)))
    : filtered;
  // Shuffled per turn so the listing order can't rut the conversation into
  // one fixed deck-order progression (see shuffled() above).
  const chapterPairs = shuffled(poolDecks.flatMap((d) => d.pairs));
  // The learner's own asked-for words are always part of the pool, regardless of
  // organic level — they explicitly requested them, so they're never out of scope.
  const userPairs: Pair[] = (input.userPhrases ?? []).map((w) => ({
    id: w.id,
    statement: { hanzi: w.hanzi, pinyin: w.pinyin, english: w.english },
    tags: ["user-word"],
  }));
  const chapterPool = [...chapterPairs, ...userPairs];

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
    level,
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
