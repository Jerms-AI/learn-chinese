"use client";
import { Eye, EyeOff } from "lucide-react";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

export function PhraseCard({
  phrase,
  isNew = false,
  hideTranslations = false,
  userJustAsked,
  onToggleTranslations,
  onReplay,
}: {
  phrase: Phrase;
  /** True the very first time this phrase is shown to the user. */
  isNew?: boolean;
  /** When true, hides pinyin + English so only hanzi shows. */
  hideTranslations?: boolean;
  /** Toggle handler for the eye icon. */
  onToggleTranslations?: () => void;
  /** The user's most recent transcribed input. When set, fills the "your line"
   * slot. When null, the "your line" slot shows a prompt to speak. */
  userJustAsked?: Phrase | null;
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
        <div className="text-xs uppercase tracking-widest text-ink-soft mb-3">they said</div>
        <div className="font-serif text-6xl leading-tight tracking-wide">{phrase.hanzi}</div>
        {!hideTranslations && (
          <>
            <div className="mt-3 text-xl">
              <TonedPinyin text={phrase.pinyin} />
            </div>
            <div className="mt-1 text-ink-soft">{phrase.english}</div>
          </>
        )}
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

      <div
        className={`mt-8 pt-6 px-4 pb-4 -mx-4 border-t border-dashed text-center rounded-md transition-colors ${
          userJustAsked ? "bg-ink-soft/5 ring-1 ring-ink-soft/15" : "bg-terracotta/5 ring-1 ring-terracotta/20"
        }`}
      >
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-xs uppercase tracking-widest text-terracotta">your line</span>
          {userJustAsked && (
            <span className="text-xs italic text-ink-soft">(free-form)</span>
          )}
        </div>
        {userJustAsked ? (
          <>
            <div className="font-serif text-4xl leading-tight">{userJustAsked.hanzi}</div>
            {!hideTranslations && (
              <>
                <div className="mt-2 text-lg">
                  <TonedPinyin text={userJustAsked.pinyin} />
                </div>
                <div className="mt-1 text-sm text-ink-soft">{userJustAsked.english}</div>
              </>
            )}
          </>
        ) : (
          <div className="py-2 text-sm text-ink-soft">
            Your turn — hold space and respond in Mandarin.
          </div>
        )}
      </div>
    </div>
  );
}
