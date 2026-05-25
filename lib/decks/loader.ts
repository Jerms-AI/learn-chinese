import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { DeckSchema, type Deck } from "./schema";

export async function loadDeck(filePath: string): Promise<Deck> {
  const raw = await readFile(filePath, "utf8");
  const parsed = yaml.load(raw);
  return DeckSchema.parse(parsed);
}

export async function loadAllDecks(dir: string): Promise<Deck[]> {
  const entries = await readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const decks: Deck[] = [];
  for (const f of yamlFiles) {
    decks.push(await loadDeck(path.join(dir, f)));
  }
  return decks;
}
