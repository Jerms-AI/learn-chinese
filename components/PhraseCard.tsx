"use client";
import type { Phrase } from "@/lib/decks/schema";
import type { Score } from "@/lib/conversation/state";
import { TonedPinyin } from "./TonedPinyin";

function accuracyColor(n: number): string {
  if (n >= 80) return "text-green-700";
  if (n >= 60) return "text-amber-600";
  return "text-red-600";
}

function ScoredHanzi({ score, fallbackHanzi }: { score: Score; fallbackHanzi: string }) {
  // Azure for Mandarin segments roughly per-character. Iterate score.words to
  // preserve Azure's actual segmentation rather than a naive char-by-char split.
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

export function PhraseCard({
  phrase,
  expectedResponse,
  lastScore,
  onReplay,
}: {
  phrase: Phrase;
  expectedResponse?: Phrase;
  lastScore?: Score | null;
  onReplay?: () => void;
}) {
  const showsAnswer = expectedResponse && expectedResponse.hanzi !== phrase.hanzi;

  return (
    <div className="rounded-2xl bg-card p-10 shadow-sm">
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
        <div className="mt-8 pt-6 border-t border-dashed text-center">
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
