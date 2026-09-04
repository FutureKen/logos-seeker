# Logos Seeker

A **static, serverless** scripture search tool for the **Recovery Version** Bible,
in **English and Chinese (中文)**. One omni search bar accepts either a verse
reference or any word/phrase and instantly returns matching verses. It runs
entirely in the browser — host it on GitHub Pages with no backend.

## Features

- **Reference lookup** — `John 1:1`, `John 1` (whole chapter), `John 1:1-5`
  (range), `1 John 2:3`, plus Chinese forms `约翰福音 1:1`, `约 1:1`, `创 1`.
- **Fuzzy / blurred references** — type without a colon and get every plausible
  reading: `heb 111` → **Heb 1:11** and **Heb 11:1**; `heb11` → **Heb 11**
  (whole chapter) and **Heb 1:1**. Works for Chinese too (`约 111`).
- **Word / phrase search** — `Christ`, `基督`, `耶和华`. The query language is
  auto-detected: Chinese queries search the Chinese text, English the English.
  Multiple space-separated words are matched as **AND, in any order/position** —
  e.g. `join spirit` finds *"…joined to the Lord is one spirit."* (1 Cor 6:17).
  English queries need at least 2 characters; Chinese has no minimum.
  Results show 20 at a time with a **More results** button.
- **EN / 中文 toggle** — switch the display language; results re-render instantly.
- **Light / dark theme** — a ☀/🌙 switch in the top-right corner; it overrides
  the OS preference and is remembered across sessions.
- **Compact results** — each match is a single line: a copy button, the
  reference, and the verse text.
- **Copy** — every row has a copy button that puts `Reference  text` on the
  clipboard.
- **Select verses** — click a verse's text to select it (click again to
  deselect). With a selection active, any copy button copies all selected verses
  (in canonical order, one per line); a floating **Deselect all** button appears
  once two or more are selected.
- **Click any reference** to switch to the full-chapter view for context.
- **Chapter navigation** — in the full-chapter view, **←/→** buttons (or the
  **←/→ arrow keys** when the search box isn't focused) jump to the previous/next
  chapter, crossing book boundaries (and disabled at the ends of the canon).
- **Interlinear mode** — in the full-chapter view, an **Interlinear** toggle
  interleaves each verse's English and Chinese lines. Copying an interlinear
  verse copies both languages. (Chapter view only.)
- **Clear quickly** — an **✕** button in the search box, or press **Esc**, clears it.
- **Shareable URLs** — every search updates the URL hash (`#q=John+1:1`).
- **Offline after first load** — the verse data loads once, then search is local.

## How it works

```
data/verses.json ─┐
data/books.json  ─┼─► index.html + src/*.js  (browser app)
                  ┘
```

- **`data/verses.json`** holds the aligned bilingual text — English is the master
  spine (**31,102 verses**, the canonical count) with the Chinese for each verse
  alongside it. **`data/books.json`** holds per-book metadata and the reference
  alias table.
- **`src/parseQuery.js`** classifies a query as a reference or a word search and
  parses references against a per-book alias table.
- **`src/search.js`** does O(1) reference lookup and word search via an English
  token inverted index and a Chinese bigram index (built lazily in the browser).
- **`src/app.js`** is the vanilla-JS UI (no framework, native ES modules).

## Development

The app is a **Vite + React + Tailwind v4** PWA. The verse data lives in
`public/data/` and is copied to `dist/` verbatim by the build.

```bash
npm install
npm run dev            # dev server on http://localhost:5173
npm run build          # production build into dist/ (incl. the generated service worker)
npm run preview        # serve dist/ locally
npm test               # vitest (run once)
npm run test:watch     # vitest in watch mode
```

Tests live in `tests/` (vitest, jsdom). `tests/search.test.js` stubs `fetch` so
the search engine runs against the committed JSON.

## Study data

The Recovery Version study apparatus (footnotes, cross-references, outlines and
book info) is built by the scripts under `scripts/` into
`public/data/study/**`, one file per book plus one per chapter. Files are
**encrypted at rest** (AES-GCM, key derived from a password with PBKDF2), so the
password is supplied to the build via `STUDY_PASSWORD` and never committed.

```bash
npm run study:en -- --book 1       # English half, from the EPUB
npm run study:fetch -- --book 1    # cache the Chinese API responses
npm run study:cn -- --book 1       # Chinese half
npm run study:index                # (re)write data/study/index.json
npm run study:validate -- --book 1 # schema + QA table; exit 1 on errors
npm run study:validate -- --fixtures   # validate the hand-written fixtures
```

The contract those files must satisfy is codified in `scripts/lib/schema.mjs`,
with hand-written, **decrypted** fixtures for Genesis 1:1–3 under
`scripts/fixtures/study/1/`. The browser reads the same files through
`src/study/studyStore.js`.

## Use as a library (npm)

The search engine and query parser are also published as an npm package, with
the verse data bundled under `logos-seeker/data/`.

```bash
npm install logos-seeker
```

```js
import { BibleSearch, COL } from "logos-seeker";

const bible = new BibleSearch();

// Browser: serve the JSON statically, then point load() at its base path
// (defaults to "" → fetches "data/verses.json" + "data/books.json").
await bible.load("/some/base/");

// Node / bundler: read or import the JSON and inject it directly.
// import verses from "logos-seeker/data/verses.json" with { type: "json" };
// import books  from "logos-seeker/data/books.json"  with { type: "json" };
// bible.setData(verses, books);

const ref = bible.parse("John 3:16");               // { type: "ref", ... }
const rows = bible.lookupReference(ref);            // [rowIdx, ...]
for (const i of rows) {
  console.log(bible.refLabel(bible.verses[i], "en"), bible.verses[i][COL.EN]);
}

const { rows: hits } = bible.wordSearch("基督", "cn"); // word/phrase search
```

Exported API: `BibleSearch`, `COL`, `parseQuery`, `parseReference`,
`buildAliasIndex`, `hasCJK`. The data files are reachable at
`logos-seeker/data/books.json` and `logos-seeker/data/verses.json`.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) publishes the static
   site on every push to `main`.

Because it's fully static, you can also serve it directly from the repo root or a
`gh-pages` branch.

## Data source

Text is the **Holy Bible Recovery Version** (Living Stream Ministry). All rights
to the translation belong to their respective publisher; this tool is for personal
study and search.
