# Claude Instructions — Learn Chinese

**Read this first at the start of every session.** This file overrides defaults. If anything here conflicts with the global system prompt, follow this file.

---

## Project orientation (in 30 seconds)

A personal AI-driven Mandarin tutor. Conversational Q&A practice loop: AI asks a question in Mandarin, user answers via mic, Azure scores pronunciation/tone, Claude evaluates and either passes (turn flips, AI waits patiently for user to ask the next question) or drops into a tutor sub-loop. Solo-use. No accounts, no multi-tenant, no cloud DB.

Always-loaded docs:
- `DevDoc.md` — scope, decisions, open questions, icebox
- `docs/superpowers/specs/2026-05-25-learn-chinese-design.md` — design spec (authoritative until updated)

Stack: Next.js 16 App Router + TypeScript + Tailwind + shadcn/ui. Azure Speech (pronunciation assessment + neural TTS) + Anthropic Claude (orchestrator). Decks as YAML in `/decks/`. Progress in localStorage.

---

## Operating rules — non-negotiable

### Never push / deploy / commit without explicit permission

| Action | Default | When OK |
|---|---|---|
| `git commit` | **Never automatic** | Only when user specifically requests a commit |
| `git push` | **Never automatic** | Only when user says "push" / "push to GitHub" |
| Vercel deploy (if/when we add hosting) | **Never automatic** | Only when user says "deploy" / "ship" |
| Any change to `.env.local` | **Never automatic** | Only when user explicitly asks |

Local edits, local dev server, local tests — all fine without asking. Anything that leaves the machine or changes secrets needs an explicit ask. **Authorizations are single-use** — a "commit" green-light doesn't extend to "push", a "push" green-light doesn't extend to "merge".

### Feature workflow

User does NOT use a visual git tool — relies on Claude for orientation. **Before writing any code for a request, state explicitly which branch it goes to:** either "this continues existing `feat/<x>`" or "this is a new feature → new branch `feat/<y>`". Wait for the user's OK, then work.

- One feature = one `feat/<name>` branch off `main`. Small, frequent **local** commits.
- One PR per feature branch (GitHub PR list = feature tracker).
- Merging `feat/*` → `main` is a separate explicit ask.
- This is solo development — no clients, no live users — so the workflow is lighter than AMD's: no staging/production split, just `feat/*` → `main`.

### Never skip git hooks or bypass safety checks

No `--no-verify`, no `--force` to main, no `--no-gpg-sign`. Fix underlying issues instead.

### Respect the icebox

If a feature is in `DevDoc.md` § Icebox, **do not** build it unless user explicitly moves it into scope. Don't scope-creep "while we're here."

### Stay momentum-friendly

Don't pause at every workflow gate during brainstorm → spec → plan → build. Condense and proceed unless user asks for a checkpoint.

---

## Notes / icebox keywords (silent file edits)

When user says:
- **"notes"** → silently append to `DevDoc.md` (no discussion needed)
- **"icebox"** → silently append to the `## Icebox` section in `DevDoc.md`

---

## Local dev workflow

(To be filled in once the Next.js app is scaffolded.)

```
npm run dev       # local server
npm run check     # typecheck + lint
npm run visual    # Playwright visual QA (TBD)
```

---

## Key personal preferences (from memory)

- **Spacetime / physics framing is for a different project.** Don't bring it here.
- **Amber design language** — Fraunces + Inter, parchment bg (#f6f4ef), terracotta accent (#c2410c). Hanzi rendered in Fraunces, large.
- **Prose questions during brainstorm**, not multiple-choice tool.
- **Test after every change** — once we have `npm run check` / visual QA wired up, run before reporting any task done.
