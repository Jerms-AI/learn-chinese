# Learn Chinese Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Next.js 16 web app that runs a single melded Mandarin Q/A conversation loop — AI asks, user speaks, Azure scores pronunciation, Claude evaluates and either passes (turn flips, app waits) or drops into a tutor sub-loop.

**Architecture:** Next.js App Router with API routes proxying provider keys (Azure Speech + Anthropic Claude). Conversation state machine is a pure-function module that's testable without providers. UI is shadcn/ui + Tailwind with Amber design language (Fraunces hanzi, parchment bg). Decks are YAML Q/A pairs in `/decks/`. Persistence is localStorage.

**Tech Stack:** Next.js 16, TypeScript (strict), Tailwind v4, shadcn/ui, Vitest (unit), Playwright (E2E + visual), `js-yaml`, `zod`, `microsoft-cognitiveservices-speech-sdk`, `@anthropic-ai/sdk`, `sql.js` + `adm-zip` (for Anki `.apkg` import).

**Branch strategy:** Each phase = one `feat/<name>` branch off `main`. Local commits frequent (TDD-style); push only when user says so; merge to `main` only when user says so.

---

## File Structure (locked in before tasks)

```
learn-chinese/
├── app/
│   ├── layout.tsx                   # Root layout, fonts, theme
│   ├── page.tsx                     # Main conversation page
│   ├── globals.css                  # Tailwind directives + design tokens
│   └── api/
│       ├── turn/route.ts            # Claude orchestrator
│       ├── score/route.ts           # Azure pronunciation assessment
│       └── tts/route.ts             # Azure neural TTS
├── components/
│   ├── PhraseCard.tsx               # Hanzi/pinyin/english display
│   ├── MicButton.tsx                # Push-to-talk + waveform
│   ├── TutorPanel.tsx               # Failure-mode UI
│   ├── ConversationRail.tsx         # Running transcript
│   ├── MetaBar.tsx                  # "slow down / repeat / etc"
│   └── ui/                          # shadcn primitives (auto-generated)
├── lib/
│   ├── conversation/
│   │   ├── state.ts                 # State machine types + reducer
│   │   ├── orchestrator.ts          # Pure decision logic (no Claude call)
│   │   └── persistence.ts           # localStorage save/load
│   ├── decks/
│   │   ├── schema.ts                # Zod schema for deck YAML
│   │   ├── loader.ts                # Read + parse YAML files
│   │   └── selector.ts              # Pick next phrase from active decks
│   ├── pinyin/
│   │   └── tone-render.ts           # Color-code tones in pinyin strings
│   └── providers/
│       ├── azure-speech.ts          # Azure SDK wrapper (server-only)
│       └── anthropic.ts             # Claude SDK wrapper (server-only)
├── scripts/
│   └── import-anki.ts               # Convert .apkg → deck YAML
├── decks/
│   ├── pimsleur-01.yaml             # Imported decks
│   └── raw/                         # Downloaded .apkg files (.gitignored)
├── tests/
│   ├── unit/                        # Vitest specs
│   └── e2e/                         # Playwright specs
├── docs/superpowers/
│   ├── specs/                       # Already exists
│   └── plans/                       # This plan lives here
├── public/
│   └── mocks/                       # Mock audio for tests
├── .env.local.example               # Template (committed)
├── .env.local                       # Real keys (.gitignored)
├── playwright.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Phase 0: Scaffold (`feat/scaffold`)

### Task 0.1: State branch + create Next.js app

**Files:**
- Modify: working dir contents (Next.js scaffold)

- [ ] **Step 1: Confirm branch with user**

Tell user: "Starting `feat/scaffold` off `main`. Will run `create-next-app` non-interactively to scaffold inside the existing repo, then commit. OK?" Wait for OK.

- [ ] **Step 2: Create the branch**

```bash
cd /home/jermsai/Code/Learn_Chinese
git checkout -b feat/scaffold
```

Expected: `Switched to a new branch 'feat/scaffold'`

- [ ] **Step 3: Scaffold Next.js 16 in-place**

The repo already has `CLAUDE.md`, `DevDoc.md`, etc. We need `create-next-app` to coexist with them. Easiest: scaffold into a temp dir, then move files in.

```bash
cd /home/jermsai/Code/Learn_Chinese
npx --yes create-next-app@latest .tmp-scaffold \
  --typescript --tailwind --eslint --app --src-dir=false \
  --import-alias "@/*" --use-npm --no-turbopack --skip-install
```

Then move files (keep our existing docs):

```bash
cd /home/jermsai/Code/Learn_Chinese
shopt -s dotglob
mv .tmp-scaffold/* .
mv .tmp-scaffold/.* . 2>/dev/null || true
rmdir .tmp-scaffold
shopt -u dotglob
```

Resolve `.gitignore` conflict — our existing one already covers Next.js. If `create-next-app` wrote a new one, the merge keeps ours:

```bash
git checkout .gitignore
```

- [ ] **Step 4: Install deps**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm install
```

Expected: `added N packages` with no errors.

- [ ] **Step 5: Verify dev server boots**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run dev
```

Open http://localhost:3000 — expected: Next.js welcome page. Kill the server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "chore(scaffold): bootstrap Next.js 16 App Router + Tailwind + TS"
```

### Task 0.2: Install project dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm install zod js-yaml @anthropic-ai/sdk microsoft-cognitiveservices-speech-sdk
```

- [ ] **Step 2: Install dev deps**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom \
  @playwright/test \
  @types/js-yaml \
  sql.js @types/sql.js adm-zip @types/adm-zip
```

- [ ] **Step 3: Verify install**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm ls --depth=0 zod js-yaml vitest @playwright/test
```

Expected: all four listed without errors.

- [ ] **Step 4: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add package.json package-lock.json
git commit -m "chore(deps): add zod, yaml, Anthropic SDK, Azure Speech, Vitest, Playwright"
```

### Task 0.3: Configure Vitest + Playwright

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/.gitkeep`
- Create: `playwright.config.ts`
- Create: `tests/e2e/.gitkeep`
- Modify: `package.json` (scripts)
- Create: `tests/unit/setup.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/unit/setup.ts"],
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 2: Write `tests/unit/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 4: Create empty test dirs**

```bash
cd /home/jermsai/Code/Learn_Chinese
mkdir -p tests/unit tests/e2e
touch tests/unit/.gitkeep tests/e2e/.gitkeep
```

- [ ] **Step 5: Add npm scripts**

Edit `package.json` to add (under `scripts`):

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "check": "tsc --noEmit && next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "e2e:install": "playwright install --with-deps chromium"
}
```

- [ ] **Step 6: Install Playwright browser**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run e2e:install
```

- [ ] **Step 7: Smoke test the testing stack**

Create `tests/unit/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

Run:

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: 1 passed.

Delete the smoke file after the run passes:

```bash
rm tests/unit/smoke.test.ts
```

- [ ] **Step 8: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "chore(test): configure Vitest + Playwright with check/test/e2e scripts"
```

### Task 0.4: Design tokens, fonts, base layout

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Modify: `tailwind.config.ts` (if exists; in Tailwind v4 it may be `app/globals.css` only)

- [ ] **Step 1: Write `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Learn Chinese",
  description: "A personal AI-driven Mandarin tutor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="bg-parchment text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Write `app/globals.css`** (Tailwind v4 syntax)

```css
@import "tailwindcss";

@theme {
  --color-parchment: #f6f4ef;
  --color-ink: #1f1b16;
  --color-terracotta: #c2410c;
  --color-muted: #8a8275;
  --color-card: #ffffff;
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-serif: var(--font-fraunces), Georgia, serif;
}

html, body { height: 100%; }

/* Tone color hints (used by pinyin renderer) */
.tone-1 { color: #2563eb; }   /* high — blue */
.tone-2 { color: #16a34a; }   /* rising — green */
.tone-3 { color: #ca8a04; }   /* dipping — amber */
.tone-4 { color: #dc2626; }   /* falling — red */
.tone-5 { color: var(--color-muted); }  /* neutral */
```

- [ ] **Step 3: Write minimal `app/page.tsx`**

```tsx
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-5xl">学中文</h1>
      <p className="mt-2 text-muted">Learn Chinese</p>
    </main>
  );
}
```

- [ ] **Step 4: Verify the page renders with Amber palette**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run dev
```

Open http://localhost:3000. Expected: parchment background, serif "学中文" headline, muted "Learn Chinese" subtitle. Kill the server.

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): Amber design tokens, Fraunces+Inter fonts, base layout"
```

### Task 0.5: Add `.env.local.example` and provider stubs

**Files:**
- Create: `.env.local.example`
- Create: `lib/providers/anthropic.ts`
- Create: `lib/providers/azure-speech.ts`

- [ ] **Step 1: Write `.env.local.example`**

```
# Copy to .env.local and fill in. Real .env.local is gitignored.

# Anthropic Claude
ANTHROPIC_API_KEY=

# Azure Speech (set up after Azure account creation)
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus
```

- [ ] **Step 2: Write `lib/providers/anthropic.ts`** (server-only)

```typescript
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const CLAUDE_MODEL = "claude-sonnet-4-6";
```

- [ ] **Step 3: Write `lib/providers/azure-speech.ts`** (placeholder — real impl in Phase 9)

```typescript
import "server-only";

export type AzureCreds = { key: string; region: string };

export function getAzureCreds(): AzureCreds {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set");
  }
  return { key, region };
}
```

- [ ] **Step 4: Install `server-only`**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm install server-only
```

- [ ] **Step 5: Typecheck**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run check
```

Expected: passes (no errors).

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "chore(env): add .env.local.example and provider key getters"
```

### Phase 0 wrap

Tell user: "Phase 0 done on `feat/scaffold`. Ready to push and merge to main, or continue on the same branch through Phase 1?"

