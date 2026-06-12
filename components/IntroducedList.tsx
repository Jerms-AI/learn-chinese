"use client";
import { pinyin as toPinyin } from "pinyin-pro";
import type { LibraryEntry, Mastery, Tier } from "@/lib/conversation/state";
import { TonedPinyin } from "@/components/TonedPinyin";

const TIER_DOT_BG: Record<Tier, string> = {
  green: "bg-emerald-600",
  yellow: "bg-lime-500",
  orange: "bg-amber-500",
  red: "bg-red-600",
};

function MasteryDots({ tiers }: { tiers: Tier[] }) {
  const slots: (Tier | null)[] = [0, 1, 2].map((i) => tiers[i] ?? null);
  return (
    <span className="inline-flex items-center gap-1" title={`mastery: ${tiers.join(" · ") || "no attempts yet"}`}>
      {slots.map((t, i) => (
        <span
          key={i}
          className={`inline-block w-3 h-3 rounded-full ${
            t ? TIER_DOT_BG[t] : "bg-transparent border border-ink-soft/30"
          }`}
        />
      ))}
    </span>
  );
}

export function IntroducedList({
  introducedIds,
  phraseLibrary,
  mastery,
  currentPairId,
  hideTranslations = false,
}: {
  introducedIds: string[];
  phraseLibrary: Record<string, LibraryEntry>;
  mastery: Record<string, Mastery>;
  currentPairId?: string;
  hideTranslations?: boolean;
}) {
  return (
    // The card stretches with the grid row, so its bottom edge always meets
    // the bottom of the conversation cards beside it. The list is absolutely
    // positioned inside a flex-1 wrapper so it contributes zero intrinsic
    // height — a long library scrolls inside the card, never grows the page.
    <aside className="rounded-2xl bg-card p-6 shadow-sm min-h-[20rem] flex flex-col">
      <div className="text-xs uppercase tracking-widest text-ink-soft mb-4 flex-shrink-0">
        Phrase library
        <span className="ml-2 text-ink-soft/70 normal-case tracking-normal">
          ({introducedIds.length})
        </span>
      </div>

      {introducedIds.length === 0 ? (
        <p className="text-sm text-ink-soft italic">
          Hit Start — phrases appear here as they&apos;re introduced.
        </p>
      ) : (
        <div className="relative flex-1">
        <ul className="absolute inset-0 space-y-3 overflow-y-auto -mr-3 pr-3">
          {/* State keeps introduction order; display newest-first so the
              phrase just taught is always at the top, no scrolling. */}
          {[...introducedIds].reverse().map((id) => {
            const entry = phraseLibrary[id];
            if (!entry) return null;
            // Q/A pairs have both sides — show both because the user practices each
            // direction (orchestrator can flip). Statement-only pairs have only prompt.
            const hasBothSides = !!entry.response && entry.response.hanzi !== entry.prompt.hanzi;
            const tiers = mastery[id]?.lastTiers ?? [];
            const isMastered = tiers.length === 3 && tiers.every((t) => t !== "red");
            const isCurrent = id === currentPairId;
            return (
              <li
                key={id}
                className={`flex items-start gap-3 rounded-md p-2 -mx-2 transition-colors ${
                  isCurrent ? "bg-terracotta/5 ring-1 ring-terracotta/20" : ""
                }`}
              >
                <span className="flex-shrink-0 pt-1.5">
                  <MasteryDots tiers={tiers} />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <div className="font-serif text-lg leading-snug break-words">
                      {entry.prompt.hanzi}
                    </div>
                    {!hideTranslations && (
                      <>
                        <div className="text-xs text-ink-soft/90 mt-0.5 break-words">
                          <TonedPinyin text={entry.prompt.pinyin} />
                        </div>
                        <div className="text-xs text-ink-soft/80 break-words">
                          {entry.prompt.english}
                        </div>
                      </>
                    )}
                  </div>
                  {entry.userResponse && (
                    <div className="pl-3 border-l-2 border-terracotta/30">
                      <div className="text-[10px] uppercase tracking-widest text-terracotta/80 mb-0.5">you said</div>
                      <div className="font-serif text-base leading-snug break-words">
                        {entry.userResponse.hanzi}
                      </div>
                      {!hideTranslations && (
                        <>
                          <div className="text-xs text-ink-soft/90 mt-0.5 break-words">
                            <TonedPinyin text={toPinyin(entry.userResponse.hanzi, { toneType: "symbol", type: "string" })} />
                          </div>
                          {entry.userResponse.english && (
                            <div className="text-xs text-ink-soft/80 break-words">
                              {entry.userResponse.english}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {hasBothSides && (
                    <div className="pl-3 border-l-2 border-ink-soft/10">
                      <div className="font-serif text-base leading-snug break-words">
                        {entry.response!.hanzi}
                      </div>
                      {!hideTranslations && (
                        <>
                          <div className="text-xs text-ink-soft/90 mt-0.5 break-words">
                            <TonedPinyin text={entry.response!.pinyin} />
                          </div>
                          <div className="text-xs text-ink-soft/80 break-words">
                            {entry.response!.english}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {isMastered && (
                  <span className="flex-shrink-0 text-emerald-700 text-xs pt-1.5">✓</span>
                )}
              </li>
            );
          })}
        </ul>
        </div>
      )}
    </aside>
  );
}
