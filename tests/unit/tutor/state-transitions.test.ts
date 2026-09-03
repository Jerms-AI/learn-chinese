import { describe, it, expect } from "vitest";
import { applyEvent, initialState, type State } from "@/lib/conversation/state";

const TARGET = { hanzi: "一点", pinyin: "yī diǎn", english: "one o'clock" };

function awaiting(): State {
  return { ...initialState(), mode: "awaiting-user-question" };
}

function listening(): State {
  let s = awaiting();
  s = applyEvent(s, { type: "TUTOR_TIMEOUT" });
  s = applyEvent(s, { type: "TUTOR_SUGGESTED", target: TARGET });
  return s;
}

describe("tutor state transitions", () => {
  it("TUTOR_TIMEOUT moves awaiting-user-question → tutor-prompting", () => {
    const s = applyEvent(awaiting(), { type: "TUTOR_TIMEOUT" });
    expect(s.mode).toBe("tutor-prompting");
  });

  it("TUTOR_TIMEOUT is ignored outside awaiting-user-question", () => {
    const idle = initialState();
    expect(applyEvent(idle, { type: "TUTOR_TIMEOUT" }).mode).toBe("idle");
  });

  it("TUTOR_SUGGESTED arms the practice loop", () => {
    const s = listening();
    expect(s.mode).toBe("tutor-listening");
    expect(s.tutor).toEqual({ target: TARGET, successes: 0, consecutiveFails: 0, attempts: [] });
  });

  it("a passing attempt increments successes and resets consecutive fails", () => {
    let s = listening();
    s = applyEvent(s, { type: "TUTOR_ATTEMPT", transcript: "一点", pass: true });
    expect(s.tutor?.successes).toBe(1);
    expect(s.tutor?.consecutiveFails).toBe(0);
    expect(s.tutor?.attempts).toEqual(["一点"]);
  });

  it("failing attempts accumulate consecutively; a pass resets the streak", () => {
    let s = listening();
    s = applyEvent(s, { type: "TUTOR_ATTEMPT", transcript: "你好", pass: false });
    s = applyEvent(s, { type: "TUTOR_ATTEMPT", transcript: "以前", pass: false });
    expect(s.tutor?.consecutiveFails).toBe(2);
    s = applyEvent(s, { type: "TUTOR_ATTEMPT", transcript: "一点", pass: true });
    expect(s.tutor?.consecutiveFails).toBe(0);
    expect(s.tutor?.successes).toBe(1);
    expect(s.tutor?.attempts).toHaveLength(3);
  });

  it("TUTOR_DEEPEN moves to tutor-deep, keeping the practice state", () => {
    let s = listening();
    s = applyEvent(s, { type: "TUTOR_ATTEMPT", transcript: "你好", pass: false });
    s = applyEvent(s, { type: "TUTOR_DEEPEN" });
    expect(s.mode).toBe("tutor-deep");
    expect(s.tutor?.target).toEqual(TARGET);
    expect(s.tutor?.consecutiveFails).toBe(1);
  });

  it("TUTOR_EXIT clears tutor state and returns to conversation", () => {
    for (const reason of ["success", "skip"] as const) {
      let s = listening();
      s = applyEvent(s, { type: "TUTOR_EXIT", reason });
      expect(s.mode).toBe("awaiting-user-question");
      expect(s.tutor).toBeUndefined();
      expect(s.nextSpeaker).toBe("user");
    }
  });

  it("REHYDRATE never resumes mid-tutor — coerces back to conversation", () => {
    const midTutor = listening();
    const s = applyEvent(initialState(), { type: "REHYDRATE", state: midTutor });
    expect(s.mode).toBe("awaiting-user-question");
    expect(s.tutor).toBeUndefined();
  });

  it("RESET clears tutor state", () => {
    const s = applyEvent(listening(), { type: "RESET" });
    expect(s.tutor).toBeUndefined();
    expect(s.mode).toBe("idle");
  });
});
