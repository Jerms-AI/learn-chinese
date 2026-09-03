/**
 * Tutor-mode dials. One place for everything tunable about the practice loop —
 * groundwork for the iceboxed behavior dashboard (these become its sliders).
 */

/** How long the learner has to start answering before tutor mode kicks in. */
export const TUTOR_TIMEOUT_MS = 15_000;

/** Successful repetitions required to exit the tutor loop. */
export const SUCCESSES_TO_EXIT = 2;

/** Consecutive failed attempts before escalating to deep tutor mode. */
export const FAILS_TO_DEEPEN = 2;

/** TTS prosody rate for deep-mode slow playback (1.0 = normal). */
export const DEEP_TTS_RATE = 0.6;
