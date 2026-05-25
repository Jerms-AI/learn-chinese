# Learn Chinese — Design Spec

**Date:** 2026-05-25
**Status:** Draft — awaiting user review before plan
**Author:** Jeremy (with Claude)

---

## Purpose

A personal, AI-driven Mandarin tutor focused on **conversational question-and-answer practice**. The user speaks into a microphone; the app reads phrases back, checks pronunciation and grammar, and either continues the conversation or drops into a tutor sub-loop to correct. Practice should feel like talking to a patient native speaker who happens to know exactly which syllable went sideways.

This is a solo-use app for the user; it is not multi-tenant and does not need accounts. Hosting on Vercel later (for mobile access) is a possible extension, not a launch requirement.

---

## Core Experience (the loop)

There is **one** mode, not two. The conversation is a continuous back-and-forth where either side can be the asker:

1. **AI asks** a question in Mandarin (drawn from the loaded deck, or improvised by Claude when the deck runs thin or the topic drifts).
2. **User answers** by speaking into the mic.
3. App captures audio → Azure scores **pronunciation** (accuracy, fluency, completeness, per-word, per-phoneme, **tone**) and produces a transcript.
4. **Claude evaluates** transcript + score + conversation history. Branches:
   - **Pass** (pronunciation above threshold AND grammar valid): AI gives a short natural confirmation ("对，很好" or just a smile-equivalent), then **waits for the user to ask the next question**. Turn flips.
   - **Fail**: Drop into **tutor sub-loop** — Claude explains what went wrong, drills the specific word/tone/phoneme, has the user retry. Once retry passes, return to wherever we were.
5. **User asks** AI a question (also captured, scored, evaluated same way).
6. AI answers in Mandarin (TTS + on-screen hanzi/pinyin/English), then poses the next question. Back to step 1.

The deck is the conversation's gravitational center but not its rails — Claude is allowed to follow tangents and return.

### Meta-asks (interrupts that always work)

At any point during the loop, the user can say things like:
- "Slow down" / "慢一点"
- "What's the etymology of 吃?"
- "Teach me the four tones before we keep going"
- "Repeat that"
- "What does that mean?"

Claude detects these as meta-requests (not deck-answer attempts), honors them, then offers to resume the conversation.

---

## Architecture

**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui. Local-first: no Supabase, no auth, no Vercel needed initially. API routes proxy provider keys.

```
┌─────────────────────────────────────────────────┐
│  Browser (Next.js client)                       │
│  ┌───────────────────────────────────────────┐  │
│  │ Phrase card (hanzi / pinyin / english)    │  │
│  │ Mic button + live waveform                │  │
│  │ Tutor panel (slides in on fail)           │  │
│  │ Transcript / history rail                 │  │
│  └───────────────────────────────────────────┘  │
│         │ MediaRecorder (WAV/Opus)              │
└─────────┼───────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  Next.js API routes (server, keys safe)         │
│  /api/score   → Azure Pronunciation Assessment  │
│  /api/tts     → Azure Neural TTS (Mandarin)     │
│  /api/turn    → Claude (orchestrator)           │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  Decks (filesystem)                             │
│  /decks/pimsleur-01.yaml, hsk-1.yaml, ...       │
│  Progress: localStorage (later: SQLite)         │
└─────────────────────────────────────────────────┘
```

### Components

