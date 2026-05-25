import { describe, it, expect } from "vitest";
import { pickNextPair } from "@/lib/decks/selector";
import type { Deck } from "@/lib/decks/schema";

const deck: Deck = {
  deck: { id: "d", title: "t", source: "s" },
  pairs: [
    { id: "p1", q: { hanzi: "a", pinyin: "a", english: "a" }, a: { hanzi: "b", pinyin: "b", english: "b" }, tags: [] },
    { id: "p2", q: { hanzi: "c", pinyin: "c", english: "c" }, a: { hanzi: "d", pinyin: "d", english: "d" }, tags: [] },
  ],
};

describe("pickNextPair", () => {
  it("returns a pair from the deck", () => {
    const picked = pickNextPair([deck], { seenIds: [], rng: () => 0 });
    expect(["p1", "p2"]).toContain(picked.id);
  });

  it("avoids recently-seen pairs when possible", () => {
    const picked = pickNextPair([deck], { seenIds: ["p1"], rng: () => 0 });
    expect(picked.id).toBe("p2");
  });

  it("falls back to any pair when all are seen", () => {
    const picked = pickNextPair([deck], { seenIds: ["p1", "p2"], rng: () => 0 });
    expect(["p1", "p2"]).toContain(picked.id);
  });
});
