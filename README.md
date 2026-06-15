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

## Run locally

```bash
npm run serve          # serve the static site at http://localhost:5050
```

Any static file server works (e.g. `python -m http.server`). Then open the page
in a browser. No build step is required — the data is committed as JSON.

### Tests

```bash
node scripts/test-parse.mjs    # reference-parsing assertions
node scripts/test-search.mjs   # search-engine assertions (uses local data)
```

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
