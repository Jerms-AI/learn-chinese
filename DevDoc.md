# DevDoc — Learn Chinese

Living document for scope, decisions, open questions, and icebox.

**Spec:** `docs/superpowers/specs/2026-05-25-learn-chinese-design.md` is the authoritative design until superseded. This doc captures the working state on top of it.

---

## Current sprint

**Phase:** Design approved, repo scaffolded. Next: implementation plan, then Azure setup, then Next.js scaffold.

### Queued

- [ ] Write implementation plan (`docs/superpowers/plans/<date>-learn-chinese-plan.md`)
- [ ] User sets up Azure free account + Speech resource (F0 tier)
- [ ] Scaffold Next.js 16 app (`feat/scaffold-app`)
- [ ] Write `scripts/import-anki.ts` (`feat/anki-importer`)
- [ ] Import a Pimsleur Mandarin I deck from AnkiWeb
- [ ] Wire `/api/score` (Azure Pronunciation Assessment)
- [ ] Wire `/api/tts` (Azure Neural TTS)
- [ ] Wire `/api/turn` (Claude orchestrator)
- [ ] Build `<PhraseCard />`, `<MicButton />`, `<ConversationRail />`
- [ ] Build `<TutorPanel />` with tone visualization
- [ ] Persist conversation in localStorage
- [ ] End-to-end test: 10-turn conversation without breaking

### In progress

(none)

### Done

- [x] Design spec written and approved (2026-05-25)
- [x] Repo scaffolded with CLAUDE.md, DevDoc.md, .gitignore, README

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

---

## Open questions

(none — all resolved in spec)

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
