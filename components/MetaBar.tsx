"use client";

const INTENTS = [
  { label: "Slow down", intent: "slow_down" },
  { label: "Repeat", intent: "repeat" },
  { label: "Explain", intent: "explain" },
  { label: "Etymology", intent: "etymology" },
  { label: "Tones lesson", intent: "tones_lesson" },
] as const;

export function MetaBar({ onMeta }: { onMeta: (intent: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center text-sm">
      {INTENTS.map((i) => (
        <button
          key={i.intent}
          onClick={() => onMeta(i.intent)}
          className="rounded-full border px-3 py-1 hover:bg-card transition"
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
