"use client";
import type { Phrase } from "@/lib/decks/schema";
import type { Score, Tier } from "@/lib/conversation/state";
import { TonedPinyin } from "./TonedPinyin";

const TIER_DOT_BG: Record<Tier, string> = {
  green: "bg-emerald-600",
  yellow: "bg-lime-500",
  orange: "bg-amber-500",
  red: "bg-red-600",
};

const TIER_TINT_BG: Record<Tier, string> = {
  green: "bg-emerald-50",
  yellow: "bg-lime-50",
  orange: "bg-amber-50",
  red: "bg-red-50",
};

const TIER_RING: Record<Tier, string> = {
  green: "ring-emerald-300",
  yellow: "ring-lime-300",
  orange: "ring-amber-300",
  red: "ring-red-300",
};

function accuracyColor(n: number): string {
  if (n >= 90) return "text-emerald-700";
  if (n >= 80) return "text-lime-700";
  if (n >= 70) return "text-amber-600";
  return "text-red-600";
}

function ScoredHanzi({ score, fallbackHanzi }: { score: Score; fallbackHanzi: string }) {
  if (score.words.length === 0) {
    return <span className="font-serif text-4xl">{fallbackHanzi}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-end justify-center gap-x-1">
      {score.words.map((w, i) => (
        <span key={i} className="inline-flex flex-col items-center mx-0.5">
          <span className={`text-[10px] font-medium leading-none ${accuracyColor(w.accuracy)}`}>
            {w.accuracy}
          </span>
          <span className="font-serif text-4xl leading-tight">{w.word}</span>
        </span>
      ))}
    </span>
  );
}

function MasteryDots({ tiers }: { tiers: Tier[] }) {
  const slots: (Tier | null)[] = [0, 1, 2].map((i) => tiers[i] ?? null);
  const allNonRed = slots.length === 3 && slots.every((t) => t && t !== "red");
  const latestIdx = tiers.length - 1; // most recent dot gets a soft ring
  return (
    <span className="inline-flex items-center gap-1.5" title={`mastery: ${tiers.join(" · ") || "no attempts yet"}`}>
      {slots.map((t, i) => (
        <span
          key={i}
          className={`inline-block w-3.5 h-3.5 rounded-full ${
            t ? TIER_DOT_BG[t] : "bg-transparent border border-ink-soft/30"
          } ${i === latestIdx && t ? "ring-2 ring-offset-1 ring-ink-soft/30" : ""}`}
        />
      ))}
      {allNonRed && <span className="ml-1 text-emerald-700 text-xs font-medium">✓ mastered</span>}
    </span>
  );
}

export function PhraseCard({
  phrase,
  expectedResponse,
  lastScore,
  isNew = false,
  lastTiers = [],
  onReplay,
}: {
  phrase: Phrase;
  expectedResponse?: Phrase;
  lastScore?: Score | null;
  /** True the very first time this phrase is shown to the user. */
  isNew?: boolean;
  /** Rolling window of the last 3 attempt tiers for this pair. */
  lastTiers?: Tier[];
  onReplay?: () => void;
}) {
  const showsAnswer = expectedResponse && expectedResponse.hanzi !== phrase.hanzi;
  const latestTier = lastTiers[lastTiers.length - 1] ?? null;

  return (
    <div className="rounded-2xl bg-card p-10 shadow-sm relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isNew && (
          <span className="text-[11px] uppercase tracking-widest font-medium text-terracotta bg-terracotta/10 px-2 py-1 rounded-full">
            ✨ new
          </span>
        )}
        {!isNew && <MasteryDots tiers={lastTiers} />}
      </div>

      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-ink-soft mb-3">they said</div>
        <div className="font-serif text-6xl leading-tight tracking-wide">{phrase.hanzi}</div>
        <div className="mt-3 text-xl">
          <TonedPinyin text={phrase.pinyin} />
        </div>
        <div className="mt-1 text-ink-soft">{phrase.english}</div>
        {onReplay && (
          <button
            aria-label="Replay phrase audio"
            onClick={onReplay}
            className="mt-4 inline-flex items-center justify-center rounded-full p-2 hover:bg-parchment transition"
          >
            🔊
          </button>
        )}
      </div>

      {showsAnswer && (
        <div
          className={`mt-8 pt-6 px-4 pb-4 -mx-4 border-t border-dashed text-center rounded-md transition-colors ${
            lastScore && latestTier ? `${TIER_TINT_BG[latestTier]} ring-1 ${TIER_RING[latestTier]}` : ""
          }`}
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-xs uppercase tracking-widest text-terracotta">your line</span>
            {lastScore && (
              <span className={`text-xs font-medium ${accuracyColor(lastScore.accuracy)}`}>
                overall {lastScore.accuracy} · tones {lastScore.tonesOk ? "✓" : "✗"}
              </span>
            )}
          </div>
          {lastScore ? (
            <ScoredHanzi score={lastScore} fallbackHanzi={expectedResponse.hanzi} />
          ) : (
            <div className="font-serif text-4xl leading-tight">{expectedResponse.hanzi}</div>
          )}
          <div className="mt-2 text-lg">
            <TonedPinyin text={expectedResponse.pinyin} />
          </div>
          <div className="mt-1 text-sm text-ink-soft">{expectedResponse.english}</div>
        </div>
      )}
    </div>
  );
}
