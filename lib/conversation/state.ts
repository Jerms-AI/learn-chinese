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
  | { speaker: "user"; text: string; score: Score; at: number };

export type Mastery = {
  streak: number;       // consecutive successful attempts
  attempts: number;     // total attempts
  correct: number;      // total passes
  lastSeenAt: number;   // ms timestamp of most recent attempt
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
};

export type Event =
  | { type: "START" }
  | { type: "AI_SPOKE"; utterance: Phrase; expectedResponse?: Phrase; pairId?: string; isNewPhrase?: boolean }
  | { type: "USER_UTTERANCE"; transcript: string; score: Score; passed: boolean }
  | { type: "AI_CONFIRMED" }
  | { type: "TUTOR_RESOLVED" }
  | { type: "RESET" }
  | { type: "REHYDRATE"; state: State };

export function initialState(): State {
  return { mode: "idle", history: [], nextSpeaker: "ai", introducedIds: [], mastery: {} };
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
      // If this pair is newly introduced and we haven't seen it before, append to the order.
      const newlyIntroduced =
        e.isNewPhrase && e.pairId && !s.introducedIds.includes(e.pairId);
      return {
        ...s,
        mode: "awaiting-user-answer",
        history: [...s.history, turn],
        pendingPhrase: e.utterance,
        expectedResponse: e.expectedResponse,
        currentPairId: e.pairId,
        introducedIds: newlyIntroduced ? [...s.introducedIds, e.pairId!] : s.introducedIds,
      };
    }

    case "USER_UTTERANCE": {
      const turn: Turn = {
        speaker: "user",
        text: e.transcript,
        score: e.score,
        at: Date.now(),
      };
      // Update mastery for the pair currently being practiced.
      let mastery = s.mastery;
      if (s.currentPairId) {
        const prior = s.mastery[s.currentPairId] ?? { streak: 0, attempts: 0, correct: 0, lastSeenAt: 0 };
        mastery = {
          ...s.mastery,
          [s.currentPairId]: {
            streak: e.passed ? prior.streak + 1 : 0,
            attempts: prior.attempts + 1,
            correct: prior.correct + (e.passed ? 1 : 0),
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
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user", pendingPhrase: undefined, expectedResponse: undefined, currentPairId: undefined };

    case "TUTOR_RESOLVED":
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user" };

    case "RESET":
      return initialState();

    case "REHYDRATE":
      return e.state;
  }
}
