import type { Deck, Pair } from "./schema";

export type PickOptions = {
  seenIds: string[];
  rng?: () => number;
};

export function pickNextPair(decks: Deck[], opts: PickOptions): Pair {
  const all = decks.flatMap((d) => d.pairs);
  if (all.length === 0) throw new Error("No pairs available");

  const unseen = all.filter((p) => !opts.seenIds.includes(p.id));
  const pool = unseen.length > 0 ? unseen : all;
  const rng = opts.rng ?? Math.random;
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}
