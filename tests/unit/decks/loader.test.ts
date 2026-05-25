import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadDeck, loadAllDecks } from "@/lib/decks/loader";

const fixturePath = path.join(process.cwd(), "decks", "_fixture-mini.yaml");

describe("loadDeck", () => {
  it("loads and parses a single YAML deck", async () => {
    const deck = await loadDeck(fixturePath);
    expect(deck.deck.id).toBe("fixture-mini");
    expect(deck.pairs).toHaveLength(1);
    expect(deck.pairs[0].q?.hanzi).toBe("你好");
  });

  it("throws on malformed YAML", async () => {
    await expect(loadDeck("/nonexistent.yaml")).rejects.toThrow();
  });
});

describe("loadAllDecks", () => {
  it("loads every .yaml in decks/ directory", async () => {
    const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
    expect(decks.length).toBeGreaterThanOrEqual(1);
    expect(decks.some((d) => d.deck.id === "fixture-mini")).toBe(true);
  });
});
