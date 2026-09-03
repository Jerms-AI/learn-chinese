import { describe, it, expect } from "vitest";
import { textMatchJudge, normalizeHanzi } from "@/lib/tutor/judge";

describe("normalizeHanzi", () => {
  it("strips punctuation and whitespace, keeps hanzi", () => {
    expect(normalizeHanzi("一点。")).toBe("一点");
    expect(normalizeHanzi("你好， 你 叫 什么 名字？")).toBe("你好你叫什么名字");
    expect(normalizeHanzi("  一点钟!  ")).toBe("一点钟");
  });
});

describe("textMatchJudge", () => {
  it("passes an exact match", () => {
    expect(textMatchJudge({ transcript: "一点", target: "一点" }).pass).toBe(true);
  });

  it("passes despite punctuation/spacing differences", () => {
    expect(textMatchJudge({ transcript: "一点。", target: "一点" }).pass).toBe(true);
    expect(textMatchJudge({ transcript: "一 点", target: "一点。" }).pass).toBe(true);
  });

  it("passes containment — polite extras around the target are fine", () => {
    expect(textMatchJudge({ transcript: "我想一点钟吃饭", target: "一点钟" }).pass).toBe(true);
  });

  it("fails when the recognizer heard different words", () => {
    const r = textMatchJudge({ transcript: "你好", target: "一点" });
    expect(r.pass).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("fails on empty transcript", () => {
    expect(textMatchJudge({ transcript: "", target: "一点" }).pass).toBe(false);
  });

  it("fails when target is empty (never auto-pass)", () => {
    expect(textMatchJudge({ transcript: "一点", target: "" }).pass).toBe(false);
  });
});
