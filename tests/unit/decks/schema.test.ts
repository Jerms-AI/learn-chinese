import { describe, it, expect } from "vitest";
import { DeckSchema, type Deck } from "@/lib/decks/schema";

describe("DeckSchema", () => {
  it("parses a minimal Q/A pair deck", () => {
    const input = {
      deck: { id: "pim-01", title: "Pimsleur 1", source: "Pimsleur" },
      pairs: [
        {
          id: "p1",
          q: { hanzi: "你好吗？", pinyin: "nǐ hǎo ma?", english: "How are you?" },
          a: { hanzi: "我很好。", pinyin: "wǒ hěn hǎo.", english: "I'm fine." },
          tags: ["greetings"],
        },
      ],
    };
    const parsed: Deck = DeckSchema.parse(input);
    expect(parsed.pairs[0].q?.hanzi).toBe("你好吗？");
  });

  it("rejects a pair missing hanzi", () => {
    const input = {
      deck: { id: "x", title: "y", source: "z" },
      pairs: [{ id: "p1", q: { pinyin: "x", english: "y" }, a: { hanzi: "x", pinyin: "y", english: "z" } }],
    };
    expect(() => DeckSchema.parse(input)).toThrow();
  });

  it("accepts a standalone phrase pair (statement only)", () => {
    const input = {
      deck: { id: "x", title: "y", source: "z" },
      pairs: [
        {
          id: "p1",
          statement: { hanzi: "谢谢", pinyin: "xièxie", english: "thanks" },
          tags: [],
        },
      ],
    };
    const parsed = DeckSchema.parse(input);
    expect(parsed.pairs[0].statement?.hanzi).toBe("谢谢");
  });
});
