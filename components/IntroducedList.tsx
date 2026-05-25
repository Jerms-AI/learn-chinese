"use client";
import type { LibraryEntry, Mastery, Tier } from "@/lib/conversation/state";

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
}: {
  introducedIds: string[];
  phraseLibrary: Record<string, LibraryEntry>;
  mastery: Record<string, Mastery>;
  currentPairId?: string;
}) {
  return (
    <aside className="rounded-2xl bg-card p-6 shadow-sm h-fit sticky top-6">
      <div className="text-xs uppercase tracking-widest text-ink-soft mb-4">
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
        <ul className="space-y-3">
          {introducedIds.map((id) => {
            const entry = phraseLibrary[id];
            if (!entry) return null;
            // Show what the LEARNER says back. For Q/A pairs that's `response`; for
            // statement-only pairs the response is undefined so fall back to prompt
            // (which IS the statement the user repeats).
            const shown = entry.response ?? entry.prompt;
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
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-xl leading-tight truncate">
                    {shown.hanzi}
                  </div>
                  <div className="text-xs text-ink-soft truncate">
                    {shown.english}
                  </div>
                </div>
                {isMastered && (
                  <span className="flex-shrink-0 text-emerald-700 text-xs pt-1.5">✓</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
