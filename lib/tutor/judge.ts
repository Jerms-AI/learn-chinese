/**
 * Pluggable success judge for tutor-mode repetitions.
 *
 * v1 is a normalized hanzi text-match against the STT transcript: "did you say
 * the right words clearly enough for a speech recognizer to get them." Garbled
 * tones usually produce wrong characters, so this is a real bar — but it does
 * not grade tone quality. A pronunciation-assessment judge (e.g. Azure, which
 * was removed for accuracy/noise reasons — see commit 68097b4) can slot in
 * behind the same interface later as a one-file experiment.
 */

export type JudgeInput = { transcript: string; target: string };
export type JudgeResult = { pass: boolean; reason?: string };
export type Judge = (input: JudgeInput) => JudgeResult;

/** Lowercase, strip everything except Han characters. Punctuation, spacing,
 * and latin filler don't affect whether the right words were said. */
export function normalizeHanzi(text: string): string {
  return (text.match(/\p{Script=Han}/gu) ?? []).join("");
}

export const textMatchJudge: Judge = ({ transcript, target }) => {
  const want = normalizeHanzi(target);
  const heard = normalizeHanzi(transcript);
  if (!want) return { pass: false, reason: "no target phrase" };
  if (!heard) return { pass: false, reason: "no Mandarin heard" };
  // Containment: saying polite extras around the target still counts.
  if (heard.includes(want)) return { pass: true };
  return { pass: false, reason: `heard "${heard}", wanted "${want}"` };
};