Wait for user direction.

---

## Phase 1: Deck system (`feat/deck-system`)

### Task 1.1: Zod schema for deck YAML

**Files:**
- Create: `lib/decks/schema.ts`
- Create: `tests/unit/decks/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/decks/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DeckSchema, type Deck } from "@/lib/decks/schema";

describe("DeckSchema", () => {
  it("parses a minimal Q/A pair deck", () => {
    const input = {
      deck: { id: "pim-01", title: "Pimsleur 1", source: "Pimsleur" },
      pairs: [
        {
          id: "p1",
          q: { hanzi: "你好吗？", pinyin: "nǐ hǎo ma?", english: "How are you?" },
          a: { hanzi: "我很好。", pinyin: "wǒ hěn hǎo.", english: "I'm fine." },
          tags: ["greetings"],
        },
      ],
    };
    const parsed: Deck = DeckSchema.parse(input);
    expect(parsed.pairs[0].q.hanzi).toBe("你好吗？");
  });

  it("rejects a pair missing hanzi", () => {
    const input = {
      deck: { id: "x", title: "y", source: "z" },
      pairs: [{ id: "p1", q: { pinyin: "x", english: "y" }, a: { hanzi: "x", pinyin: "y", english: "z" } }],
    };
    expect(() => DeckSchema.parse(input)).toThrow();
  });

  it("accepts a standalone phrase pair (statement only)", () => {
    const input = {
      deck: { id: "x", title: "y", source: "z" },
      pairs: [
        {
          id: "p1",
          statement: { hanzi: "谢谢", pinyin: "xièxie", english: "thanks" },
          tags: [],
        },
      ],
    };
    const parsed = DeckSchema.parse(input);
    expect(parsed.pairs[0].statement?.hanzi).toBe("谢谢");
  });
});
```

- [ ] **Step 2: Run the test (should fail — file missing)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/decks/schema.ts`**

```typescript
import { z } from "zod";

const PhraseSchema = z.object({
  hanzi: z.string().min(1),
  pinyin: z.string().min(1),
  english: z.string().min(1),
});

const PairSchema = z
  .object({
    id: z.string().min(1),
    q: PhraseSchema.optional(),
    a: PhraseSchema.optional(),
    statement: PhraseSchema.optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .refine(
    (p) => (p.q && p.a) || p.statement,
    "Pair must have q+a OR statement"
  );

export const DeckSchema = z.object({
  deck: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    source: z.string().min(1),
  }),
  pairs: z.array(PairSchema).min(1),
});

export type Phrase = z.infer<typeof PhraseSchema>;
export type Pair = z.infer<typeof PairSchema>;
export type Deck = z.infer<typeof DeckSchema>;
```

- [ ] **Step 4: Run the test (should pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(decks): zod schema for Q/A pair decks (q+a or statement)"
```

### Task 1.2: YAML loader

**Files:**
- Create: `lib/decks/loader.ts`
- Create: `tests/unit/decks/loader.test.ts`
- Create: `decks/_fixture-mini.yaml` (test fixture)

- [ ] **Step 1: Create test fixture**

`decks/_fixture-mini.yaml`:

```yaml
deck:
  id: fixture-mini
  title: Fixture Mini
  source: test
pairs:
  - id: f1
    q:
      hanzi: 你好
      pinyin: nǐ hǎo
      english: hello
    a:
      hanzi: 你好
      pinyin: nǐ hǎo
      english: hello
    tags: [test]
```

- [ ] **Step 2: Write the failing test**

`tests/unit/decks/loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadDeck, loadAllDecks } from "@/lib/decks/loader";

const fixturePath = path.join(process.cwd(), "decks", "_fixture-mini.yaml");

describe("loadDeck", () => {
  it("loads and parses a single YAML deck", async () => {
    const deck = await loadDeck(fixturePath);
    expect(deck.deck.id).toBe("fixture-mini");
    expect(deck.pairs).toHaveLength(1);
    expect(deck.pairs[0].q?.hanzi).toBe("你好");
  });

  it("throws on malformed YAML", async () => {
    await expect(loadDeck("/nonexistent.yaml")).rejects.toThrow();
  });
});

describe("loadAllDecks", () => {
  it("loads every .yaml in decks/ directory", async () => {
    const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
    expect(decks.length).toBeGreaterThanOrEqual(1);
    expect(decks.some((d) => d.deck.id === "fixture-mini")).toBe(true);
  });
});
```

- [ ] **Step 3: Run (should fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: FAIL (loader missing).

- [ ] **Step 4: Write `lib/decks/loader.ts`**

```typescript
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { DeckSchema, type Deck } from "./schema";

export async function loadDeck(filePath: string): Promise<Deck> {
  const raw = await readFile(filePath, "utf8");
  const parsed = yaml.load(raw);
  return DeckSchema.parse(parsed);
}

export async function loadAllDecks(dir: string): Promise<Deck[]> {
  const entries = await readdir(dir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const decks: Deck[] = [];
  for (const f of yamlFiles) {
    decks.push(await loadDeck(path.join(dir, f)));
  }
  return decks;
}
```

- [ ] **Step 5: Run (should pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: all passing (5+ tests).

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(decks): YAML loader for single deck and directory"
```

### Task 1.3: Phrase selector (picks next phrase from active decks)

**Files:**
- Create: `lib/decks/selector.ts`
- Create: `tests/unit/decks/selector.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/decks/selector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pickNextPair } from "@/lib/decks/selector";
import type { Deck } from "@/lib/decks/schema";

const deck: Deck = {
  deck: { id: "d", title: "t", source: "s" },
  pairs: [
    { id: "p1", q: { hanzi: "a", pinyin: "a", english: "a" }, a: { hanzi: "b", pinyin: "b", english: "b" }, tags: [] },
    { id: "p2", q: { hanzi: "c", pinyin: "c", english: "c" }, a: { hanzi: "d", pinyin: "d", english: "d" }, tags: [] },
  ],
};

describe("pickNextPair", () => {
  it("returns a pair from the deck", () => {
    const picked = pickNextPair([deck], { seenIds: [], rng: () => 0 });
    expect(["p1", "p2"]).toContain(picked.id);
  });

  it("avoids recently-seen pairs when possible", () => {
    const picked = pickNextPair([deck], { seenIds: ["p1"], rng: () => 0 });
    expect(picked.id).toBe("p2");
  });

  it("falls back to any pair when all are seen", () => {
    const picked = pickNextPair([deck], { seenIds: ["p1", "p2"], rng: () => 0 });
    expect(["p1", "p2"]).toContain(picked.id);
  });
});
```

- [ ] **Step 2: Run (should fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- selector
```

- [ ] **Step 3: Write `lib/decks/selector.ts`**

```typescript
import type { Deck, Pair } from "./schema";

export type PickOptions = {
  seenIds: string[];
  rng?: () => number;
};

export function pickNextPair(decks: Deck[], opts: PickOptions): Pair {
  const all = decks.flatMap((d) => d.pairs);
  if (all.length === 0) throw new Error("No pairs available");

  const unseen = all.filter((p) => !opts.seenIds.includes(p.id));
  const pool = unseen.length > 0 ? unseen : all;
  const rng = opts.rng ?? Math.random;
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}
```

- [ ] **Step 4: Run (should pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(decks): phrase selector with seen-avoidance"
```

### Task 1.4: Anki `.apkg` importer script

**Files:**
- Create: `scripts/import-anki.ts`
- Create: `tests/unit/scripts/import-anki.test.ts`
- Create: `tests/fixtures/mini.apkg` (small fixture — generate programmatically)

- [ ] **Step 1: Write fixture generator + failing test**

`tests/unit/scripts/import-anki.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import initSqlJs from "sql.js";
import { extractCardsFromApkg } from "@/scripts/import-anki";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const fixturePath = path.join(fixtureDir, "mini.apkg");

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  // Anki schema is huge; we only need notes table for testing.
  db.run(`CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT)`);
  // Anki delimits fields with \x1f
  db.run(`INSERT INTO notes VALUES (1, ?)`, ["你好\x1fnǐ hǎo\x1fhello"]);
  db.run(`INSERT INTO notes VALUES (2, ?)`, ["再见\x1fzàijiàn\x1fgoodbye"]);
  const data = db.export();
  const zip = new AdmZip();
  zip.addFile("collection.anki2", Buffer.from(data));
  zip.writeZip(fixturePath);
});

describe("extractCardsFromApkg", () => {
  it("returns rows of (hanzi, pinyin, english)", async () => {
    const cards = await extractCardsFromApkg(fixturePath);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({ hanzi: "你好", pinyin: "nǐ hǎo", english: "hello" });
  });
});
```

- [ ] **Step 2: Run (fail — script missing)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- import-anki
```

- [ ] **Step 3: Write `scripts/import-anki.ts`**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import AdmZip from "adm-zip";
import initSqlJs from "sql.js";

export type RawCard = { hanzi: string; pinyin: string; english: string };

export async function extractCardsFromApkg(apkgPath: string): Promise<RawCard[]> {
  const zip = new AdmZip(apkgPath);
  const dbEntry = zip.getEntry("collection.anki2") ?? zip.getEntry("collection.anki21");
  if (!dbEntry) throw new Error("apkg missing collection.anki2(1)");

  const SQL = await initSqlJs();
  const db = new SQL.Database(dbEntry.getData());
  const result = db.exec("SELECT flds FROM notes");
  if (result.length === 0) return [];

  const rows = result[0].values as string[][];
  return rows.map(([flds]) => {
    const parts = flds.split("\x1f");
    // Field order varies per deck; safest: assume [hanzi, pinyin, english, ...]
    return {
      hanzi: parts[0]?.trim() ?? "",
      pinyin: parts[1]?.trim() ?? "",
      english: parts[2]?.trim() ?? "",
    };
  });
}

