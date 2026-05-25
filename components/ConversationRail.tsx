"use client";
import { useEffect, useRef } from "react";
import type { Turn } from "@/lib/conversation/state";

export function ConversationRail({ turns }: { turns: Turn[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest turn so it's visible within the fixed-height container.
  // Guarded for jsdom (test env) where scrollIntoView isn't implemented.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [turns.length]);

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
      <div ref={bottomRef} />
    </ul>
  );
}
