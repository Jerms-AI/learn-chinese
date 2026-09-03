"use client";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

/** Chip toggle for one display layer (pinyin / English). Dimmed +
 * struck-through when that layer is hidden. */
function LayerToggle({
  label,
  hidden,
  onToggle,
  what,
}: {
  label: string;
  hidden: boolean;
  onToggle: () => void;
  what: string;
}) {
  return (
    <button
      aria-label={hidden ? `Show ${what}` : `Hide ${what}`}
      title={hidden ? `Show ${what}` : `Hide ${what}`}
      onClick={onToggle}
      className={`text-[11px] px-2 py-1 rounded-full border transition ${
        hidden
          ? "text-ink-soft/40 border-ink-soft/15 line-through"
          : "text-ink-soft border-ink-soft/30 hover:bg-parchment hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

export function PhraseCard({
  phrase,
  isNew = false,
  hidePinyin = false,
  hideEnglish = false,
  onTogglePinyin,
  onToggleEnglish,
  onReplay,
}: {
  phrase: Phrase;
  /** True the very first time this phrase is shown to the user. */
  isNew?: boolean;
  /** Independent display layers — hide pinyin / English separately. */
  hidePinyin?: boolean;
  hideEnglish?: boolean;
  onTogglePinyin?: () => void;
  onToggleEnglish?: () => void;
  onReplay?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card p-10 shadow-sm relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isNew && (
          <span className="text-[11px] uppercase tracking-widest font-medium text-terracotta bg-terracotta/10 px-2 py-1 rounded-full">
            ✨ new
          </span>
        )}
        {onTogglePinyin && (
          <LayerToggle label="pīn" hidden={hidePinyin} onToggle={onTogglePinyin} what="pinyin" />
        )}
        {onToggleEnglish && (
          <LayerToggle label="EN" hidden={hideEnglish} onToggle={onToggleEnglish} what="English" />
        )}
      </div>

      <div className="text-center">
        <div className="font-serif text-6xl leading-tight tracking-wide">{phrase.hanzi}</div>
        {!hidePinyin && (
          <div className="mt-3 text-xl">
            <TonedPinyin text={phrase.pinyin} />
          </div>
        )}
        {!hideEnglish && <div className="mt-1 text-ink-soft">{phrase.english}</div>}
        {onReplay && (
          <button
            aria-label="Replay phrase audio"
            onClick={onReplay}
            className="mt-5 inline-flex items-center justify-center rounded-full p-2 hover:bg-parchment transition"
          >
            🔊
          </button>
        )}
      </div>
    </div>
  );
}
