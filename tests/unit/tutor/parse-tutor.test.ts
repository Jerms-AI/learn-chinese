import { describe, it, expect } from "vitest";
import { parseTutorSuggestion, parseTutorTip } from "@/lib/conversation/orchestrator";

describe("parseTutorSuggestion", () => {
  it("parses a well-formed suggestion", () => {
    const raw = JSON.stringify({ suggestion: { hanzi: "一点", pinyin: "yī diǎn", english: "one o'clock" } });
    expect(parseTutorSuggestion(raw)).toEqual({ hanzi: "一点", pinyin: "yī diǎn", english: "one o'clock" });
  });

  it("strips markdown fences", () => {
    const raw = "```json\n" + JSON.stringify({ suggestion: { hanzi: "好", pinyin: "hǎo", english: "good" } }) + "\n```";
    expect(parseTutorSuggestion(raw).hanzi).toBe("好");
  });

  it("throws on missing fields (caller falls back)", () => {
    expect(() => parseTutorSuggestion(JSON.stringify({ suggestion: { hanzi: "好" } }))).toThrow();
    expect(() => parseTutorSuggestion("not json")).toThrow();
  });
});

describe("parseTutorTip", () => {
  it("parses display + speakable variants", () => {
    const out = parseTutorTip(JSON.stringify({ tip: "Say 'yī diǎn'.", speak: "Say 一点." }));
    expect(out).toEqual({ tip: "Say 'yī diǎn'.", speak: "Say 一点." });
  });

  it("falls back speak → tip when speak is missing", () => {
    const out = parseTutorTip(JSON.stringify({ tip: "Word by word." }));
    expect(out.speak).toBe("Word by word.");
  });

  it("throws on missing/empty tip", () => {
    expect(() => parseTutorTip(JSON.stringify({}))).toThrow();
    expect(() => parseTutorTip(JSON.stringify({ tip: "" }))).toThrow();
  });
});
