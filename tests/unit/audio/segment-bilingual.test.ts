import { describe, it, expect } from "vitest";
import { segmentBilingual } from "@/lib/providers/azure-tts";

describe("segmentBilingual", () => {
  it("splits English coaching from hanzi examples", () => {
    expect(segmentBilingual("Say 一点 slowly")).toEqual([
      { lang: "en", text: "Say" },
      { lang: "zh", text: "一点" },
      { lang: "en", text: "slowly" },
    ]);
  });

  it("keeps CJK punctuation with the Chinese voice", () => {
    expect(segmentBilingual("Try the whole phrase: 我想跟你一起吃饭。")).toEqual([
      { lang: "en", text: "Try the whole phrase:" },
      { lang: "zh", text: "我想跟你一起吃饭。" },
    ]);
  });

  it("keeps Latin punctuation and quotes with the English voice", () => {
    const segs = segmentBilingual("It sounds like 'ee-chee' — two beats: 一起");
    expect(segs[0]).toEqual({ lang: "en", text: "It sounds like 'ee-chee' — two beats:" });
    expect(segs[1]).toEqual({ lang: "zh", text: "一起" });
  });

  it("handles pure-English and pure-Chinese", () => {
    expect(segmentBilingual("Just slow down.")).toEqual([{ lang: "en", text: "Just slow down." }]);
    expect(segmentBilingual("我很好。")).toEqual([{ lang: "zh", text: "我很好。" }]);
  });

  it("handles multiple alternations", () => {
    const segs = segmentBilingual("First 你 then 好 together: 你好");
    expect(segs.map((s) => s.lang)).toEqual(["en", "zh", "en", "zh", "en", "zh"]);
  });

  it("returns empty for empty/whitespace input", () => {
    expect(segmentBilingual("")).toEqual([]);
    expect(segmentBilingual("   ")).toEqual([]);
  });
});
