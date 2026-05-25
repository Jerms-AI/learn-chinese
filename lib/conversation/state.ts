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

export type State = {
  mode: Mode;
  history: Turn[];
  nextSpeaker: Speaker;
  pendingPhrase?: Phrase;        // what AI just said
  expectedResponse?: Phrase;     // what user should say back (scoring reference)
};

export type Event =
  | { type: "START" }
  | { type: "AI_SPOKE"; utterance: Phrase; expectedResponse?: Phrase }
  | { type: "USER_UTTERANCE"; transcript: string; score: Score }
  | { type: "AI_CONFIRMED" }
  | { type: "TUTOR_RESOLVED" }
  | { type: "RESET" }
  | { type: "REHYDRATE"; state: State };

const PASS_THRESHOLD = 80;

export function initialState(): State {
  return { mode: "idle", history: [], nextSpeaker: "ai" };
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
      return {
        ...s,
        mode: "awaiting-user-answer",
        history: [...s.history, turn],
        pendingPhrase: e.utterance,
        expectedResponse: e.expectedResponse,
      };
    }

    case "USER_UTTERANCE": {
      const turn: Turn = {
        speaker: "user",
        text: e.transcript,
        score: e.score,
        at: Date.now(),
      };
      const passed = e.score.accuracy >= PASS_THRESHOLD && e.score.tonesOk;
      return {
        ...s,
        mode: passed ? s.mode : "tutor",
        history: [...s.history, turn],
      };
    }

    case "AI_CONFIRMED":
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user", pendingPhrase: undefined, expectedResponse: undefined };

    case "TUTOR_RESOLVED":
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user" };

    case "RESET":
      return initialState();

    case "REHYDRATE":
      return e.state;
  }
}
