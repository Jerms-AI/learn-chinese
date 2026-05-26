import type { Phrase } from "@/lib/decks/schema";

export type Mode =
  | "idle"
  | "ai-speaking"
  | "awaiting-user-answer"
  | "awaiting-user-question"
  | "user-speaking"
  | "tutor";

export type Speaker = "ai" | "user";

export type Score = {
  accuracy: number;        // 0-100, overall pronunciation accuracy
  completeness: number;    // 0-100, how much of the reference text was heard
  tonesOk: boolean;
  words: Array<{ word: string; accuracy: number; tone?: number }>;
};

export type Turn =
  | { speaker: "ai"; text: string; phrase: Phrase; at: number }
  | { speaker: "user"; text: string; score: Score; at: number }
  | { speaker: "user-freeform"; text: string; at: number };

export type Tier = "red" | "orange" | "yellow" | "green";

export type Mastery = {
  lastTiers: Tier[];      // rolling window of the last 3 attempt tiers (chronological)
  attempts: number;       // total attempts
  correct: number;        // total non-red attempts
  lastSeenAt: number;     // ms timestamp of most recent attempt
};

/** 90+ green · 80-89 yellow · 70-79 orange · <70 red. */
export function tierFromAvgAccuracy(avg: number): Tier {
  if (avg >= 90) return "green";
  if (avg >= 80) return "yellow";
  if (avg >= 70) return "orange";
  return "red";
}

/** A phrase is mastered when its 3 most recent attempts are all non-red. */
export function isMastered(m: Mastery | undefined): boolean {
  if (!m || (m.lastTiers ?? []).length < 3) return false;
  return m.lastTiers.every((t) => t !== "red");
}

/** Per-character average accuracy from a score — what tiers are computed against. */
export function avgWordAccuracy(score: Score): number {
  if (score.words.length === 0) return score.accuracy;
  const sum = score.words.reduce((s, w) => s + w.accuracy, 0);
  return Math.round(sum / score.words.length);
}

/** Snapshot of a pair's display info, captured at first introduction so the library
 * card can render it without re-fetching deck data. */
export type LibraryEntry = {
  prompt: Phrase;           // what the AI says — the "question side" of the pair
  response?: Phrase;        // what the user should say — usually the "answer side"
};

export type State = {
  mode: Mode;
  history: Turn[];
  nextSpeaker: Speaker;
  pendingPhrase?: Phrase;          // what AI just said
  expectedResponse?: Phrase;       // what user should say back (scoring reference)
  currentPairId?: string;          // deck pair currently being practiced
  introducedIds: string[];         // pair IDs the learner has been exposed to (in order)
  mastery: Record<string, Mastery>;
  phraseLibrary: Record<string, LibraryEntry>;
};

export type Event =
  | { type: "START" }
  | { type: "AI_SPOKE"; utterance: Phrase; expectedResponse?: Phrase; pairId?: string; isNewPhrase?: boolean }
  | { type: "USER_UTTERANCE"; transcript: string; score: Score; passed: boolean; tier?: Tier | null }
  | { type: "USER_FREEFORM"; transcript: string }
  | { type: "AI_RESPONDED_FREEFORM"; utterance: Phrase }
  | { type: "AI_CONFIRMED" }
  | { type: "TUTOR_RESOLVED" }
  | { type: "RESET" }
  | { type: "REHYDRATE"; state: State };

export function initialState(): State {
  return {
    mode: "idle",
    history: [],
    nextSpeaker: "ai",
    introducedIds: [],
    mastery: {},
    phraseLibrary: {},
  };
}

export function applyEvent(s: State, e: Event): State {
  switch (e.type) {
    case "START":
      return { ...s, mode: "ai-speaking", nextSpeaker: "ai" };

    case "AI_SPOKE": {
      const turn: Turn = {
        speaker: "ai",
        text: e.utterance.hanzi,
        phrase: e.utterance,
        at: Date.now(),
      };
      // If this pair is newly introduced and we haven't seen it before, append to the order
      // AND snapshot its prompt/response in the library card.
      const newlyIntroduced =
        e.isNewPhrase && e.pairId && !s.introducedIds.includes(e.pairId);
      const phraseLibrary =
        newlyIntroduced && e.pairId
          ? {
              ...s.phraseLibrary,
              [e.pairId]: { prompt: e.utterance, response: e.expectedResponse },
            }
          : s.phraseLibrary;
      return {
        ...s,
        mode: "awaiting-user-answer",
        history: [...s.history, turn],
        pendingPhrase: e.utterance,
        expectedResponse: e.expectedResponse,
        currentPairId: e.pairId,
        introducedIds: newlyIntroduced ? [...s.introducedIds, e.pairId!] : s.introducedIds,
        phraseLibrary,
      };
    }

    case "USER_UTTERANCE": {
      const turn: Turn = {
        speaker: "user",
        text: e.transcript,
        score: e.score,
        at: Date.now(),
      };
      // Update mastery for the pair currently being practiced. Tier is null for
      // tutor retries (we don't push those into the rolling window).
      let mastery = s.mastery;
      if (s.currentPairId && e.tier) {
        const prior = s.mastery[s.currentPairId] ?? { lastTiers: [], attempts: 0, correct: 0, lastSeenAt: 0 };
        const nextTiers = [...(prior.lastTiers ?? []), e.tier].slice(-3);
        mastery = {
          ...s.mastery,
          [s.currentPairId]: {
            lastTiers: nextTiers,
            attempts: prior.attempts + 1,
            correct: prior.correct + (e.tier !== "red" ? 1 : 0),
            lastSeenAt: Date.now(),
          },
        };
      }
      return {
        ...s,
        mode: e.passed ? s.mode : "tutor",
        history: [...s.history, turn],
        mastery,
      };
    }

    case "AI_CONFIRMED":
      // Keep pendingPhrase so the PhraseCard stays visible during free-form mode
      // (it shows the AI's last scripted line in "they said"; the "your line"
      // section morphs to the "ask a question" prompt via the isFreeForm flag).
      // expectedResponse + currentPairId clear since the scripted exchange is done.
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user", expectedResponse: undefined, currentPairId: undefined };

    case "USER_FREEFORM": {
      const turn: Turn = { speaker: "user-freeform", text: e.transcript, at: Date.now() };
      return { ...s, history: [...s.history, turn] };
    }

    case "AI_RESPONDED_FREEFORM": {
      // Claude's free-form reply: show in "they said" without an expected response
      // or scripted-pair context. The next AI_SPOKE will replace this with the
      // scripted phrase.
      const turn: Turn = { speaker: "ai", text: e.utterance.hanzi, phrase: e.utterance, at: Date.now() };
      return {
        ...s,
        mode: "ai-speaking",
        history: [...s.history, turn],
        pendingPhrase: e.utterance,
        expectedResponse: undefined,
        currentPairId: undefined,
      };
    }

    case "TUTOR_RESOLVED":
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user" };

    case "RESET":
      return initialState();

    case "REHYDRATE":
      return e.state;
  }
}
