# DevDoc — Learn Chinese

Living document for scope, decisions, open questions, and icebox.

**Spec:** `docs/superpowers/specs/2026-05-25-learn-chinese-design.md` is the authoritative design until superseded. This doc captures the working state on top of it.

---

## Current state (updated 2026-07-04)

The app is **built and working**. A session is a continuous conversation: the AI asks a question in Mandarin → you answer by mic (hold **space**) → the AI reacts and asks the next thing. Plus an "ask in English" side-channel (hold **E**) and a "my words only" drill mode. All shipped to `main` and pushed to `origin` (github.com/Jerms-AI/learn-chinese).

**Live provider stack — differs from the original spec:**

- **STT:** OpenAI `gpt-4o-transcribe` via `/api/transcribe` (`lang` = `zh` for answers, `en` for asks). Azure STT + pronunciation scoring were **removed** (commit `68097b4`).
- **TTS:** Azure Neural TTS (`zh-CN-XiaoxiaoNeural`) via `/api/tts`; slow-speech uses the SSML prosody `rate`. The Azure subscription must be **active**.
- **Orchestrator:** Claude **Sonnet 5** (`claude-sonnet-5`) via `/api/turn`, adaptive thinking at low effort. Returns the utterance **plus an aligned per-word `segments` array**. `/api/ask` (also Sonnet 5) answers "how do I say X".
- **No pronunciation scoring / tutor loop** is active — see Open questions.

---

## Getting started on a new machine

`.env.local` is **gitignored** — a fresh clone has no keys and runs in degraded "mock" mode until you add them.

1. `git clone` + `npm install`.
2. Copy `.env.local.example` → `.env.local` and fill in (values are **not** in the repo — bring them from the other machine or the provider dashboards):
   - `OPENAI_API_KEY` — STT. Without it `/api/transcribe` returns `[mock transcript]` and the loop stalls ("I couldn't make out the Mandarin"). Paid model — needs credits.
   - `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` (`eastus`) — TTS voice. Without it audio is silent (mock). If the Azure **subscription is disabled**, TTS 401s and the UI hangs for minutes.
   - `ANTHROPIC_API_KEY` — the conversation orchestrator. Without it `/api/turn` + `/api/ask` return canned mock replies.
3. `npm run dev` → http://localhost:3000 (`PORT=3001 npm run dev` if 3000 is busy). `npm run check` = `tsc` + eslint. UI flows are verified by driving a real headless Chromium (Playwright) — see `tests/` and the pattern of small drive-and-assert scripts.
4. Smoke test: **Start** → hold **space** and speak Mandarin → hold **E** and ask "how do I say water?".

---

## Session log — 2026-07-04 (all on `main`, pushed)

