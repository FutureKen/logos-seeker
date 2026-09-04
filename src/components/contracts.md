# Component props contracts

First draft, written in Phase 0 so subtask **C** (React port) and subtask **D**
(study UI) can be built in parallel against the same interface. C owns
`ChapterView`; D owns `VerseText`, `OutlineHeading`, `BookInfoCard` and
`StudySheet`. **If a signature has to change, change it here first.**

Shared types come from the data contract (see the plan, "Data contract"):

```ts
type Lang   = "en" | "cn";
type Ref    = [book: number, chapter: number, verse: number, verseEnd: number]; // verse 0 = whole chapter
type Loc    = [chapter: number, verse: number, part: 0 | 1 | 2];
type Run    = string | { i: string } | { ref: Ref; t: string } | { note: [number, number, number, number]; t: string } | { sup: string };
type Rich   = Run[][];                       // paragraphs of runs
type Marker = { l: string; p: number | null; n?: number | string; x?: string; w?: string };
type VerseApparatus = { m?: Marker[]; n?: Record<string, Rich>; x?: Record<string, XrefItem[]> };
type XrefItem = { r: Ref; t: string; cf?: boolean };
type OutlineEntry = { level: 1|2|3|4|5|6; label?: string; title: string; start: Loc; end: Loc; pos?: number | null };
type BookInfo = { author: Rich; written: Rich; place: Rich; period: Rich; subject: Rich } | null;
type Segment = { t: string } | { m: number; l: string; x: boolean; floating?: boolean } | { h: OutlineEntry };
```

`Segment[]` is produced by `src/study/splitText.js` — `splitText(text, markers, heads)`.

---

## `<ChapterView>` — owned by C · **final, as implemented**

`src/components/ChapterView.jsx`

```ts
{
  book: number;                 // books.json idx
  chapter: number;
  bookName: string;             // already resolved for `lang` (b.cn || b.en / b.en)
  verses: Row[];                // verses.json rows, in verse order (COL.* indices)
  lang: Lang;
  interlinear?: boolean;

  // entry animation — see "scroll" below
  focusVerse?: number | null;   // verse to land on / highlight for 2 s
  scroll?: "verse" | "top" | "none";   // default "verse"
  scrollKey?: number | string;  // changing it re-runs the entry scroll

  selected: Set<string>;        // "book:chapter:verse" keys
  onToggleSelect(key: string): void;
  onCopy(row: Row): void;       // copies that verse, or the whole selection
  canPrev: boolean; canNext: boolean;  // false ⇒ the arrow renders disabled
  onPrev(): void; onNext(): void;
  onToggleInterlinear(): void;
  onGoto(ref: Ref): void;       // reference link → push nav stack, render target

  // --- study props (all optional; absent/false ⇒ today's plain chapter view)
  study?: boolean;                       // the Notes toggle, already unlocked
  studyState?: "off" | "loading" | "ready" | "error";
  chapterStudy?: { en?: { verses: Record<string, VerseApparatus> }; cn?: … } | null;
  bookStudy?: { en?: { info: BookInfo; outline: OutlineEntry[] }; cn?: … } | null;
  onOpenSheet?(req: SheetRequest): void; // marker / verse-number tap
}
```

`Row` is a `verses.json` row: `[book, chapter, verse, en, cn]`.

