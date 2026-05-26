import type { Deck, Pair } from "./schema";
import { isMastered, type Mastery, type Tier } from "@/lib/conversation/state";

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
  /** Avoid picking this id (e.g. the one just shown). */
  avoidId?: string;
  /** Probability of biasing toward the newest-unmastered pair on each turn. */
  newPhraseFocusProbability?: number;
  now?: number;
  rng?: () => number;
};

export type ProgressivePick = {
  pair: Pair;
  isNew: boolean;
};

const TIER_VALUE: Record<Tier, number> = { red: 0, orange: 1, yellow: 2, green: 3 };

/** Tags like "lesson-1" are organizational, not semantic. Only the semantic tags
 * (english, greetings, identity, food, etc.) signal that two phrases cover the
 * same conversational topic — used to skip near-duplicate next-pair candidates. */
function semanticTags(p: Pair): string[] {
  return (p.tags ?? []).filter((t) => !t.startsWith("lesson-"));
}

function sharesSemanticTag(a: Pair, b: Pair): boolean {
  const aTags = new Set(semanticTags(a));
  return semanticTags(b).some((t) => aTags.has(t));
}

function masteryQuality(m: Mastery | undefined): number {
  if (!m || (m.lastTiers ?? []).length === 0) return 0;
  const avg = m.lastTiers.reduce((s, t) => s + TIER_VALUE[t], 0) / m.lastTiers.length;
  return avg / 3; // 0–1
}

/**
 * Comprehensible-input style selector:
 *  - If nothing has been introduced yet, introduce the first pair in the deck.
 *  - If every currently-introduced pair is mastered (3 non-red in a row), introduce the next.
 *  - In the first few attempts on a newly-introduced pair, bias selection toward it
 *    (focus on the new content), then mix back into the regular weighted pool.
 *  - Otherwise pick from the introduced pool weighted toward weakest (low tier quality)
 *    and oldest (long since last seen).
 *
 * Pair ordering is the deck author's order (decks are concatenated in array order).
 */
export function pickPhraseProgressive(
  decks: Deck[],
  opts: ProgressiveOptions
): ProgressivePick {
  const allPairs = decks.flatMap((d) => d.pairs);
  if (allPairs.length === 0) throw new Error("No pairs available");

  const now = opts.now ?? Date.now();
  const rng = opts.rng ?? Math.random;
  const focusProb = opts.newPhraseFocusProbability ?? 0.9;
  const introducedSet = new Set(opts.introducedIds);
  const introduced = allPairs.filter((p) => introducedSet.has(p.id));

  // Bootstrap: nothing introduced yet → take the first pair.
  if (introduced.length === 0) {
    return { pair: allPairs[0], isNew: true };
  }

  // Introduce a new phrase as soon as the MOST-RECENTLY-INTRODUCED pair is
  // mastered. Older introduced phrases keep cycling in for review but don't
  // block new content from coming in.
  const newestId = opts.introducedIds[opts.introducedIds.length - 1];
  const newestMastery = opts.mastery[newestId];
  const newestPair = introduced.find((p) => p.id === newestId);
  if (isMastered(newestMastery)) {
    // Prefer un-introduced pairs that DON'T share a semantic tag with the just-
    // mastered pair — keeps the dialogue moving forward instead of re-asking the
    // same conversational topic with a different expected answer.
    const dissimilar = newestPair
      ? allPairs.find((p) => !introducedSet.has(p.id) && !sharesSemanticTag(p, newestPair))
      : null;
    if (dissimilar) return { pair: dissimilar, isNew: true };
    // Fallback: any un-introduced pair (e.g. if every remaining candidate shares
    // a tag, we still need to progress).
    const next = allPairs.find((p) => !introducedSet.has(p.id));
    if (next) return { pair: next, isNew: true };
    // Nothing new to introduce; fall through to weighted pick over introduced.
  }

  // Focus-on-new bias: the most-recently-introduced pair is the user's active
  // study target. Keep it dominant until it's mastered, regardless of attempt
  // count — and don't suppress it via avoidId. The user explicitly wants old
  // phrases to come back less often.
  if (newestPair && !isMastered(newestMastery) && rng() < focusProb) {
    return { pair: newestPair, isNew: false };
  }

  // Weighted pick from the introduced pool — used either for review cycles
  // (when the focus bias didn't fire) or after the newest pair is mastered
  // and there's nothing new left to introduce.
  const candidates = introduced.length > 1 && opts.avoidId
    ? introduced.filter((p) => p.id !== opts.avoidId)
    : introduced;

  const weighted = candidates.map((p) => {
    const m = opts.mastery[p.id];
    const quality = masteryQuality(m);                                   // 0–1
    const sinceLastSeenMs = m?.lastSeenAt ? now - m.lastSeenAt : 60_000;
    const weaknessWeight = 1 - quality + 0.15;                           // weak phrases come back more
    const recencyWeight = 1 + Math.log(1 + sinceLastSeenMs / 60_000);
    // Mastered phrases come back rarely — only enough to refresh long-stale
    // memory. Tuned aggressively low per user feedback.
    const masteryDamper = isMastered(m) ? 0.1 : 1.0;
    return { pair: p, weight: weaknessWeight * recencyWeight * masteryDamper };
  });

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let r = rng() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return { pair: w.pair, isNew: false };
  }
  return { pair: weighted[weighted.length - 1].pair, isNew: false };
}
