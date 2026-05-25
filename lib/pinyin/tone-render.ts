export type ToneNumber = 1 | 2 | 3 | 4 | 5;

const TONE_MARKS: Record<ToneNumber, string> = {
  1: "̄",  // macron
  2: "́",  // acute
  3: "̌",  // caron
  4: "̀",  // grave
  5: "",
};

export function detectToneOfSyllable(syllable: string): ToneNumber {
  const normalized = syllable.normalize("NFD");
  for (const t of [1, 2, 3, 4] as ToneNumber[]) {
    if (normalized.includes(TONE_MARKS[t])) return t;
  }
  return 5;
}

export function splitPinyinSyllables(pinyin: string): string[] {
  return pinyin.split(/\s+/).filter((s) => s.length > 0);
}

export function renderTonedSyllables(pinyin: string): Array<{ text: string; tone: ToneNumber }> {
  return splitPinyinSyllables(pinyin).map((s) => ({ text: s, tone: detectToneOfSyllable(s) }));
}
