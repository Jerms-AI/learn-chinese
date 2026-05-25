"use client";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

export function PhraseCard({
  phrase,
  expectedResponse,
  onReplay,
}: {
  phrase: Phrase;
  expectedResponse?: Phrase;
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
          <div className="text-xs uppercase tracking-widest text-terracotta mb-3">your line</div>
          <div className="font-serif text-4xl leading-tight">{expectedResponse.hanzi}</div>
          <div className="mt-2 text-lg">
            <TonedPinyin text={expectedResponse.pinyin} />
          </div>
          <div className="mt-1 text-sm text-ink-soft">{expectedResponse.english}</div>
        </div>
      )}
    </div>
  );
}
