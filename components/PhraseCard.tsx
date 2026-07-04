"use client";
import { Eye, EyeOff } from "lucide-react";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

// Categorical palette cycled per word so a word's hanzi, pinyin, and English all
// share one color across the three interlinear rows. Tuned for readability on the
// warm parchment/card background.
const WORD_COLORS = [
  "#b45309", // amber-700
  "#0f766e", // teal-700
  "#4338ca", // indigo-700
  "#a21caf", // fuchsia-800
  "#4d7c0f", // lime-700
  "#b91c1c", // red-700
  "#7c3aed", // violet-700
  "#0369a1", // sky-700
];

export function PhraseCard({
  phrase,
  segments,
  isNew = false,
  hideTranslations = false,
  onToggleTranslations,
  onReplay,
  onSpeakWord,
}: {
  phrase: Phrase;
  /** Aligned word units for the color-coded, click-to-hear display. When absent,
   * the phrase renders plainly (single hanzi line + pinyin + english). */
  segments?: Phrase[];
  /** True the very first time this phrase is shown to the user. */
  isNew?: boolean;
  /** When true, hides pinyin + English so only hanzi shows. */
  hideTranslations?: boolean;
  /** Toggle handler for the eye icon. */
  onToggleTranslations?: () => void;
  onReplay?: () => void;
  /** Play a single word's audio (its hanzi), used when a word is clicked. */
  onSpeakWord?: (hanzi: string) => void;
}) {
  const useSegments = !!segments && segments.length > 0;

  return (
    <div className="rounded-2xl bg-card p-10 shadow-sm relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isNew && (
          <span className="text-[11px] uppercase tracking-widest font-medium text-terracotta bg-terracotta/10 px-2 py-1 rounded-full">
            ✨ new
          </span>
        )}
        {onToggleTranslations && (
          <button
            aria-label={hideTranslations ? "Show pinyin and English" : "Hide pinyin and English"}
            title={hideTranslations ? "Show pinyin & English" : "Hide pinyin & English (hanzi only)"}
            onClick={onToggleTranslations}
            className="inline-flex items-center justify-center rounded-full p-1.5 text-ink-soft hover:bg-parchment hover:text-ink transition"
          >
            {hideTranslations ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="text-center">
        {useSegments ? (
          <div className="flex flex-wrap items-start justify-center gap-x-4 gap-y-3">
            {segments!.map((seg, i) => {
              const color = WORD_COLORS[i % WORD_COLORS.length];
              return (
                <button
                  key={i}
                  onClick={() => onSpeakWord?.(seg.hanzi)}
                  title={`Hear ${seg.hanzi}`}
                  className="group flex flex-col items-center leading-tight rounded-lg px-1 hover:bg-parchment transition cursor-pointer"
                >
                  <span
                    className="font-serif text-6xl tracking-wide group-hover:underline decoration-2 underline-offset-8"
                    style={{ color }}
                  >
                    {seg.hanzi}
                  </span>
                  {!hideTranslations && (
                    <>
                      <span className="mt-2 text-lg" style={{ color }}>{seg.pinyin}</span>
                      <span className="mt-0.5 text-sm" style={{ color }}>{seg.english}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Natural full-sentence translation (plain black) — distinct from the
            per-word literal glosses in the colored columns above. */}
        {useSegments && !hideTranslations && phrase.english && (
          <div className="mt-6 text-lg text-ink">{phrase.english}</div>
        )}

        {!useSegments && (
          <>
            <div className="font-serif text-6xl leading-tight tracking-wide">{phrase.hanzi}</div>
            {!hideTranslations && (
              <>
                <div className="mt-3 text-xl">
                  <TonedPinyin text={phrase.pinyin} />
                </div>
                <div className="mt-1 text-ink-soft">{phrase.english}</div>
              </>
            )}
          </>
        )}

        {onReplay && (
          <button
            aria-label="Replay phrase audio"
            title="Hear the whole phrase"
            onClick={onReplay}
            className="mt-6 inline-flex items-center justify-center rounded-full p-2 hover:bg-parchment transition"
          >
            🔊
          </button>
        )}
      </div>
    </div>
  );
}