`scroll` decides what happens when the view is entered: `"verse"` lands on
`focusVerse` just below the sticky search bar and flashes it (or starts at the
chapter heading when `focusVerse` is null or the chapter's first verse);
`"top"` is what prev/next use; `"none"` is a restored view (the back button
puts the remembered scroll position back instead).

`ChapterView` renders the header (title, prev/next, Interlinear toggle, and —
when `study` — the "Outline / 纲目" and "Book / 简介" buttons), the book-info card
on chapter 1, and one `VerseText` per verse per rendered language.

### Where D plugs in

`ChapterView.jsx` currently renders `PlainVerseText` (defined at the top of the
same file, marked `STUDY SLOT`) inside `ChapterVerse`. Swap that one JSX tag for
`<VerseText …/>` and delete `PlainVerseText`; the interlinear branch renders the
verse number itself and passes text-only lines, so `VerseText` needs
`showNumber` (below). The chapter header's `.chapter-tools` span is where the
Outline / Book buttons go, and `BookInfoCard` belongs directly above the first
`ChapterVerse` when `chapter === 1`.

## `<VerseText>` — owned by D

```ts
{
  text: string;                 // the exact verses.json string for this verse
  lang: Lang;
  verseNo: number;
  showNumber?: boolean;         // default true; false for interlinear lines
  apparatus?: VerseApparatus | null;
  heads?: OutlineEntry[];       // mid-verse outline entries anchored in this verse
  study: boolean;               // false ⇒ render `text` verbatim, no markers
  onMarker?(markerIndex: number): void;
  onVerseNumber?(): void;       // only wired when the verse has apparatus
}
```

Renders `splitText(text, apparatus?.m ?? [], heads ?? [])`. Markers are
`<sup>` elements: numeric labels use `--color-accent`, letters use
`--color-muted` italic. Copy/select must yield the plain text without markers.

## `<StudySheet>` — owned by D

```ts
{
  open: boolean;
  request: SheetRequest | null;
  lang: Lang;                   // initial tab language; the sheet has its own EN/中 switch
  chapterStudy: …; bookStudy: …;  // same shapes as ChapterView
  bookByIdx: Map<number, Book>;
  onClose(): void;
  onGoto(ref: Ref): void;
}

type SheetRequest =
  | { kind: "verse";   book: number; chapter: number; verse: number; focus?: { note?: string; xref?: string } }
  | { kind: "outline"; book: number; chapter: number }
  | { kind: "book";    book: number };
```

Native `<dialog>`; tabs `Verse | Outline | Book`; Esc closes it before the
chapter view sees the key.

## `<OutlineHeading>` — owned by D

```ts
{ entry: OutlineEntry; lang: Lang; inline?: boolean; onGoto?(ref: Ref): void }
```

## `<BookInfoCard>` — owned by D

```ts
{ info: BookInfo; lang: Lang; bookByIdx: Map<number, Book>; onGoto(ref: Ref): void }
```

## Unlock gate — owned by C

`UnlockButton` / `UnlockDialog` own `localStorage["ls-study-key"]` and call
`unlock(password, index)` from `src/study/studyCrypto.js`. On success they hand
the `CryptoKey` to the app state, which calls `studyStore.setKey(key)`. Until
then `study` is `false` everywhere and no study file is fetched.

`src/App.jsx` re-imports the stored key on startup and validates it against
`index.json`'s `verify` (an unreachable manifest is trusted, so an offline
device stays unlocked). `Footer`'s "Lock" clears the key, the store and `study`.

---

# App state — the API subtask D builds on

`src/state/AppProvider.jsx` exports `AppProvider`, `useApp()`, `reducer`,
`initState` and `PAGE_SIZE`. `useApp()` returns `{ state, dispatch, actions, store }`.

```ts
state = {
  lang: Lang; theme: "dark"|"light"; themeExplicit: boolean;
  interlinear: boolean;
  study: boolean;               // the Notes toggle (ls-study)
  unlocked: boolean;            // a valid study key is loaded
  input: string;                // raw search-box text
  query: string;                // the committed query the results reflect
  view: {kind:"results"} | {kind:"chapter", book, chapter, focusVerse, scroll, nonce};
  navStack: {view, wordShown, scrollY}[];   // back-button targets
  selected: Set<string>;        // "book:chapter:verse"
  wordShown: number;            // keyword paging
  pendingScroll: number|null;   // applied and cleared by App
}
```

```ts
actions = {
  setInput(text), search(query), setLang(lang),
  setTheme(theme, explicit?), toggleTheme(),
  setInterlinear(bool), toggleInterlinear(),
  setStudy(bool), setUnlocked(bool), lock(),
  openChapter({book, chapter, focusVerse?, scroll?, push?}),  // push ⇒ back button
  back(), toggleSelect(key), clearSelection(), showMore(), scrolled(),
}
```

`store` is the single `StudyStore` (constructed with `import.meta.env.BASE_URL`);
`useStudyChapter` / `useStudyBook` should read it from `useApp()` rather than
building their own. Study data must only be fetched when
`state.unlocked && state.study`.

Other C-owned pieces D may reuse: `src/lib/i18n.js` (`tr(lang)` string table,
`HELP_STEPS`), `src/lib/format.js` (`splitHighlight`, `textFor`, `cnMissing`,
`verseKey`, `verseToText`, `writeClipboard`), `src/hooks/useLocalStorage.js`
(`readLS` / `writeLS` / `useLocalStorage`), `src/hooks/useBible.js`
(`useBible(enabled)`, `getBible()`), `src/hooks/useSelectPulse.js`.
`NotesToggle.jsx` is the placeholder for D's `StudyToggle`; it is rendered by
`TopBar` and already persists `ls-study`.
