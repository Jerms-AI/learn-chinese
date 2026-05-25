import type { Score } from "@/lib/conversation/state";

export function mockScore({ referenceText }: { referenceText: string }): Score {
  const chars = Array.from(referenceText);
  return {
    accuracy: 85,
    tonesOk: true,
    words: chars.map((c) => ({ word: c, accuracy: 80 + Math.floor(Math.random() * 15), tone: 2 })),
  };
}
