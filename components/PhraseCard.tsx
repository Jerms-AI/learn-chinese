"use client";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

export function PhraseCard({ phrase, onReplay }: { phrase: Phrase; onReplay?: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-10 shadow-sm text-center">
      <div className="font-serif text-7xl leading-tight tracking-wide">{phrase.hanzi}</div>
      <div className="mt-4 text-2xl">
        <TonedPinyin text={phrase.pinyin} />
      </div>
      <div className="mt-2 text-muted">{phrase.english}</div>
      {onReplay && (
        <button
          aria-label="Replay phrase audio"
          onClick={onReplay}
          className="mt-6 inline-flex items-center justify-center rounded-full p-3 hover:bg-parchment transition"
        >
          🔊
        </button>
      )}
    </div>
  );
}
