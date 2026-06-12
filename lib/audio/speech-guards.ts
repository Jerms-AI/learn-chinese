/**
 * Client-side sanity guards for push-to-talk audio, applied before/after
 * transcription. STT models hallucinate plausible text ("bravo.", "thank you")
 * when fed near-empty audio, and guess English when they can't make out the
 * Mandarin — both must be caught here so garbage never enters the conversation.
 */

/** Minimum blob size worth transcribing. A webm container header alone is
 * ~500 bytes (observed: 534-byte blobs from clipped recordings); ~1s of real
 * opus speech is 4-6 KB. Anything under this is effectively silence. */
export const MIN_SPEECH_BYTES = 2000;

/** True if the transcript contains at least one Han character (simplified or
 * traditional). A Mandarin transcription with zero hanzi means the model
 * guessed — hallucinated filler or an English rendering — not a real result. */
export function containsHanzi(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}
