# Learn Chinese

A personal AI-driven Mandarin tutor. Conversational question-and-answer practice with real-time pronunciation scoring (down to the tone) and a tutor sub-loop that drills the exact syllable that went sideways.

Solo-use. No accounts. Runs locally.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind + shadcn/ui**
- **Azure Speech** — Pronunciation Assessment + Neural TTS (Mandarin)
- **Anthropic Claude** — conversation orchestrator
- **YAML decks** in `/decks/`, imported from public Anki `.apkg` files

## Status

Design phase. See `docs/superpowers/specs/2026-05-25-learn-chinese-design.md` for the authoritative spec, and `DevDoc.md` for current sprint state.

## Quick start

(To be filled in once the Next.js app is scaffolded.)

## Repo conventions

See `CLAUDE.md`. Branch flow: `feat/*` → `main`. No auto-commit, no auto-push, no auto-deploy.