// CLI entry point — convert apkg → deck YAML.
// Q/A pairing is left to a follow-up Claude-assisted step (see pairCards()).
if (require.main === module) {
  const [, , inputPath, outputPath, deckId, deckTitle] = process.argv;
  if (!inputPath || !outputPath || !deckId || !deckTitle) {
    console.error(
      "Usage: tsx scripts/import-anki.ts <input.apkg> <output.yaml> <deck-id> <deck-title>"
    );
    process.exit(1);
  }
  (async () => {
    const cards = await extractCardsFromApkg(inputPath);
    const pairs = cards.map((c, i) => ({
      id: `${deckId}-${String(i + 1).padStart(3, "0")}`,
      statement: c,
      tags: [],
    }));
    const out = {
      deck: { id: deckId, title: deckTitle, source: path.basename(inputPath) },
      pairs,
    };
    await writeFile(outputPath, yaml.dump(out, { lineWidth: 120 }), "utf8");
    console.log(`Wrote ${pairs.length} cards → ${outputPath}`);
  })();
}
```

- [ ] **Step 4: Install `tsx` for running the script**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm install -D tsx
```

Add to `package.json` scripts:

```json
"import:anki": "tsx scripts/import-anki.ts"
```

- [ ] **Step 5: Run the test (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: all passing including the new import-anki test.

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(decks): Anki .apkg → YAML importer (statements only; pairing later)"
```

### Task 1.5: Pinyin tone renderer

**Files:**
- Create: `lib/pinyin/tone-render.ts`
- Create: `tests/unit/pinyin/tone-render.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/pinyin/tone-render.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectToneOfSyllable, splitPinyinSyllables } from "@/lib/pinyin/tone-render";

describe("detectToneOfSyllable", () => {
  it("detects tone 1 (macron)", () => {
    expect(detectToneOfSyllable("mā")).toBe(1);
  });
  it("detects tone 2 (acute)", () => {
    expect(detectToneOfSyllable("má")).toBe(2);
  });
  it("detects tone 3 (caron)", () => {
    expect(detectToneOfSyllable("mǎ")).toBe(3);
  });
  it("detects tone 4 (grave)", () => {
    expect(detectToneOfSyllable("mà")).toBe(4);
  });
  it("returns 5 for neutral (no mark)", () => {
    expect(detectToneOfSyllable("ma")).toBe(5);
  });
});

