import "server-only";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/providers/anthropic";

export type AskAnswer = {
  hanzi: string;
  pinyin: string;
  english: string;   // the English meaning the learner asked about
  note?: string;     // optional one-line usage tip
};

const SYSTEM = `You are a Mandarin tutor. The learner speaks an English question asking how to say something in Mandarin — e.g. "how do I say water?", "what's the word for thank you", or just "water". Identify the thing they want to say and return the most natural, beginner-appropriate Mandarin for it.

Return ONLY this JSON (no markdown, no commentary):
{
  "hanzi": "…",         // simplified characters
  "pinyin": "…",        // tone-marked pinyin, e.g. "shuǐ"
  "english": "…",       // the English meaning (the thing they asked for)
  "note": "…"           // OPTIONAL: one short, useful tip (measure word, tone caution, common usage). Omit if nothing useful to add.
}

Keep it to the single word or short phrase they asked for. If the question is ambiguous, pick the most common everyday meaning.`;

/** Parse Claude's JSON reply for an ask-in-English lookup. Exported for tests.
 * Throws on non-JSON; callers substitute a fallback. */
export function parseAskAnswer(raw: string): AskAnswer {
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
  const p = JSON.parse(cleaned) as Partial<AskAnswer>;
  if (!p.hanzi || !p.pinyin || !p.english) throw new Error("incomplete ask answer");
  return {
    hanzi: p.hanzi,
    pinyin: p.pinyin,
    english: p.english,
    note: typeof p.note === "string" && p.note.trim() ? p.note.trim() : undefined,
  };
}

export async function answerHowDoISay(question: string): Promise<AskAnswer> {
  const client = getAnthropic();
  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    // No thinking — a translation lookup is simple and latency-sensitive; adaptive
    // thinking (Sonnet 5's default when omitted) would only add a pause.
    thinking: { type: "disabled" },
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify({ question }) }],
  });
  const textBlock = resp.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  return parseAskAnswer(textBlock?.text ?? "");
}
