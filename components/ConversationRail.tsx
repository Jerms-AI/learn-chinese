import type { Turn } from "@/lib/conversation/state";

export function ConversationRail({ turns }: { turns: Turn[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {turns.map((t, i) => (
        <li key={i} className="border-l-2 pl-3" style={{ borderColor: t.speaker === "ai" ? "var(--color-terracotta)" : "var(--color-ink-soft)" }}>
          <span className="font-medium">{t.speaker === "ai" ? "AI" : "You"}:</span> {t.text}
          {t.speaker === "user" && (
            <span className="ml-2 text-ink-soft">(accuracy {t.score.accuracy}, tones {t.score.tonesOk ? "✓" : "✗"})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