- **App "not working" fix:** the Azure→OpenAI STT migration never added `OPENAI_API_KEY` to `.env.local`, so transcription was mock-only. Added the key + listed it in `.env.local.example`.
- **Orchestrator → Sonnet 5** with adaptive thinking (low effort). Conversation-quality pass: exactly one coherent question per turn; role rules (the AI never parrots the learner's own answer line); never re-ask a settled question.
- **Organic slider (0–3)** — how far the tutor may stray from the active lesson (0 on-lesson → 3 free); level ≥2 widens the pool to the whole track.
- **Ask in English (hold E)** — English question → `/api/transcribe?lang=en` → `/api/ask` → target Mandarin, shown + spoken + saved to a **"My words"** bank (`state.myWords`, localStorage) that resurfaces in conversation (merged into the orchestrator pool as always-in-scope).
- **Slow-speech toggle (🐢)** — all TTS + replays at 0.7×.
- **"My words only" drill mode (🎯)** — restricts the conversation to your saved words, cycling them through varied contexts; toggling on/off immediately poses a matching question; **↻ redo** regenerates a phrase; reset clears it.
- **Color-aligned interlinear card** — each word is a color-matched column (hanzi / pinyin / literal gloss share a color), a plain-black natural translation beneath, and **click any word to hear just that word**. Powered by the orchestrator's new `segments` array.
- **Mic pre-warm fix** — the first `getUserMedia` was cold and clipped short holds (the "hold E does nothing" bug); the mic now warms on first interaction.

**Earlier (pre-2026-07-04, on `main`):** voice visualizer engine (`lib/visualizer/**` + `components/VoiceVisualizer.tsx`, spec `docs/superpowers/specs/2026-06-16-voice-visualizer-design.md`) and the `/playground` tuning page.

---

## Decisions log

| Date | Decision | Reason |
|---|---|---|
| 2026-05-25 | Next.js 16 App Router (vs Vite + separate server) | API routes proxy provider keys; same DX as AMD app |
| 2026-05-25 | Azure Speech for pronunciation scoring | Only mainstream API with per-phoneme + tone scoring for Mandarin |
| 2026-05-25 | Claude Sonnet 4.6 as orchestrator | User preference; fast, cheap, good at conversational reasoning |
| 2026-05-25 | YAML decks in `/decks/`, not a DB | Editable by hand, diff-friendly, version-controlled |
| 2026-05-25 | localStorage for progress + conversation persistence | YAGNI on DB until requirements emerge |
| 2026-05-25 | Push-to-talk (spacebar), not VAD | Predictable; VAD goes to icebox |
| 2026-05-25 | No cap on tutor detour depth | Trust the conversation; user can say "back to practice" |
| 2026-05-25 | Single melded conversation loop, not two modes | User clarified: AI asks → user answers → user asks → AI answers, continuous |
| 2026-05-25 | After successful response, AI gives short confirmation then waits patiently | App is responsive, not pushy — user controls when to speak next |
| 2026-05-25 | Anki `.apkg` import via Claude-assisted Q/A pairing | Public Pimsleur Mandarin decks exist on AnkiWeb |
| 2026-06-16 | Voice visualizer = points-based morphing + per-state profiles + frequency-reactive (pos/size/color/glow) + schema-driven levers; Canvas2D renderer behind a pluggable `Renderer` interface | "Floating glowing wiggling" voice context; every axis (shape/color/motion/style/state) must be independently tweakable; WebGL renderer can drop in later |
| 2026-06-16 | Shared `AnalyserNode` kept on a silent (zero-gain) path to `destination` | Strict browsers don't update a dead-end analyser → reactivity would read all zeros |
| 2026-06-16 | Playground triggers override the static state tab for the preview | Holding the mic is inherently "listening"; the preview should follow the active trigger, while the sliders stay tied to the selected tab |
| 2026-06-11 | **STT swapped Azure → OpenAI `gpt-4o-transcribe`**; Azure pronunciation **scoring + tutor loop dropped** | Web Speech was unavailable on the user's network; OpenAI transcribes Mandarin well. Trade-off: lost per-phoneme/tone scoring (supersedes the 2026-05-25 Azure-scoring decision). |
| 2026-07-04 | **Orchestrator Sonnet 4.6 → Sonnet 5**, adaptive thinking at low effort, `max_tokens` 4000 | Better instruction-following for the layered role/coherence/vocab rules; supersedes the 2026-05-25 Sonnet 4.6 decision. Thinking left on per user request; disable it (`{type:"disabled"}`) if latency matters more than the marginal reliability. |
| 2026-07-04 | Conversation is **free-form** (AI reply + follow-up question), not scripted Q/A scoring | No scoring engine post-Azure; the dialogue is driven purely by the Sonnet prompt + deck vocab pool. |
| 2026-07-04 | Orchestrator returns an aligned **`segments`** breakdown; user "ask in English" words are **always in-scope** in the pool | Powers the color-coded click-to-hear card; saved words should resurface regardless of the Organic level. |

---

## Open questions

- **Pronunciation feedback / the tutor is gone.** It was Azure-scoring-driven and was removed with the STT swap. The state machine + `TutorPanel` still exist but nothing feeds them (`lastUserScore` is hardcoded `null`, `TutorPanel` isn't rendered). Whisper "auto-corrects" mispronunciations into the nearest real words, so it can't detect tone errors. To restore real feedback: **Azure Pronunciation Assessment** against a target phrase (the reactivated Azure resource supports it) — fits **drill / "repeat after me"** mode (which has a reference phrase) far better than open free-form chat. Decision deferred; user aware.

---

## Icebox

Features deliberately deferred. Do not build unless explicitly promoted into scope.

- Voice-activity-detection (VAD) for hands-free turn detection
- Mobile-native build (browser on mobile works fine for now)
- User accounts / cloud sync / multi-user
- Spaced-repetition scheduling
- Writing practice (stroke order)
- Reading-only mode (no mic)
- Progress analytics dashboard
- Cantonese or other languages
- Deck sharing between users
- Public hosting on Vercel (later, if mobile becomes important)
- Tone diagram visualization beyond a basic 4-tone reference (start simple)
