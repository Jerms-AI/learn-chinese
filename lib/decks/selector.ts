import type { Deck, Pair } from "./schema";
import type { Mastery } from "@/lib/conversation/state";

export type PickOptions = {
  seenIds: string[];
  rng?: () => number;
};

/** Original random picker — preserved for tests and as a fallback. */
export function pickNextPair(decks: Deck[], opts: PickOptions): Pair {
  const all = decks.flatMap((d) => d.pairs);
  if (all.length === 0) throw new Error("No pairs available");

  const unseen = all.filter((p) => !opts.seenIds.includes(p.id));
  const pool = unseen.length > 0 ? unseen : all;
  const rng = opts.rng ?? Math.random;
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}

export type ProgressiveOptions = {
  introducedIds: string[];
  mastery: Record<string, Mastery>;
  /** Streak required to consider a phrase "owned" enough to introduce a new one. */
  masteryThreshold?: number;
  /** Avoid picking this id (e.g. the one just shown). */
  avoidId?: string;
  now?: number;
  rng?: () => number;
};

export type ProgressivePick = {
  pair: Pair;
  isNew: boolean;
};

/**
 * Comprehensible-input style selector:
 *  - If nothing has been introduced yet, introduce the first pair in the deck.
 *  - If every currently-introduced pair has streak ≥ threshold, introduce the next one.
 *  - Otherwise pick from the introduced pool weighted toward weakest/oldest.
 *
 * Pair ordering is the deck author's order (decks are concatenated in array order).
 */
export function pickPhraseProgressive(
  decks: Deck[],
  opts: ProgressiveOptions
): ProgressivePick {
  const allPairs = decks.flatMap((d) => d.pairs);
  if (allPairs.length === 0) throw new Error("No pairs available");

  const threshold = opts.masteryThreshold ?? 3;
  const now = opts.now ?? Date.now();
  const rng = opts.rng ?? Math.random;
  const introducedSet = new Set(opts.introducedIds);
  const introduced = allPairs.filter((p) => introducedSet.has(p.id));

  // Bootstrap: nothing introduced yet → take the first pair.
  if (introduced.length === 0) {
    return { pair: allPairs[0], isNew: true };
  }

  // All introduced pairs are at-or-above mastery → introduce the next one.
  const allMastered = introduced.every(
    (p) => (opts.mastery[p.id]?.streak ?? 0) >= threshold
  );
  if (allMastered) {
    const next = allPairs.find((p) => !introducedSet.has(p.id));
    if (next) return { pair: next, isNew: true };
    // Nothing new to introduce; fall through to weighted pick over introduced.
  }

  // Weighted pick from the introduced pool. Avoid picking the same pair twice
  // in a row when there are other options.
  const candidates = introduced.length > 1 && opts.avoidId
    ? introduced.filter((p) => p.id !== opts.avoidId)
    : introduced;

  const weighted = candidates.map((p) => {
    const m = opts.mastery[p.id];
    const streak = m?.streak ?? 0;
    const sinceLastSeenMs = m?.lastSeenAt ? now - m.lastSeenAt : 60_000;
    // Lower streak → higher weight (needs practice). Older last-seen → higher weight (refresh).
    const streakWeight = 1 / (streak + 1);
    const recencyWeight = 1 + Math.log(1 + sinceLastSeenMs / 60_000);
    return { pair: p, weight: streakWeight * recencyWeight };
  });

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let r = rng() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return { pair: w.pair, isNew: false };
  }
  return { pair: weighted[weighted.length - 1].pair, isNew: false };
}
