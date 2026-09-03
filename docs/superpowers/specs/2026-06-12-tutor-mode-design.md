# Tutor Mode — Design Spec

**Date:** 2026-06-12
**Status:** Draft — pending user review
**Branch (planned):** `feat/tutor-mode` off `main`

## Overview

When the learner doesn't answer the AI's question within a time window, the app
shifts from conversation into a guided practice sub-loop: the AI suggests an
appropriate response, the learner repeats it until they can say it, with
escalating help (slower audio, human-style tips) if they struggle. Then the
conversation resumes where it left off.

This formalizes "what mode is the AI in" as explicit state — groundwork for the
iceboxed observability dashboard.

## The flow

```
conversation (awaiting-user-question)
  │ AI finishes speaking → 15s bar starts filling
  │
  ├─ user holds space before bar fills → bar cancels, normal turn
  │
  └─ bar fills → TUTOR TAKEOVER
       1. Mic greys out with pause icon (momentarily, while AI takes over)
       2. AI fetches a suggested answer to its pending question
          and says: 试试说：「一点」 (plays TTS, shows TutorPanel)
       3. Mic re-enables → tutor-listening
       4. User repeats. Each released recording = one attempt:
          - guard-rejected audio (too short) → hint, does NOT count
          - judged attempt → success or fail
       5. 2 successes (cumulative) → the practiced phrase is submitted as
          the user's answer to the pending question (they just said it —
          no third repetition demanded). AI responds + continues the
          conversation; fresh 15s bar on its next question.
       6. 2 consecutive fails → tutor-deep:
          - same phrase via TTS at slow rate (0.6)
          - a human-style tip from Claude: word-by-word breakdown,
            English sound-alike, or cultural note
          - keep practicing; same 2-success exit criterion
       7. "skip" link always visible in tutor mode → bail back to
          conversation at any time (no trap; mirrors the "no cap on
          tutor depth, user controls exit" decision)
```

The 15s bar only runs in conversation mode while it's the user's turn and the
AI's audio has finished. It pauses/hides entirely during tutor mode and while
the AI is speaking or busy.

## Success judge (pluggable)

```ts
// lib/tutor/judge.ts
export type JudgeInput = { transcript: string; target: string };
export type JudgeResult = { pass: boolean; reason?: string };
export type Judge = (input: JudgeInput) => JudgeResult;

export const textMatchJudge: Judge = ...  // v1
```

**v1 = normalized hanzi text-match:** strip punctuation/whitespace, compare the
STT transcript against the target phrase (containment counts — saying extra
polite words around the target is success). Honest about what it measures: "did
you say the right words clearly enough for a speech recognizer." Garbled tones
usually produce wrong characters, so this is a real bar.

**Explicitly out of scope for v1:** Azure pronunciation assessment. It was
removed for accuracy/noise/latency reasons (see commit 68097b4 and the scoring
fight before it). If retested later, it slots in as a second `Judge`
implementation behind this interface — a one-file experiment. The old
`azure-pronunciation.ts` is recoverable from git history.

## State machine (lib/conversation/state.ts)

New modes: `tutor-prompting` (AI fetching/speaking suggestion, mic paused),
`tutor-listening` (practicing), `tutor-deep` (slow + tips).

New events: `TUTOR_TIMEOUT`, `TUTOR_SUGGESTED` (carries target phrase),
`TUTOR_ATTEMPT` (carries pass/fail), `TUTOR_DEEPEN`, `TUTOR_EXIT`
(success or skip — carries which).

Tutor sub-state: `{ target: Phrase; successes: number; consecutiveFails: number }`.
All transitions pure-reducer, unit-tested. Timeout/attempt thresholds live in
one config object (`lib/tutor/config.ts`: `TUTOR_TIMEOUT_MS = 15_000`,
`SUCCESSES_TO_EXIT = 2`, `FAILS_TO_DEEPEN = 2`) — the future dashboard "dials".

## Orchestrator additions (lib/conversation/)

Two new, separate Claude calls — isolated from the conversation prompt so each
can be tuned independently (compartmentalization rule):

1. **`suggestResponse(pendingQuestion, chapterPool)`** → the phrase the tutor
   asks the learner to repeat: `{ hanzi, pinyin, english }`. Prefers chapter
   vocab; short (a phrase, not a paragraph).
2. **`tutorTip(target, attemptTranscripts)`** → one human-style tip, varied:
   word-by-word breakdown, an English sound-alike for a hard syllable, or a
   cultural usage note ("in China people usually answer like…"). Sees what STT
   heard on the failed attempts so the tip can target the actual miss.

Both go through `/api/turn` with a `metaIntent` (`"tutor-suggest"`,
`"tutor-tip"`) rather than new routes — the route already has that field.

## Audio

- Slow playback: `synthesizeMandarin(text, { rate: 0.6 })` — the SSML rate
  support already exists in `azure-tts.ts`, currently unused.
- Normal-speed replay button stays available in tutor mode.

## UI

- **TimerBar** (new component): thin horizontal bar under the conversation
  card, amber design language (parchment track, terracotta fill), fills over
  15s. Hidden when not applicable.
- **MicButton**: disabled state — greyed with a pause glyph — driven by mode.
- **TutorPanel**: revive the existing POC component as the tutor surface:
  target phrase (hanzi large / pinyin / english), attempt dots (○○ → ●○ → ●●),
  tip text in deep mode, skip link.
- Conversation card stays visible (the question being answered remains on
  screen, per the old `keep PhraseCard visible during tutor mode` decision).

## Testing

- Reducer: every tutor transition (timeout, attempt pass/fail, deepen, exit,
  skip) — pure unit tests.
- Judge: normalization, containment, rejection cases.
- TimerBar: renders proportional fill; fires timeout callback once.
- Live probes: `/api/turn` with tutor metaIntents returns sane suggestion/tip.
- E2E (fake mic): bar fills → tutor takeover → skip → conversation resumes.

## Out of scope (v1)

- Azure pronunciation assessment (see Success judge).
- Tone visualization beyond text tips (iceboxed).
- Configurable timer in UI (constant in config; dashboard later).
- Tutor analytics/history (dashboard, iceboxed).
