import { renderTonedSyllables } from "@/lib/pinyin/tone-render";

export function TonedPinyin({ text, className = "" }: { text: string; className?: string }) {
  const syllables = renderTonedSyllables(text);
  return (
    <span className={className}>
      {syllables.map((s, i) => (
        <span key={i} data-tone={s.tone} className={`tone-${s.tone}`}>
          {s.text}
          {i < syllables.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
