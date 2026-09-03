"use client";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

/**
 * Tutor practice surface: the target phrase to repeat, progress dots toward
 * the required successes, replay buttons (slow variant in deep mode), and the
 * coach's tip when escalated. The main MicButton stays the one and only mic —
 * this panel is display + controls, not capture.
 */
export function TutorPanel({
  target,
  deep,
  successes,
  required,
  tip,
  onReplay,
  onSkip,
  hidePinyin = false,
  hideEnglish = false,
}: {
  target: Phrase;
  /** Deep mode: slow replay button + tip visible. */
  deep: boolean;
  successes: number;
  required: number;
  tip: string | null;
  onReplay: (slow: boolean) => void;
  onSkip: () => void;
  /** Mirror the conversation card's display-layer toggles. */
  hidePinyin?: boolean;
  hideEnglish?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card p-8 shadow-md border-l-4 border-terracotta space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-terracotta font-medium">
          ◆ Tutor mode — try saying this
        </span>
        <button onClick={onSkip} className="text-xs text-ink-soft underline hover:text-ink">
          skip and move on
        </button>
      </div>

      <div className="text-center">
        <div className="font-serif text-6xl tracking-wide">{target.hanzi}</div>
        {!hidePinyin && (
          <div className="mt-3 text-xl">
            <TonedPinyin text={target.pinyin} />
          </div>
        )}
        {!hideEnglish && <div className="mt-1 text-ink-soft">{target.english}</div>}
      </div>

      <div className="flex items-center justify-center gap-3">
        <span
          className="inline-flex items-center gap-1.5"
          aria-label={`${successes} of ${required} successful repetitions`}
        >
          {Array.from({ length: required }, (_, i) => (
            <span
              key={i}
              className={`inline-block w-3 h-3 rounded-full ${
                i < successes ? "bg-emerald-600" : "bg-transparent border border-ink-soft/30"
              }`}
            />
          ))}
        </span>
        <span className="text-xs text-ink-soft">say it {required} times</span>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => onReplay(false)}
          className="text-sm rounded-full border px-4 py-1.5 hover:bg-parchment transition"
        >
          🔊 listen
        </button>
        {deep && (
          <button
            onClick={() => onReplay(true)}
            className="text-sm rounded-full border px-4 py-1.5 hover:bg-parchment transition"
          >
            🐢 slowly
          </button>
        )}
      </div>

      {deep && tip && (
        <p className="text-sm text-ink-soft leading-relaxed border-t pt-4">{tip}</p>
      )}
    </div>
  );
}