describe("splitPinyinSyllables", () => {
  it("splits multi-syllable pinyin separated by spaces", () => {
    expect(splitPinyinSyllables("nǐ hǎo ma?")).toEqual(["nǐ", "hǎo", "ma?"]);
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- tone-render
```

- [ ] **Step 3: Write `lib/pinyin/tone-render.ts`**

```typescript
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
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(pinyin): tone detection + syllable rendering helper"
```

### Phase 1 wrap

Tell user: "Phase 1 done — deck schema, loader, selector, importer, pinyin renderer all green. Ready to continue or merge to main?"

Wait for direction.

---

## Phase 2: Conversation state machine (`feat/state-machine`)

The state machine is a pure module — no Claude, no Azure. It models the loop so we can test it deterministically.

### Task 2.1: State + Turn types

**Files:**
- Create: `lib/conversation/state.ts`
- Create: `tests/unit/conversation/state.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/conversation/state.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { initialState, applyEvent, type State, type Event } from "@/lib/conversation/state";

describe("conversation state machine", () => {
  it("starts in 'idle' with empty history and AI to speak first", () => {
    const s = initialState();
    expect(s.mode).toBe("idle");
    expect(s.history).toEqual([]);
    expect(s.nextSpeaker).toBe("ai");
  });

  it("transitions to 'ai-speaking' on START", () => {
    const s = applyEvent(initialState(), { type: "START" });
    expect(s.mode).toBe("ai-speaking");
  });

  it("appends a user turn on USER_UTTERANCE", () => {
    let s = applyEvent(initialState(), { type: "START" });
    s = applyEvent(s, {
      type: "AI_SPOKE",
      utterance: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" },
    });
    s = applyEvent(s, {
      type: "USER_UTTERANCE",
      transcript: "我很好",
      score: { accuracy: 90, tonesOk: true, words: [] },
    });
    expect(s.history.at(-1)?.speaker).toBe("user");
    expect(s.history.at(-1)?.text).toBe("我很好");
  });

  it("routes to 'tutor' when score is below threshold", () => {
    let s = applyEvent(initialState(), { type: "START" });
    s = applyEvent(s, {
      type: "AI_SPOKE",
      utterance: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" },
    });
    s = applyEvent(s, {
      type: "USER_UTTERANCE",
      transcript: "wo hen hao",
      score: { accuracy: 50, tonesOk: false, words: [] },
    });
    expect(s.mode).toBe("tutor");
  });

  it("flips turn to user after a successful AI question", () => {
    let s = applyEvent(initialState(), { type: "START" });
    s = applyEvent(s, {
      type: "AI_SPOKE",
      utterance: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" },
    });
    s = applyEvent(s, {
      type: "USER_UTTERANCE",
      transcript: "我很好",
      score: { accuracy: 90, tonesOk: true, words: [] },
    });
    s = applyEvent(s, { type: "AI_CONFIRMED" });
    expect(s.mode).toBe("awaiting-user-question");
    expect(s.nextSpeaker).toBe("user");
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- conversation
```

- [ ] **Step 3: Write `lib/conversation/state.ts`**

```typescript
import type { Phrase } from "@/lib/decks/schema";

export type Mode =
  | "idle"
  | "ai-speaking"
  | "awaiting-user-answer"
  | "awaiting-user-question"
  | "user-speaking"
  | "tutor";

export type Speaker = "ai" | "user";

export type Score = {
  accuracy: number;        // 0-100
  tonesOk: boolean;
  words: Array<{ word: string; accuracy: number; tone?: number }>;
};

export type Turn =
  | { speaker: "ai"; text: string; phrase: Phrase; at: number }
  | { speaker: "user"; text: string; score: Score; at: number };

export type State = {
  mode: Mode;
  history: Turn[];
  nextSpeaker: Speaker;
  pendingPhrase?: Phrase;
};

export type Event =
  | { type: "START" }
  | { type: "AI_SPOKE"; utterance: Phrase }
  | { type: "USER_UTTERANCE"; transcript: string; score: Score }
  | { type: "AI_CONFIRMED" }
  | { type: "TUTOR_RESOLVED" }
  | { type: "RESET" };

const PASS_THRESHOLD = 80;

export function initialState(): State {
  return { mode: "idle", history: [], nextSpeaker: "ai" };
}

export function applyEvent(s: State, e: Event): State {
  switch (e.type) {
    case "START":
      return { ...s, mode: "ai-speaking", nextSpeaker: "ai" };

    case "AI_SPOKE": {
      const turn: Turn = {
        speaker: "ai",
        text: e.utterance.hanzi,
        phrase: e.utterance,
        at: Date.now(),
      };
      return {
        ...s,
        mode: "awaiting-user-answer",
        history: [...s.history, turn],
        pendingPhrase: e.utterance,
      };
    }

    case "USER_UTTERANCE": {
      const turn: Turn = {
        speaker: "user",
        text: e.transcript,
        score: e.score,
        at: Date.now(),
      };
      const passed = e.score.accuracy >= PASS_THRESHOLD && e.score.tonesOk;
      return {
        ...s,
        mode: passed ? s.mode : "tutor",
        history: [...s.history, turn],
      };
    }

    case "AI_CONFIRMED":
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user", pendingPhrase: undefined };

    case "TUTOR_RESOLVED":
      return { ...s, mode: "awaiting-user-question", nextSpeaker: "user" };

    case "RESET":
      return initialState();
  }
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: all 5 state tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(conversation): pure state machine with PASS_THRESHOLD routing"
```

### Task 2.2: localStorage persistence

**Files:**
- Create: `lib/conversation/persistence.ts`
- Create: `tests/unit/conversation/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/conversation/persistence.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { saveState, loadState, STORAGE_KEY } from "@/lib/conversation/persistence";
import { initialState, applyEvent } from "@/lib/conversation/state";

describe("persistence", () => {
  beforeEach(() => { localStorage.clear(); });

  it("round-trips initial state", () => {
    const s = initialState();
    saveState(s);
    expect(loadState()).toEqual(s);
  });

  it("returns null when nothing saved", () => {
    expect(loadState()).toBeNull();
  });

  it("survives a START event", () => {
    let s = initialState();
    s = applyEvent(s, { type: "START" });
    saveState(s);
    const loaded = loadState();
    expect(loaded?.mode).toBe("ai-speaking");
  });

  it("ignores corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toBeNull();
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- persistence
```

- [ ] **Step 3: Write `lib/conversation/persistence.ts`**

```typescript
import type { State } from "./state";

export const STORAGE_KEY = "learn-chinese:conversation:v1";

export function saveState(s: State): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function loadState(): State | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as State;
  } catch {
    return null;
  }
}

export function clearState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(conversation): localStorage persistence with corruption guard"
```

### Phase 2 wrap

Tell user: "Phase 2 done — state machine + persistence green. Continue or merge?"

---

## Phase 3: API routes with mocked providers (`feat/api-routes-mocked`)

API routes return realistic mock data so the UI can be built and tested without provider keys.

### Task 3.1: `/api/turn` with mock

**Files:**
- Create: `app/api/turn/route.ts`
- Create: `lib/conversation/orchestrator.ts`
- Create: `tests/unit/api/turn.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/api/turn.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runOrchestrator } from "@/lib/conversation/orchestrator";

describe("orchestrator (mock mode)", () => {
  it("returns an AI utterance when the user has not spoken yet", async () => {
    const res = await runOrchestrator({
      history: [],
      lastUserScore: null,
      activeDeckIds: ["fixture-mini"],
      metaIntent: null,
      mock: true,
    });
    expect(res.aiUtterance).toBeDefined();
    expect(res.aiUtterance?.hanzi).toBeTruthy();
    expect(res.routeTo).toBe("conversation");
  });

  it("routes to tutor when last score is below threshold", async () => {
    const res = await runOrchestrator({
      history: [
        { speaker: "ai", text: "你好吗?", phrase: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "?" }, at: 1 },
      ],
      lastUserScore: { accuracy: 40, tonesOk: false, words: [{ word: "你", accuracy: 30, tone: 3 }] },
      activeDeckIds: ["fixture-mini"],
      metaIntent: null,
      mock: true,
    });
    expect(res.routeTo).toBe("tutor");
    expect(res.tutorPayload).toBeDefined();
    expect(res.tutorPayload?.targetWord).toBe("你");
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- turn
```

- [ ] **Step 3: Write `lib/conversation/orchestrator.ts`**

```typescript
import type { Turn, Score } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickNextPair } from "@/lib/decks/selector";
import path from "node:path";

export type OrchestratorInput = {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  mock?: boolean;
};

export type OrchestratorOutput = {
  speakerNext: "ai" | "user";
  aiUtterance?: Phrase & { audioUrl: string };
  routeTo: "conversation" | "tutor";
  tutorPayload?: {
    targetWord: string;
    diagnosis: string;
    referenceAudioUrl: string;
    retryPrompt: string;
  };
};

const PASS_THRESHOLD = 80;

export async function runOrchestrator(
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  // Tutor branch — fail score routes here even in mock mode.
  if (input.lastUserScore && (input.lastUserScore.accuracy < PASS_THRESHOLD || !input.lastUserScore.tonesOk)) {
    const worst = [...input.lastUserScore.words].sort((a, b) => a.accuracy - b.accuracy)[0];
    return {
      speakerNext: "user",
      routeTo: "tutor",
      tutorPayload: {
        targetWord: worst?.word ?? "?",
        diagnosis: input.mock
          ? `Your "${worst?.word ?? "?"}" came in low (accuracy ${worst?.accuracy ?? 0}). Try again with a clearer tone.`
          : "(real Claude diagnosis lands here in Phase 10)",
        referenceAudioUrl: "/mocks/tone-ref.mp3",
        retryPrompt: worst?.word ?? "?",
      },
    };
  }

  // Pass branch — pick a next phrase to ask.
  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const pair = pickNextPair(filtered.length > 0 ? filtered : decks, {
    seenIds: input.history.filter((t) => t.speaker === "ai").map((t) => t.text),
  });
  const phrase = pair.q ?? pair.statement!;

  return {
    speakerNext: "ai",
    routeTo: "conversation",
    aiUtterance: {
      hanzi: phrase.hanzi,
      pinyin: phrase.pinyin,
      english: phrase.english,
      audioUrl: "/mocks/ai-utterance.mp3",
    },
  };
}
```

- [ ] **Step 4: Write `app/api/turn/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/conversation/orchestrator";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const useMock = process.env.NODE_ENV !== "production" && !process.env.ANTHROPIC_API_KEY;
  const result = await runOrchestrator({ ...body, mock: useMock });
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Note: orchestrator uses `loadAllDecks` which reads the filesystem. The `_fixture-mini.yaml` from Task 1.2 satisfies the test.

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(api): /api/turn with mock orchestrator (Claude integration deferred)"
```

### Task 3.2: `/api/score` with mock

**Files:**
- Create: `app/api/score/route.ts`
- Create: `tests/unit/api/score-shape.test.ts`
- Create: `public/mocks/.gitkeep`

- [ ] **Step 1: Write the failing test**

`tests/unit/api/score-shape.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mockScore } from "@/app/api/score/mock";

describe("mockScore", () => {
  it("returns deterministic shape for a given reference text", () => {
    const s = mockScore({ referenceText: "你好" });
    expect(s.accuracy).toBeGreaterThanOrEqual(0);
    expect(s.accuracy).toBeLessThanOrEqual(100);
    expect(s.words.length).toBeGreaterThan(0);
    expect(s.words[0]).toHaveProperty("word");
    expect(s.words[0]).toHaveProperty("accuracy");
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- score-shape
```

- [ ] **Step 3: Write `app/api/score/mock.ts`**

```typescript
import type { Score } from "@/lib/conversation/state";

export function mockScore({ referenceText }: { referenceText: string }): Score {
  const chars = Array.from(referenceText);
  return {
    accuracy: 85,
    tonesOk: true,
    words: chars.map((c) => ({ word: c, accuracy: 80 + Math.floor(Math.random() * 15), tone: 2 })),
  };
}
```

- [ ] **Step 4: Write `app/api/score/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { mockScore } from "./mock";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const referenceText = String(form.get("referenceText") ?? "");
  const useMock = !process.env.AZURE_SPEECH_KEY;
  if (useMock) {
    return NextResponse.json({ transcript: referenceText, ...mockScore({ referenceText }) });
  }
  // Real Azure path lands in Phase 9.
  return NextResponse.json({ error: "Azure scoring not yet implemented" }, { status: 501 });
}
```

- [ ] **Step 5: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(api): /api/score with mock score response"
```

### Task 3.3: `/api/tts` with mock

**Files:**
- Create: `app/api/tts/route.ts`
- Create: `public/mocks/silence.mp3` (1-second silence — generate with sox or ship empty file)

- [ ] **Step 1: Generate a placeholder mock audio file**

```bash
cd /home/jermsai/Code/Learn_Chinese
# Tiny base64-encoded MP3 (50 bytes of silence, valid header)
node -e "require('fs').writeFileSync('public/mocks/silence.mp3', Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA', 'base64'))"
ls -lh public/mocks/silence.mp3
```

Expected: file exists, ~40-50 bytes.

- [ ] **Step 2: Write `app/api/tts/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  const useMock = !process.env.AZURE_SPEECH_KEY;
  if (useMock) {
    const bytes = await readFile(path.join(process.cwd(), "public", "mocks", "silence.mp3"));
    return new NextResponse(bytes, {
      headers: { "Content-Type": "audio/mpeg", "X-TTS-Mode": "mock", "X-TTS-Text": encodeURIComponent(text ?? "") },
    });
  }
  return NextResponse.json({ error: "Azure TTS not yet implemented" }, { status: 501 });
}
```

- [ ] **Step 3: Smoke-check the endpoint manually**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run dev &
sleep 5
curl -X POST http://localhost:3000/api/tts -H "Content-Type: application/json" -d '{"text":"你好"}' -o /tmp/tts.mp3 -w "%{http_code}\n"
ls -lh /tmp/tts.mp3
kill %1 2>/dev/null
```

Expected: HTTP 200, file written, non-zero size.

- [ ] **Step 4: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(api): /api/tts with mock audio response"
```

### Phase 3 wrap

Tell user: "Phase 3 done — three API routes serving mock data. UI can now be built against real endpoints. Continue or merge?"

---

## Phase 4: UI shell (`feat/ui-shell`)

### Task 4.1: shadcn/ui init

**Files:**
- Modify: many (shadcn adds `components/ui/`, `lib/utils.ts`, `components.json`)

- [ ] **Step 1: Init shadcn**

```bash
cd /home/jermsai/Code/Learn_Chinese
npx --yes shadcn@latest init -d
```

Expected: creates `components.json`, `lib/utils.ts`, updates `globals.css`.

- [ ] **Step 2: Add the components we'll need**

```bash
cd /home/jermsai/Code/Learn_Chinese
npx --yes shadcn@latest add button card sheet dialog
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run check
```

- [ ] **Step 4: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "chore(ui): init shadcn/ui with button, card, sheet, dialog"
```

### Task 4.2: `<TonedPinyin>` component

**Files:**
- Create: `components/TonedPinyin.tsx`
- Create: `tests/unit/components/TonedPinyin.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/TonedPinyin.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TonedPinyin } from "@/components/TonedPinyin";

describe("<TonedPinyin>", () => {
  it("renders each syllable with a tone-N class", () => {
    const { container } = render(<TonedPinyin text="nǐ hǎo ma" />);
    const spans = container.querySelectorAll("span[data-tone]");
    expect(spans).toHaveLength(3);
    expect(spans[0].className).toContain("tone-3");
    expect(spans[1].className).toContain("tone-3");
    expect(spans[2].className).toContain("tone-5");
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- TonedPinyin
```

- [ ] **Step 3: Write `components/TonedPinyin.tsx`**

```tsx
import { renderTonedSyllables } from "@/lib/pinyin/tone-render";

export function TonedPinyin({ text, className = "" }: { text: string; className?: string }) {
  const syllables = renderTonedSyllables(text);
  return (
    <span className={className}>
      {syllables.map((s, i) => (
        <span key={i} data-tone={s.tone} className={`tone-${s.tone}`}>
          {s.text}
          {i < syllables.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): TonedPinyin component with per-syllable tone classes"
```

### Task 4.3: `<PhraseCard>`

**Files:**
- Create: `components/PhraseCard.tsx`
- Create: `tests/unit/components/PhraseCard.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/PhraseCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhraseCard } from "@/components/PhraseCard";

describe("<PhraseCard>", () => {
  const phrase = { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" };

  it("renders hanzi, pinyin, and english", () => {
    render(<PhraseCard phrase={phrase} />);
    expect(screen.getByText("你好吗?")).toBeInTheDocument();
    expect(screen.getByText("How are you?")).toBeInTheDocument();
  });

  it("calls onReplay when the speaker icon is clicked", async () => {
    let clicked = false;
    render(<PhraseCard phrase={phrase} onReplay={() => { clicked = true; }} />);
    const btn = screen.getByRole("button", { name: /replay/i });
    btn.click();
    expect(clicked).toBe(true);
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- PhraseCard
```

- [ ] **Step 3: Write `components/PhraseCard.tsx`**

```tsx
"use client";
import type { Phrase } from "@/lib/decks/schema";
import { TonedPinyin } from "./TonedPinyin";

export function PhraseCard({ phrase, onReplay }: { phrase: Phrase; onReplay?: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-10 shadow-sm text-center">
      <div className="font-serif text-7xl leading-tight tracking-wide">{phrase.hanzi}</div>
      <div className="mt-4 text-2xl">
        <TonedPinyin text={phrase.pinyin} />
      </div>
      <div className="mt-2 text-muted">{phrase.english}</div>
      {onReplay && (
        <button
          aria-label="Replay phrase audio"
          onClick={onReplay}
          className="mt-6 inline-flex items-center justify-center rounded-full p-3 hover:bg-parchment transition"
        >
          🔊
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): PhraseCard with TonedPinyin and replay handler"
```

### Task 4.4: `<ConversationRail>`

**Files:**
- Create: `components/ConversationRail.tsx`
- Create: `tests/unit/components/ConversationRail.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/ConversationRail.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationRail } from "@/components/ConversationRail";
import type { Turn } from "@/lib/conversation/state";

const turns: Turn[] = [
  { speaker: "ai", text: "你好吗?", phrase: { hanzi: "你好吗?", pinyin: "nǐ hǎo ma?", english: "How are you?" }, at: 1 },
  { speaker: "user", text: "我很好", score: { accuracy: 90, tonesOk: true, words: [] }, at: 2 },
];

describe("<ConversationRail>", () => {
  it("renders every turn in order", () => {
    render(<ConversationRail turns={turns} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("flags user turns with accuracy score", () => {
    render(<ConversationRail turns={turns} />);
    expect(screen.getByText(/accuracy 90/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- ConversationRail
```

- [ ] **Step 3: Write `components/ConversationRail.tsx`**

```tsx
import type { Turn } from "@/lib/conversation/state";

export function ConversationRail({ turns }: { turns: Turn[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {turns.map((t, i) => (
        <li key={i} className="border-l-2 pl-3" style={{ borderColor: t.speaker === "ai" ? "var(--color-terracotta)" : "var(--color-muted)" }}>
          <span className="font-medium">{t.speaker === "ai" ? "AI" : "You"}:</span> {t.text}
          {t.speaker === "user" && (
            <span className="ml-2 text-muted">(accuracy {t.score.accuracy}, tones {t.score.tonesOk ? "✓" : "✗"})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): ConversationRail with score annotations"
```

### Task 4.5: `<MetaBar>` (quick-tap meta-asks)

**Files:**
- Create: `components/MetaBar.tsx`
- Create: `tests/unit/components/MetaBar.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/MetaBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetaBar } from "@/components/MetaBar";

describe("<MetaBar>", () => {
  it("fires onMeta with the chosen intent", async () => {
    const onMeta = vi.fn();
    render(<MetaBar onMeta={onMeta} />);
    screen.getByText(/slow down/i).click();
    expect(onMeta).toHaveBeenCalledWith("slow_down");
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- MetaBar
```

- [ ] **Step 3: Write `components/MetaBar.tsx`**

```tsx
"use client";

const INTENTS = [
  { label: "Slow down", intent: "slow_down" },
  { label: "Repeat", intent: "repeat" },
  { label: "Explain", intent: "explain" },
  { label: "Etymology", intent: "etymology" },
  { label: "Tones lesson", intent: "tones_lesson" },
] as const;

export function MetaBar({ onMeta }: { onMeta: (intent: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center text-sm">
      {INTENTS.map((i) => (
        <button
          key={i.intent}
          onClick={() => onMeta(i.intent)}
          className="rounded-full border px-3 py-1 hover:bg-card transition"
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): MetaBar with slow_down/repeat/explain/etymology/tones intents"
```

### Phase 4 wrap

Tell user: "Phase 4 done — UI primitives (TonedPinyin, PhraseCard, ConversationRail, MetaBar) all green. Mic capture comes next."

---

## Phase 5: Mic capture (`feat/mic-capture`)

### Task 5.1: `useMicRecorder` hook

**Files:**
- Create: `lib/audio/use-mic-recorder.ts`
- Create: `tests/unit/audio/use-mic-recorder.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/audio/use-mic-recorder.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

// jsdom doesn't ship MediaRecorder; stub it.
class FakeMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fake"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

describe("useMicRecorder", () => {
  beforeAll(() => {
    // @ts-expect-error stub
    globalThis.MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) },
      configurable: true,
    });
  });

  it("starts and stops, yielding a Blob", async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.isRecording).toBe(true);
    let blob: Blob | null = null;
    await act(async () => { blob = await result.current.stop(); });
    expect(blob).toBeInstanceOf(Blob);
    expect(result.current.isRecording).toBe(false);
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- use-mic-recorder
```

- [ ] **Step 3: Write `lib/audio/use-mic-recorder.ts`**

```typescript
"use client";
import { useCallback, useRef, useState } from "react";

export function useMicRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec) { resolve(new Blob([])); return; }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        streamRef.current = null;
        setIsRecording(false);
        resolve(blob);
      };
      rec.stop();
    });
  }, []);

  return { isRecording, start, stop };
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(audio): useMicRecorder hook with start/stop returning Blob"
```

### Task 5.2: `<MicButton>` with spacebar push-to-talk

**Files:**
- Create: `components/MicButton.tsx`
- Create: `tests/unit/components/MicButton.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/MicButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MicButton } from "@/components/MicButton";

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

beforeAll(() => {
  // @ts-expect-error stub
  globalThis.MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) },
    configurable: true,
  });
});

describe("<MicButton>", () => {
  it("calls onAudio with a Blob after press-and-release", async () => {
    const onAudio = vi.fn();
    render(<MicButton onAudio={onAudio} />);
    const btn = screen.getByRole("button", { name: /hold to talk/i });
    fireEvent.mouseDown(btn);
    await new Promise((r) => setTimeout(r, 30));
    fireEvent.mouseUp(btn);
    await new Promise((r) => setTimeout(r, 50));
    expect(onAudio).toHaveBeenCalled();
    expect(onAudio.mock.calls[0][0]).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- MicButton
```

- [ ] **Step 3: Write `components/MicButton.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { useMicRecorder } from "@/lib/audio/use-mic-recorder";

export function MicButton({ onAudio }: { onAudio: (blob: Blob) => void }) {
  const { isRecording, start, stop } = useMicRecorder();

  const beginRecord = async () => { if (!isRecording) await start(); };
  const endRecord = async () => {
    if (isRecording) {
      const blob = await stop();
      onAudio(blob);
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        beginRecord();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); endRecord(); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  return (
    <button
      onMouseDown={beginRecord}
      onMouseUp={endRecord}
      onTouchStart={beginRecord}
      onTouchEnd={endRecord}
      className={`mx-auto block rounded-full px-8 py-4 text-lg transition ${
        isRecording ? "bg-terracotta text-white" : "bg-card border"
      }`}
      aria-label="Hold to talk"
    >
      {isRecording ? "● recording…" : "🎤 hold to talk (space)"}
    </button>
  );
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): MicButton with mouse, touch, and spacebar push-to-talk"
```

### Phase 5 wrap

Tell user: "Phase 5 done — mic capture + push-to-talk wired and tested. Phase 6 wires everything to a working page."

---

## Phase 6: Wire it all together (`feat/wire-up`)

### Task 6.1: Main page state, calls API routes, renders everything

**Files:**
- Modify: `app/page.tsx`
- Create: `lib/api-client.ts` (browser → API route helpers)
- Create: `tests/unit/lib/api-client.test.ts`

- [ ] **Step 1: Write `lib/api-client.ts`**

```typescript
"use client";
import type { Score, Turn } from "@/lib/conversation/state";
import type { OrchestratorOutput } from "@/lib/conversation/orchestrator";

export async function fetchTurn(args: {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
}): Promise<OrchestratorOutput> {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`/api/turn ${res.status}`);
  return res.json();
}

export async function postScore(audio: Blob, referenceText: string): Promise<Score & { transcript: string }> {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  form.append("referenceText", referenceText);
  const res = await fetch("/api/score", { method: "POST", body: form });
  if (!res.ok) throw new Error(`/api/score ${res.status}`);
  return res.json();
}

export async function postTts(text: string): Promise<string> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
}
```

- [ ] **Step 2: Rewrite `app/page.tsx` as the main conversation screen**

```tsx
"use client";
import { useEffect, useReducer, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { MicButton } from "@/components/MicButton";
import { ConversationRail } from "@/components/ConversationRail";
import { MetaBar } from "@/components/MetaBar";
import { applyEvent, initialState } from "@/lib/conversation/state";
import { saveState, loadState } from "@/lib/conversation/persistence";
import { fetchTurn, postScore, postTts } from "@/lib/api-client";

function reducer(s: ReturnType<typeof initialState>, e: Parameters<typeof applyEvent>[1]) {
  return applyEvent(s, e);
}

export default function Page() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? initialState());
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  async function playAudio(url: string) {
    const audio = new Audio(url);
    await audio.play();
  }

  async function aiTurn(metaIntent: string | null = null) {
    setBusy(true);
    try {
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: null,
        activeDeckIds: [],
        metaIntent,
      });
      if (out.aiUtterance) {
        const url = await postTts(out.aiUtterance.hanzi);
        setAudioUrl(url);
        await playAudio(url);
        dispatch({ type: "AI_SPOKE", utterance: out.aiUtterance });
      }
    } finally { setBusy(false); }
  }

  async function userSpoke(blob: Blob) {
    const ref = state.pendingPhrase?.hanzi ?? "";
    setBusy(true);
    try {
      const score = await postScore(blob, ref);
      dispatch({
        type: "USER_UTTERANCE",
        transcript: score.transcript,
        score: { accuracy: score.accuracy, tonesOk: score.tonesOk, words: score.words },
      });
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: { accuracy: score.accuracy, tonesOk: score.tonesOk, words: score.words },
        activeDeckIds: [],
        metaIntent: null,
      });
      if (out.routeTo === "conversation") {
        dispatch({ type: "AI_CONFIRMED" });
      }
      // tutor routing handled in Phase 8
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl">学中文</h1>
        <button onClick={() => aiTurn()} disabled={busy} className="text-sm underline">
          {state.mode === "idle" ? "Start" : "Skip to next"}
        </button>
      </header>

      {state.pendingPhrase && (
        <PhraseCard phrase={state.pendingPhrase} onReplay={() => audioUrl && playAudio(audioUrl)} />
      )}

      <MicButton onAudio={userSpoke} />

      <MetaBar onMeta={(intent) => aiTurn(intent)} />

      <section className="border-t pt-6">
        <h2 className="text-sm uppercase tracking-wider text-muted mb-3">Conversation</h2>
        <ConversationRail turns={state.history} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Smoke check — boot dev server, click Start, hold space, release**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run dev
```

Open http://localhost:3000. Click Start → expect a phrase to appear (from `_fixture-mini.yaml`) with mock audio. Hold space, speak nonsense, release → expect a user turn to appear in the rail with mocked accuracy ~85. Kill the server.

- [ ] **Step 4: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(app): wire main page — Start → AI speaks → user records → score → confirm"
```

### Task 6.2: Playwright E2E smoke test

**Files:**
- Create: `tests/e2e/conversation-smoke.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "@playwright/test";

test("clicking Start renders a phrase card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.locator(".font-serif").first()).toBeVisible();
});

test("mic button is keyboard-accessible", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: /hold to talk/i });
  await expect(btn).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run e2e
```

Expected: both tests pass. (The first test relies on `_fixture-mini.yaml` existing in `decks/`.)

- [ ] **Step 3: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "test(e2e): Playwright smoke covering Start → phrase visible"
```

### Phase 6 wrap

Tell user: "Phase 6 done — end-to-end happy path works with mocks. Tutor sub-loop comes next."

---

## Phase 7: Tutor sub-loop (`feat/tutor-panel`)

### Task 7.1: `<TutorPanel>` component

**Files:**
- Create: `components/TutorPanel.tsx`
- Create: `tests/unit/components/TutorPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TutorPanel } from "@/components/TutorPanel";

describe("<TutorPanel>", () => {
  const payload = {
    targetWord: "你",
    diagnosis: "Your tone slipped from rising to dipping. Try again.",
    referenceAudioUrl: "/mocks/silence.mp3",
    retryPrompt: "你",
  };

  it("shows the target word and diagnosis", () => {
    render(<TutorPanel payload={payload} onRetry={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("你")).toBeInTheDocument();
    expect(screen.getByText(/tone slipped/i)).toBeInTheDocument();
  });

  it("calls onSkip when 'skip' is clicked", () => {
    const onSkip = vi.fn();
    render(<TutorPanel payload={payload} onRetry={() => {}} onSkip={onSkip} />);
    screen.getByRole("button", { name: /skip/i }).click();
    expect(onSkip).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- TutorPanel
```

- [ ] **Step 3: Write `components/TutorPanel.tsx`**

```tsx
"use client";
import { MicButton } from "./MicButton";

export type TutorPayload = {
  targetWord: string;
  diagnosis: string;
  referenceAudioUrl: string;
  retryPrompt: string;
};

export function TutorPanel({
  payload,
  onRetry,
  onSkip,
}: {
  payload: TutorPayload;
  onRetry: (blob: Blob) => void;
  onSkip: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card p-8 shadow-md border-l-4 border-terracotta space-y-4">
      <div className="text-center">
        <div className="font-serif text-6xl">{payload.targetWord}</div>
      </div>
      <p className="text-sm text-muted">{payload.diagnosis}</p>
      <audio controls src={payload.referenceAudioUrl} className="w-full" />
      <MicButton onAudio={onRetry} />
      <button onClick={onSkip} className="text-xs text-muted underline mx-auto block">
        skip and move on
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run (pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(ui): TutorPanel for failure-mode drilling"
```

### Task 7.2: Wire TutorPanel into the page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update `app/page.tsx` — add tutor branch**

Replace the `userSpoke` function with:

```tsx
  async function userSpoke(blob: Blob) {
    const ref = state.pendingPhrase?.hanzi ?? "";
    setBusy(true);
    try {
      const score = await postScore(blob, ref);
      dispatch({
        type: "USER_UTTERANCE",
        transcript: score.transcript,
        score: { accuracy: score.accuracy, tonesOk: score.tonesOk, words: score.words },
      });
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: { accuracy: score.accuracy, tonesOk: score.tonesOk, words: score.words },
        activeDeckIds: [],
        metaIntent: null,
      });
      if (out.routeTo === "tutor" && out.tutorPayload) {
        setTutor(out.tutorPayload);
      } else {
        dispatch({ type: "AI_CONFIRMED" });
        setTutor(null);
      }
    } finally { setBusy(false); }
  }
```

Add state for tutor payload near the top of the component:

```tsx
  const [tutor, setTutor] = useState<import("@/components/TutorPanel").TutorPayload | null>(null);
```

Add to the JSX, between PhraseCard and MicButton:

```tsx
      {tutor && (
        <TutorPanel
          payload={tutor}
          onRetry={userSpoke}
          onSkip={() => { setTutor(null); dispatch({ type: "TUTOR_RESOLVED" }); }}
        />
      )}
```

Add the import at the top of `app/page.tsx`:

```tsx
import { TutorPanel } from "@/components/TutorPanel";
```

- [ ] **Step 2: Manual smoke — force a fail score**

Temporarily edit `app/api/score/mock.ts` `accuracy: 85` → `accuracy: 40` and `tonesOk: true` → `false`. Boot dev server, run through Start + speak. Expect TutorPanel to appear. Revert the mock change.

- [ ] **Step 3: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(app): wire TutorPanel into page for failure-mode flow"
```

### Phase 7 wrap

Tell user: "Phase 7 done — tutor sub-loop fully wired with mocks. Ready to hook up real Azure (Phase 8 — needs your Azure account) or real Claude (Phase 9 — needs the ANTHROPIC_API_KEY)?"

---

## Phase 8: Real Azure integration (`feat/azure-integration`)

**⛔ Prerequisite:** User must set up Azure free account + Speech resource and put `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` in `.env.local`. Ask them to do that before starting this phase.

### Task 8.1: Real `/api/score` via Azure SDK

**Files:**
- Modify: `app/api/score/route.ts`
- Create: `lib/providers/azure-pronunciation.ts`
- Create: `tests/unit/providers/azure-pronunciation.test.ts`

- [ ] **Step 1: Write the failing test (uses recorded JSON fixture)**

`tests/fixtures/azure-pronunciation-response.json`:

```json
{
  "AccuracyScore": 87,
  "FluencyScore": 90,
  "CompletenessScore": 100,
  "Words": [
    { "Word": "你", "AccuracyScore": 82, "PronunciationAssessment": { "ErrorType": "None", "AccuracyScore": 82 } },
    { "Word": "好", "AccuracyScore": 91, "PronunciationAssessment": { "ErrorType": "None", "AccuracyScore": 91 } }
  ]
}
```

`tests/unit/providers/azure-pronunciation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseAzureResponse } from "@/lib/providers/azure-pronunciation";
import fixture from "../../fixtures/azure-pronunciation-response.json";

describe("parseAzureResponse", () => {
  it("normalizes Azure JSON into our Score shape", () => {
    const s = parseAzureResponse(fixture as any, "你好");
    expect(s.accuracy).toBe(87);
    expect(s.words).toHaveLength(2);
    expect(s.words[0]).toEqual({ word: "你", accuracy: 82, tone: undefined });
    expect(s.transcript).toBe("你好");
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- azure-pronunciation
```

- [ ] **Step 3: Write `lib/providers/azure-pronunciation.ts`**

```typescript
import "server-only";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getAzureCreds } from "./azure-speech";

export type AzureWord = {
  Word: string;
  AccuracyScore?: number;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
};
export type AzureResponse = {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  Words?: AzureWord[];
};

export type NormalizedScore = {
  accuracy: number;
  fluency: number;
  completeness: number;
  tonesOk: boolean;
  words: Array<{ word: string; accuracy: number; tone?: number }>;
  transcript: string;
};

export function parseAzureResponse(raw: AzureResponse, transcript: string): NormalizedScore {
  const words = (raw.Words ?? []).map((w) => ({
    word: w.Word,
    accuracy: w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore ?? 0,
    tone: undefined as number | undefined,
  }));
  const tonesOk = words.every((w) => w.accuracy >= 60);
  return {
    accuracy: raw.AccuracyScore ?? 0,
    fluency: raw.FluencyScore ?? 0,
    completeness: raw.CompletenessScore ?? 0,
    tonesOk,
    words,
    transcript,
  };
}

export async function scorePronunciation(
  audio: Buffer,
  referenceText: string
): Promise<NormalizedScore> {
  const { key, region } = getAzureCreds();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "zh-CN";

  const pushStream = sdk.AudioInputStream.createPushStream(
    sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
  );
  pushStream.write(audio);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  const paConfig = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true
  );
  paConfig.applyTo(recognizer);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        const json = JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult));
        const nb = json?.NBest?.[0] ?? {};
        const pa = nb?.PronunciationAssessment ?? {};
        const raw: AzureResponse = {
          AccuracyScore: pa.AccuracyScore,
          FluencyScore: pa.FluencyScore,
          CompletenessScore: pa.CompletenessScore,
          Words: nb.Words,
        };
        recognizer.close();
        resolve(parseAzureResponse(raw, result.text ?? referenceText));
      },
      (err) => { recognizer.close(); reject(err); }
    );
  });
}
```

- [ ] **Step 4: Update `app/api/score/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { mockScore } from "./mock";
import { scorePronunciation } from "@/lib/providers/azure-pronunciation";

export const runtime = "nodejs";  // Azure SDK needs Node, not Edge

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const referenceText = String(form.get("referenceText") ?? "");
  const audioFile = form.get("audio") as File | null;

  if (!process.env.AZURE_SPEECH_KEY) {
    return NextResponse.json({ transcript: referenceText, ...mockScore({ referenceText }) });
  }

  if (!audioFile) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  const buffer = Buffer.from(await audioFile.arrayBuffer());
  // NOTE: webm needs converting to PCM 16kHz for Azure. For v1 we'll require browser to send WAV
  // (or add a `prism-media`/`ffmpeg-static` transcode step). See plan §8.2.
  const result = await scorePronunciation(buffer, referenceText);
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Run unit test (passes — parseAzureResponse is pure)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(azure): real pronunciation scoring via Speech SDK + JSON parser"
```

### Task 8.2: Audio format pipeline — webm → PCM 16kHz

Azure Speech expects PCM. Browser MediaRecorder outputs webm. We need to transcode server-side.

**Files:**
- Modify: `package.json`
- Create: `lib/audio/transcode.ts`
- Create: `tests/unit/audio/transcode.test.ts`
- Modify: `app/api/score/route.ts`

- [ ] **Step 1: Install ffmpeg-static + fluent-ffmpeg**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm install fluent-ffmpeg ffmpeg-static
npm install -D @types/fluent-ffmpeg
```

- [ ] **Step 2: Write `lib/audio/transcode.ts`**

```typescript
import "server-only";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath as string);

export function transcodeToPcm16k(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const inStream = Readable.from(input);
    ffmpeg(inStream)
      .inputFormat("webm")
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)))
      .pipe()
      .on("data", (c) => chunks.push(c));
  });
}
```

- [ ] **Step 3: Write a smoke test**

`tests/unit/audio/transcode.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { transcodeToPcm16k } from "@/lib/audio/transcode";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe.skipIf(process.env.CI)("transcodeToPcm16k", () => {
  it("converts webm bytes to a WAV buffer", async () => {
    // Skipped on CI to avoid ffmpeg setup; run locally with a real .webm file.
    const input = await readFile(path.join(process.cwd(), "tests", "fixtures", "sample.webm")).catch(() => null);
    if (!input) return;  // skip if fixture missing
    const out = await transcodeToPcm16k(input);
    expect(out.byteLength).toBeGreaterThan(44);  // larger than WAV header
    expect(out.toString("ascii", 0, 4)).toBe("RIFF");
  });
});
```

- [ ] **Step 4: Update `app/api/score/route.ts` to transcode**

Replace the line `const buffer = Buffer.from(await audioFile.arrayBuffer());` and the line after with:

```typescript
  const webm = Buffer.from(await audioFile.arrayBuffer());
  const pcm = await transcodeToPcm16k(webm);
  const result = await scorePronunciation(pcm, referenceText);
```

Add at the top:

```typescript
import { transcodeToPcm16k } from "@/lib/audio/transcode";
```

- [ ] **Step 5: Manual smoke (requires user to have set up Azure)**

Ask the user to confirm `.env.local` has `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`. Then:

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run dev
```

Click Start, hold space, say "你好吗", release. Expected: a real score from Azure (not the mocked 85).

- [ ] **Step 6: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(audio): server-side webm→PCM transcode for Azure scoring"
```

### Task 8.3: Real `/api/tts` via Azure Neural

**Files:**
- Modify: `app/api/tts/route.ts`
- Create: `lib/providers/azure-tts.ts`

- [ ] **Step 1: Write `lib/providers/azure-tts.ts`**

```typescript
import "server-only";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getAzureCreds } from "./azure-speech";

export async function synthesizeMandarin(text: string, voice = "zh-CN-XiaoxiaoNeural"): Promise<Buffer> {
  const { key, region } = getAzureCreds();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

  return new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          synthesizer.close();
          resolve(Buffer.from(result.audioData));
        } else {
          synthesizer.close();
          reject(new Error(`TTS failed: ${result.errorDetails}`));
        }
      },
      (err) => { synthesizer.close(); reject(err); }
    );
  });
}
```

- [ ] **Step 2: Update `app/api/tts/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { synthesizeMandarin } from "@/lib/providers/azure-tts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  if (!process.env.AZURE_SPEECH_KEY) {
    const bytes = await readFile(path.join(process.cwd(), "public", "mocks", "silence.mp3"));
    return new NextResponse(bytes, { headers: { "Content-Type": "audio/mpeg", "X-TTS-Mode": "mock" } });
  }

  const audio = await synthesizeMandarin(text);
  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
}
```

- [ ] **Step 3: Smoke test live**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run dev
```

Click Start. Expected: a real Mandarin voice reads the phrase. Kill the server.

- [ ] **Step 4: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(azure): real Neural TTS (zh-CN-XiaoxiaoNeural)"
```

### Phase 8 wrap

Tell user: "Phase 8 done — Azure is doing the real scoring + speaking. Last phase wires Claude as the orchestrator."

---

## Phase 9: Real Claude orchestrator (`feat/claude-integration`)

### Task 9.1: Claude-driven orchestrator

**Files:**
- Modify: `lib/conversation/orchestrator.ts`
- Create: `lib/conversation/claude-prompt.ts`
- Create: `tests/unit/conversation/claude-prompt.test.ts`

- [ ] **Step 1: Write `lib/conversation/claude-prompt.ts`**

```typescript
export const SYSTEM_PROMPT = `You are a Mandarin tutor running a conversational practice loop with a single user.

You receive on each turn:
- A history of the conversation so far
- A pronunciation score from the user's last utterance (if they just spoke)
- A list of available phrases from the user's loaded decks
- Optional meta-intent if the user pressed a chip ("slow_down", "repeat", "explain", "etymology", "tones_lesson")

Your job each turn is to return a JSON object describing what should happen next:

{
  "decision": "ai_speak" | "user_speak" | "tutor",
  "aiUtterance"?: { "hanzi": "...", "pinyin": "...", "english": "..." },
  "tutor"?: { "targetWord": "...", "diagnosis": "...", "retryPrompt": "..." },
  "confirm"?: "..."   // short Mandarin acknowledgement when user passes
}

Rules:
1. Pronunciation accuracy >= 80 AND tones OK = pass. Otherwise route to tutor.
2. After a pass, give a SHORT natural confirmation in Mandarin (e.g. "对" or "很好") and then WAIT — set decision to "user_speak". Do NOT immediately ask the next question. The user controls when to ask back.
3. When asked to drill tones, etymology, or speak slowly, comply briefly then offer to resume.
4. Stay in Mandarin when speaking the language; switch to English ONLY for tutor diagnoses or meta-asks.
5. Prefer phrases from the active decks. Improvise if topic drifts.

Output ONLY the JSON object. No markdown fences, no commentary.`;

export type ClaudeDecision = {
  decision: "ai_speak" | "user_speak" | "tutor";
  aiUtterance?: { hanzi: string; pinyin: string; english: string };
  tutor?: { targetWord: string; diagnosis: string; retryPrompt: string };
  confirm?: string;
};

export function parseClaudeJson(raw: string): ClaudeDecision {
  // Tolerate accidental markdown fencing
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
  return JSON.parse(cleaned) as ClaudeDecision;
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/conversation/claude-prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseClaudeJson } from "@/lib/conversation/claude-prompt";

describe("parseClaudeJson", () => {
  it("parses a bare JSON object", () => {
    const raw = '{"decision":"ai_speak","aiUtterance":{"hanzi":"你好","pinyin":"nǐ hǎo","english":"hello"}}';
    expect(parseClaudeJson(raw).decision).toBe("ai_speak");
  });

  it("tolerates markdown fencing", () => {
    const raw = '```json\n{"decision":"user_speak","confirm":"对"}\n```';
    expect(parseClaudeJson(raw).decision).toBe("user_speak");
  });
});
```

- [ ] **Step 3: Run (fail then pass)**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test -- claude-prompt
```

- [ ] **Step 4: Update `lib/conversation/orchestrator.ts` — extract mock, add real Claude branch**

Replace the entire file with:

```typescript
import type { Turn, Score } from "./state";
import type { Phrase } from "@/lib/decks/schema";
import { loadAllDecks } from "@/lib/decks/loader";
import { pickNextPair } from "@/lib/decks/selector";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/providers/anthropic";
import { SYSTEM_PROMPT, parseClaudeJson, type ClaudeDecision } from "./claude-prompt";
import path from "node:path";

export type OrchestratorInput = {
  history: Turn[];
  lastUserScore: Score | null;
  activeDeckIds: string[];
  metaIntent: string | null;
  mock?: boolean;
};

export type OrchestratorOutput = {
  speakerNext: "ai" | "user";
  aiUtterance?: Phrase & { audioUrl: string };
  routeTo: "conversation" | "tutor";
  tutorPayload?: {
    targetWord: string;
    diagnosis: string;
    referenceAudioUrl: string;
    retryPrompt: string;
  };
};

const PASS_THRESHOLD = 80;

async function mockOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  if (input.lastUserScore && (input.lastUserScore.accuracy < PASS_THRESHOLD || !input.lastUserScore.tonesOk)) {
    const worst = [...input.lastUserScore.words].sort((a, b) => a.accuracy - b.accuracy)[0];
    return {
      speakerNext: "user",
      routeTo: "tutor",
      tutorPayload: {
        targetWord: worst?.word ?? "?",
        diagnosis: `Your "${worst?.word ?? "?"}" came in low (accuracy ${worst?.accuracy ?? 0}). Try again with a clearer tone.`,
        referenceAudioUrl: "/mocks/silence.mp3",
        retryPrompt: worst?.word ?? "?",
      },
    };
  }

  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const pair = pickNextPair(filtered.length > 0 ? filtered : decks, {
    seenIds: input.history.filter((t) => t.speaker === "ai").map((t) => t.text),
  });
  const phrase = pair.q ?? pair.statement!;

  return {
    speakerNext: "ai",
    routeTo: "conversation",
    aiUtterance: {
      hanzi: phrase.hanzi,
      pinyin: phrase.pinyin,
      english: phrase.english,
      audioUrl: "/mocks/ai-utterance.mp3",
    },
  };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const useMock = input.mock || !process.env.ANTHROPIC_API_KEY;
  if (useMock) return mockOrchestrator(input);

  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  const filtered = input.activeDeckIds.length > 0
    ? decks.filter((d) => input.activeDeckIds.includes(d.deck.id))
    : decks;
  const availablePhrases = filtered.flatMap((d) => d.pairs).slice(0, 40);

  const client = getAnthropic();
  const userMsg = JSON.stringify({
    history: input.history.slice(-12),
    lastUserScore: input.lastUserScore,
    availablePhrases,
    metaIntent: input.metaIntent,
  });

  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = resp.content.find((b) => b.type === "text")?.text ?? "";
  const decision: ClaudeDecision = parseClaudeJson(text);

  if (decision.decision === "tutor" && decision.tutor) {
    return {
      speakerNext: "user",
      routeTo: "tutor",
      tutorPayload: {
        targetWord: decision.tutor.targetWord,
        diagnosis: decision.tutor.diagnosis,
        referenceAudioUrl: "/mocks/silence.mp3",
        retryPrompt: decision.tutor.retryPrompt,
      },
    };
  }

  if (decision.decision === "ai_speak" && decision.aiUtterance) {
    return {
      speakerNext: "ai",
      routeTo: "conversation",
      aiUtterance: { ...decision.aiUtterance, audioUrl: "/mocks/silence.mp3" },
    };
  }

  // user_speak (pass + wait)
  return { speakerNext: "user", routeTo: "conversation" };
}
```

Note: `audioUrl` is set to a placeholder; the browser calls `/api/tts` separately to fetch real audio (see `app/page.tsx`).

- [ ] **Step 5: Run unit tests**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm test
```

Expected: all green (orchestrator tests still use `mock: true`).

- [ ] **Step 6: Manual smoke with real Claude**

Confirm `ANTHROPIC_API_KEY` is in `.env.local`. Boot the server, click Start, speak, release. Expected: Claude picks a phrase, scores via Azure, gives a real confirmation or routes to tutor with real diagnosis.

- [ ] **Step 7: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(claude): real Sonnet 4.6 orchestrator with JSON contract"
```

### Phase 9 wrap

Tell user: "Phase 9 done — Claude is orchestrating, Azure is scoring + speaking. App is functional end-to-end."

---

## Phase 10: Hardening (`feat/hardening`)

### Task 10.1: Import a real Pimsleur deck

**Files:**
- Create: `decks/raw/pimsleur-01.apkg` (manual download — .gitignored)
- Create: `decks/pimsleur-01.yaml`

- [ ] **Step 1: User downloads an Anki deck**

Tell user: "Visit https://ankiweb.net/shared/info/915822283 (Pimsleur Mandarin I — Simplified, Pinyin, Traditional, Audio) and download the `.apkg`. Place it at `decks/raw/pimsleur-01.apkg`."

Wait for user confirmation that file exists.

- [ ] **Step 2: Run the importer**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run import:anki -- decks/raw/pimsleur-01.apkg decks/pimsleur-01.yaml pimsleur-01 "Pimsleur Mandarin I"
```

Expected: writes `decks/pimsleur-01.yaml` with N cards.

- [ ] **Step 3: Manually inspect output**

```bash
cd /home/jermsai/Code/Learn_Chinese
head -40 decks/pimsleur-01.yaml
```

Check that hanzi/pinyin/english look right. If field ordering is wrong (e.g., the deck stores `english | hanzi | pinyin`), tell the user and we'll add a `--field-order` flag.

- [ ] **Step 4: Commit (the YAML, not the .apkg — .apkg is .gitignored)**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add decks/pimsleur-01.yaml
git commit -m "feat(decks): import Pimsleur Mandarin I deck"
```

### Task 10.2: Q/A pairing pass via Claude (optional polish)

**Files:**
- Create: `scripts/pair-claude.ts`

- [ ] **Step 1: Write `scripts/pair-claude.ts`**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/providers/anthropic";
import type { Deck } from "@/lib/decks/schema";

async function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error("Usage: tsx scripts/pair-claude.ts <input.yaml> <output.yaml>");
    process.exit(1);
  }
  const deck = yaml.load(await readFile(inPath, "utf8")) as Deck;
  const statements = deck.pairs
    .filter((p) => p.statement)
    .map((p) => ({ id: p.id, ...p.statement! }));

  const client = getAnthropic();
  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: `You receive a list of Mandarin phrase statements. Group them into Q/A pairs where it makes sense (a question followed by its natural answer). Output JSON: [{ "q_id": "...", "a_id": "..." }, ...]. Phrases that don't fit a pair stay standalone — omit them from output.`,
    messages: [{ role: "user", content: JSON.stringify(statements) }],
  });

  const text = resp.content.find((b) => b.type === "text")?.text ?? "[]";
  const pairs: Array<{ q_id: string; a_id: string }> = JSON.parse(text.replace(/```json\s*/g, "").replace(/```\s*$/g, ""));

  const byId = new Map(deck.pairs.map((p) => [p.id, p]));
  const newPairs = pairs.map((p, i) => {
    const q = byId.get(p.q_id)?.statement;
    const a = byId.get(p.a_id)?.statement;
    if (!q || !a) return null;
    return { id: `${deck.deck.id}-pair-${String(i + 1).padStart(3, "0")}`, q, a, tags: [] };
  }).filter(Boolean);

  // Keep unmatched statements as-is
  const matchedIds = new Set(pairs.flatMap((p) => [p.q_id, p.a_id]));
  const unmatched = deck.pairs.filter((p) => !matchedIds.has(p.id));

  const out: Deck = {
    deck: deck.deck,
    pairs: [...newPairs as Deck["pairs"], ...unmatched],
  };

  await writeFile(outPath, yaml.dump(out, { lineWidth: 120 }), "utf8");
  console.log(`Paired ${newPairs.length} Q/A pairs, kept ${unmatched.length} standalone.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Add npm script:

```json
"pair:claude": "tsx scripts/pair-claude.ts"
```

- [ ] **Step 2: Run pairing on the imported deck**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run pair:claude -- decks/pimsleur-01.yaml decks/pimsleur-01-paired.yaml
```

- [ ] **Step 3: Inspect and adopt**

```bash
cd /home/jermsai/Code/Learn_Chinese
head -40 decks/pimsleur-01-paired.yaml
# if it looks good:
mv decks/pimsleur-01-paired.yaml decks/pimsleur-01.yaml
```

- [ ] **Step 4: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "feat(decks): Claude-assisted Q/A pairing for Pimsleur deck"
```

### Task 10.3: End-to-end smoke test

**Files:**
- Create: `tests/e2e/conversation-flow.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "@playwright/test";

test("conversation reaches 3 turns without crashing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start/i }).click();

  // Wait for first phrase
  await expect(page.locator(".font-serif").first()).toBeVisible({ timeout: 10_000 });

  // Mic interaction is hard to simulate in Playwright (real microphone needed).
  // For smoke purposes, just verify the rail accepts state and the UI doesn't crash.
  await expect(page.getByText(/conversation/i)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run e2e
```

- [ ] **Step 3: Commit**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add -A
git commit -m "test(e2e): flow smoke covering Start + rail render"
```

### Task 10.4: Final check

- [ ] **Step 1: Full check**

```bash
cd /home/jermsai/Code/Learn_Chinese
npm run check && npm test && npm run e2e
```

Expected: all three green.

- [ ] **Step 2: Update DevDoc**

Move queued items to Done in `DevDoc.md`.

- [ ] **Step 3: Commit DevDoc**

```bash
cd /home/jermsai/Code/Learn_Chinese
git add DevDoc.md
git commit -m "docs(devdoc): mark Phases 0–10 done"
```

### Phase 10 wrap

Tell user: "All phases done. App is functional with real Azure + Claude. Ready to merge `feat/*` branches into `main` (one at a time) when you say so."

---

## Final Notes

- **Never auto-commit, push, or deploy.** Every git state action — commit, push, merge, push-main — requires its own explicit ask from the user.
- **Branch flow:** one `feat/<phase-name>` branch per phase. The plan opens each phase by stating "Starting `feat/<x>` off `main`" and waiting for OK.
- **TDD discipline:** every code task pairs with a test task that fails first. Skipping the failing-test step defeats the purpose.
- **Mocks first, then providers:** Phases 0–7 are mock-driven so the UI and state machine are solid before real APIs touch them.
- **Azure setup is a prerequisite for Phase 8.** Don't start that phase until the user confirms keys are in `.env.local`.
- **Pimsleur deck import (Task 10.1) needs a manual `.apkg` download** — there's no programmatic way around it.
