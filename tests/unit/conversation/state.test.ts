import { describe, it, expect } from "vitest";
import { initialState, applyEvent, type State, type Event } from "@/lib/conversation/state";

describe("conversation state machine", () => {
  it("starts in 'idle' with empty history and AI to speak first", () => {
    const s = initialState();
    expect(s.mode).toBe("idle");
    expect(s.history).toEqual([]);
    expect(s.nextSpeaker).toBe("ai");
  });

  it("transitions to 'ai-speaking' on START", () => {
    const s = applyEvent(initialState(), { type: "START" });
    expect(s.mode).toBe("ai-speaking");
  });

  it("appends a user turn on USER_UTTERANCE", () => {
    let s = applyEvent(initialState(), { type: "START" });
    s = applyEvent(s, {
      type: "AI_SPOKE",
      utterance: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" },
    });
    s = applyEvent(s, {
      type: "USER_UTTERANCE",
      transcript: "我很好",
      score: { accuracy: 90, tonesOk: true, words: [] },
    });
    expect(s.history.at(-1)?.speaker).toBe("user");
    expect(s.history.at(-1)?.text).toBe("我很好");
  });

  it("routes to 'tutor' when score is below threshold", () => {
    let s = applyEvent(initialState(), { type: "START" });
    s = applyEvent(s, {
      type: "AI_SPOKE",
      utterance: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" },
    });
    s = applyEvent(s, {
      type: "USER_UTTERANCE",
      transcript: "wo hen hao",
      score: { accuracy: 50, tonesOk: false, words: [] },
    });
    expect(s.mode).toBe("tutor");
  });

  it("flips turn to user after a successful AI question", () => {
    let s = applyEvent(initialState(), { type: "START" });
    s = applyEvent(s, {
      type: "AI_SPOKE",
      utterance: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" },
    });
    s = applyEvent(s, {
      type: "USER_UTTERANCE",
      transcript: "我很好",
      score: { accuracy: 90, tonesOk: true, words: [] },
    });
    s = applyEvent(s, { type: "AI_CONFIRMED" });
    expect(s.mode).toBe("awaiting-user-question");
    expect(s.nextSpeaker).toBe("user");
  });
});
