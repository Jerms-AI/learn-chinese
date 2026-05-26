"use client";
import { Eye, EyeOff } from "lucide-react";
import type { Phrase } from "@/lib/decks/schema";
import type { Score, Tier } from "@/lib/conversation/state";
import { TonedPinyin } from "./TonedPinyin";

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

export function PhraseCard({
  phrase,
  expectedResponse,
  lastScore,
  isNew = false,
  latestTier = null,
  hideTranslations = false,
  isFreeForm = false,
  userJustAsked,
  onToggleTranslations,
  onReplay,
}: {
  phrase: Phrase;
  expectedResponse?: Phrase;
  lastScore?: Score | null;
  /** True the very first time this phrase is shown to the user. */
  isNew?: boolean;
  /** Latest attempt tier — used to tint the "your line" section. */
  latestTier?: Tier | null;
  /** When true, hides pinyin + English on both prompt and response. Hanzi only. */
  hideTranslations?: boolean;
  /** Toggle handler for the eye icon. */
  onToggleTranslations?: () => void;
  /** When true, the "your line" section shows an "ask a question" prompt instead
   * of the scripted response — the loop is waiting for free-form input. */
  isFreeForm?: boolean;
  /** The user's most recent free-form question (transcribed). When set, shown
   * above "they said" so the user can see what Azure heard. */
  userJustAsked?: string;
  onReplay?: () => void;
}) {
  const showsAnswer = expectedResponse && expectedResponse.hanzi !== phrase.hanzi;

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

      {userJustAsked && (
        <div className="mb-6 pb-4 border-b border-dashed text-center">
          <div className="text-xs uppercase tracking-widest text-ink-soft mb-1">you asked</div>
          <div className="font-serif text-xl">{userJustAsked}</div>
        </div>
      )}

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

      {(showsAnswer || isFreeForm) && (
        <div
          className={`mt-8 pt-6 px-4 pb-4 -mx-4 border-t border-dashed text-center rounded-md transition-colors ${
            isFreeForm ? "bg-terracotta/5 ring-1 ring-terracotta/20" :
            lastScore && latestTier ? `${TIER_TINT_BG[latestTier]} ring-1 ${TIER_RING[latestTier]}` : ""
          }`}
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-xs uppercase tracking-widest text-terracotta">your line</span>
            {!isFreeForm && lastScore && (
              <span className={`text-xs font-medium ${accuracyColor(lastScore.accuracy)}`}>
                overall {lastScore.accuracy} · tones {lastScore.tonesOk ? "✓" : "✗"}
              </span>
            )}
          </div>
          {isFreeForm ? (
            <div className="py-2">
              <div className="font-serif text-3xl text-terracotta">问我一个问题</div>
              <div className="mt-2 text-sm text-ink-soft">
                Ask me anything in Mandarin — hold space and speak.
              </div>
            </div>
          ) : (
            <>
              {lastScore ? (
                <ScoredHanzi score={lastScore} fallbackHanzi={expectedResponse!.hanzi} />
              ) : (
                <div className="font-serif text-4xl leading-tight">{expectedResponse!.hanzi}</div>
              )}
              {!hideTranslations && (
                <>
                  <div className="mt-2 text-lg">
                    <TonedPinyin text={expectedResponse!.pinyin} />
                  </div>
                  <div className="mt-1 text-sm text-ink-soft">{expectedResponse!.english}</div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