- **`<PhraseCard />`** — large hanzi, pinyin with tone-colored marks, English. Speaker icon replays AI's last utterance.
- **`<MicButton />`** — push-to-talk (spacebar) or tap-to-talk. Shows live waveform while recording. Releases → upload.
- **`<TutorPanel />`** — slides in when Claude routes to tutor sub-loop. Shows the failed word/syllable with reference audio, tone diagram, and Claude's explanation. Has its own mini mic for retries.
- **`<ConversationRail />`** — running transcript of the chat (your lines + AI's lines, with pinyin + english toggles).
- **`<MetaBar />`** — quick-tap chips for common meta-asks ("slow down", "repeat", "explain that"). Voice meta-asks also work; chips are the redundancy.

### API contracts

**`POST /api/score`** — `{ audio: blob, referenceText: string }` → `{ transcript, accuracyScore, fluencyScore, completenessScore, words: [{ word, accuracy, errorType, syllables: [{ pinyin, tone, accuracy }] }] }`

**`POST /api/tts`** — `{ text: string, speed?: number, voice?: string }` → audio stream (Opus or MP3).

**`POST /api/turn`** — the orchestrator. Body:
```ts
{
  history: Turn[],            // running conversation
  lastUserAudio?: ScoreResult, // present only when user just spoke
  activeDeckIds: string[],     // which decks are loaded
  metaIntent?: string,         // populated if user issued a meta-ask
}
```
Returns:
```ts
{
  speakerNext: "ai" | "user",   // whose turn now
  aiUtterance?: {                // present if speakerNext === "user" after AI speaks
    hanzi: string,
    pinyin: string,
    english: string,
    audioUrl: string,            // TTS-generated
  },
  routeTo: "conversation" | "tutor",
  tutorPayload?: {               // present if routeTo === "tutor"
    targetWord: string,          // the failed word/syllable
    diagnosis: string,           // Claude's plain-english explanation
    referenceAudioUrl: string,
    retryPrompt: string,
  }
}
```

---

## Data: Deck Format

Decks are YAML files in `/decks/`. The atomic unit is a **Q/A pair**, because the conversation is structured around question and answer:

```yaml
deck:
  id: pimsleur-01
  title: Pimsleur Lesson 1 — Greetings & Excuse Me
  source: Pimsleur Mandarin Level 1, Lesson 1

pairs:
  - id: p01-001
    q:
      hanzi: 你好吗？
      pinyin: nǐ hǎo ma?
      english: How are you?
    a:
      hanzi: 我很好，谢谢。
      pinyin: wǒ hěn hǎo, xièxie.
      english: I'm fine, thank you.
    tags: [greetings, lesson-1]
    notes: optional grammar/cultural note
```

Either side of a pair can be the prompt — Claude decides per turn whether the user is asker or answerer. Standalone phrases (declarations without a paired response) are also allowed via `pairs: [{ statement: {...}, tags: [...] }]`.

The user pastes Pimsleur lists into a deck file (or a one-shot importer script converts a CSV/TSV). Multiple decks can be loaded simultaneously.

---

## Claude's Orchestrator Prompt (sketch)

Claude is invoked on every turn with:
- The system prompt: "You are a Mandarin tutor running a conversational practice loop. The user speaks Chinese; you correct pronunciation and grammar, then continue the conversation. You decide whether to pass, drill, or follow a tangent."
- Recent conversation history (last ~20 turns)
- The pronunciation score from Azure (when the user just spoke)
- Active deck pairs as a tools-shaped context: "available phrases you can pull from"
- Any meta-intent flag

Claude outputs a structured response (the API contract above). Tool use is optional but a future hook for things like dictionary lookup or etymology fetches.

**Pass thresholds (initial guess, tunable in DevDoc):**
- Pronunciation accuracy: ≥ 80
- All syllables ≥ 70 accuracy
- All tones correct (Azure flags tone errors specifically)
- Grammar: Claude's judgment — no rigid threshold

Below these → tutor sub-loop with the lowest-scoring word/syllable as `targetWord`.

---

## UI Sketch

```
┌────────────────────────────────────────────────────────┐
│   Learn Chinese                            [decks ▾]   │
├────────────────────────────────────────────────────────┤
│                                                        │
│                     你 好 吗 ？                         │
│                     nǐ  hǎo  ma                        │
│                     How are you?                       │
│                                                        │
│                       🔊  (replay)                     │
│                                                        │
├────────────────────────────────────────────────────────┤
│   🎤  hold space to talk           ────────────waveform│
├────────────────────────────────────────────────────────┤
│   slow down · repeat · explain · etymology · tones     │
├────────────────────────────────────────────────────────┤
│  ↑ AI: 你今天怎么样? (How's your day going?)            │
│  ↑ You: 我很好... (accuracy 87, tones ✓)                │
│  ↑ AI: 对！轮到你问我了。 (Your turn to ask.)            │
└────────────────────────────────────────────────────────┘
```

When tutor mode triggers, the PhraseCard collapses upward and a TutorPanel slides up from below with the failing syllable enlarged, tone diagram, and a mini retry mic.

Visual language: warm and editorial, not duolingo-cartoonish. Fraunces for the hanzi (large, serif weight), Inter for everything else, parchment background (#f6f4ef), terracotta accents (#c2410c). Matches the user's Amber design language.

---

## Out of Scope (v1)

These are deliberately excluded — they belong in icebox:
- User accounts / multi-user / cloud sync
- Mobile-native build (browser on mobile is fine)
- Writing practice (stroke order)
- Reading-only mode (no mic)
- Spaced repetition scheduling (we'll just shuffle the active deck for now)
- Progress analytics dashboard
- Cantonese or other languages
- Sharing decks with other users

---

## Tech / Infrastructure Decisions

| Concern | Decision | Why |
|---|---|---|
| Framework | Next.js 16 App Router | API routes proxy keys; same DX as AMD app |
| UI | Tailwind + shadcn/ui | Fast, composable, matches existing aesthetic |
| Pronunciation | Azure Speech Pronunciation Assessment | Only mainstream API with per-phoneme + tone scoring for Mandarin |
| TTS | Azure Neural TTS (zh-CN-XiaoxiaoNeural default) | Same provider as scoring; consistent voice |
| Tutor LLM | Claude Sonnet 4.6 | User preference; fast, cheap enough, good at this |
| Deck storage | YAML files in `/decks/` | Editable by hand, diff-friendly, version-controlled |
| Progress | localStorage (v1) | YAGNI on DB until we know what to track |
| Hosting | Local dev only (v1) | Vercel later if mobile becomes important |
| Repo | `jerms-ai/learn-chinese` (private) | New GitHub repo, feat/* branch flow |

---

## Repo & Workflow Conventions

Mirrors AMD app conventions:
- `CLAUDE.md` — per-project Claude instructions (read first every session)
- `DevDoc.md` — scope, decisions, open questions, icebox
- `docs/superpowers/specs/` — design specs (this file)
- `docs/superpowers/plans/` — implementation plans (next step)
- Branch flow: `feat/<name>` off `main`, one PR per feature
- **Never auto-commit, never auto-push, never auto-deploy** — explicit asks only

---

## Prerequisites (one-time setup before code)

- **Azure account + Speech resource.** User does not have Azure yet. We'll create a free-tier Azure subscription and provision a Speech service (F0 tier: 5h audio/month free, covers solo daily practice easily). Two secrets land in `.env.local`: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.
- **Anthropic API key.** Already on hand. Lands as `ANTHROPIC_API_KEY` in `.env.local`.
- **GitHub repo.** Create `jerms-ai/learn-chinese` (private) before first push.

## Deck Sourcing (resolved)

**Plan: import from public Anki decks first, fall back to manual YAML.**

AnkiWeb hosts several community-built Pimsleur Mandarin decks (e.g. "Pimsleur Mandarin I (Simplified, Pinyin, Traditional, Audio)"). Anki `.apkg` files are SQLite databases — straightforward to parse. We'll write `scripts/import-anki.ts` that:

1. Takes an `.apkg` path as input
2. Extracts cards into `{ hanzi, pinyin, english }` triples
3. Uses Claude (one-shot, at import time) to pair adjacent questions with their answers, since Anki decks aren't natively Q/A paired
4. Writes the result to `decks/<deck-name>.yaml`

If a deck can't be found in suitable quality, fallback is hand-pasting from Pimsleur transcripts into YAML. This is a known-good escape hatch, not a blocker.

## Resolved Design Decisions

| Question | Answer |
|---|---|
| Push-to-talk vs VAD | Push-to-talk (spacebar). VAD goes to icebox. |
| Tutor detour depth | No cap. Trust the conversation — user can say "back to practice" or just ask a new question and Claude flips back. |
| Conversation persistence | **Persist in localStorage from v1.** Storage is effectively free; reloading and continuing where you left off feels right. |

---

## Success Criteria for v1

- User loads a deck (Pimsleur lesson 1 imported), clicks "start"
- AI speaks the first question in Mandarin; hanzi/pinyin/english visible
- User holds spacebar, speaks the answer
- Azure scores the audio; Claude routes to either pass-and-continue or tutor sub-loop
- A failed tone triggers tutor mode with a clear visualization of the correct tone vs what was spoken
- **When the user responds successfully, the AI gives a short natural confirmation and then the app waits patiently for the user to ask the next question — it does NOT immediately barrel into the next AI-posed question. The turn explicitly flips.** The user controls when to speak; the loop is responsive, not pushy.
- Loop continues for at least 10 turns without breaking
- User can interrupt with "slow down" and Claude obeys
- Closing the browser tab and reopening it restores the conversation history (localStorage persistence)
