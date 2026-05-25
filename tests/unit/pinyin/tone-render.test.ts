import { describe, it, expect } from "vitest";
import { detectToneOfSyllable, splitPinyinSyllables } from "@/lib/pinyin/tone-render";

describe("detectToneOfSyllable", () => {
  it("detects tone 1 (macron)", () => {
    expect(detectToneOfSyllable("mā")).toBe(1);
  });
  it("detects tone 2 (acute)", () => {
    expect(detectToneOfSyllable("má")).toBe(2);
  });
  it("detects tone 3 (caron)", () => {
    expect(detectToneOfSyllable("mǎ")).toBe(3);
  });
  it("detects tone 4 (grave)", () => {
    expect(detectToneOfSyllable("mà")).toBe(4);
  });
  it("returns 5 for neutral (no mark)", () => {
    expect(detectToneOfSyllable("ma")).toBe(5);
  });
});

describe("splitPinyinSyllables", () => {
  it("splits multi-syllable pinyin separated by spaces", () => {
    expect(splitPinyinSyllables("nǐ hǎo ma?")).toEqual(["nǐ", "hǎo", "ma?"]);
  });
});
