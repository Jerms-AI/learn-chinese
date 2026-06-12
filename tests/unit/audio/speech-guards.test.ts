import { describe, it, expect } from "vitest";
import { MIN_SPEECH_BYTES, containsHanzi } from "@/lib/audio/speech-guards";

describe("MIN_SPEECH_BYTES", () => {
  it("rejects the header-only blobs that produced hallucinated transcripts", () => {
    // Real-world failure: 534-byte webm (container header, ~0 audio frames)
    // came back from gpt-4o-transcribe as "bravo."
    expect(534).toBeLessThan(MIN_SPEECH_BYTES);
  });

  it("accepts a short real utterance", () => {
    // ~1s of opus speech is roughly 4-6 KB; threshold must sit well below.
    expect(4000).toBeGreaterThan(MIN_SPEECH_BYTES);
  });
});

describe("containsHanzi", () => {
  it("accepts simplified Mandarin", () => {
    expect(containsHanzi("我很好")).toBe(true);
  });

  it("accepts traditional characters (whisper sometimes returns them)", () => {
    expect(containsHanzi("你叫什麼名字？")).toBe(true);
  });

  it("accepts hanzi mixed with punctuation and spaces", () => {
    expect(containsHanzi("你好， 你 叫 什么 名字?")).toBe(true);
  });

  it("rejects hallucinated English fillers", () => {
    expect(containsHanzi("bravo.")).toBe(false);
  });

  it("rejects English sentences", () => {
    expect(containsHanzi("I am very good")).toBe(false);
  });

  it("rejects pinyin-only output", () => {
    expect(containsHanzi("nǐ hǎo")).toBe(false);
  });

  it("rejects empty and whitespace strings", () => {
    expect(containsHanzi("")).toBe(false);
    expect(containsHanzi("   ")).toBe(false);
  });
});
