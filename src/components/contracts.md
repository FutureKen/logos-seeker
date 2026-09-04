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

## `<ChapterView>` — owned by C

```ts
{
  book: number;                 // books.json idx
  chapter: number;
  verses: Row[];                // verses.json rows, in verse order (COL.* indices)
  lang: Lang;
  interlinear: boolean;
  focusVerse?: number | null;   // verse to scroll to / highlight on entry
  selected: Set<string>;        // "book:chapter:verse" keys of selected verses
  onToggleSelect(key: string): void;
  onCopy(rows: Row[]): void;
  onPrev(): void;               // disabled at the ends of the canon
  onNext(): void;
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

`ChapterView` renders the header (title, prev/next, Interlinear toggle, and —
when `study` — the "Outline / 纲目" and "Book / 简介" buttons), the book-info card
on chapter 1, and one `VerseText` per verse per rendered language.

## `<VerseText>` — owned by D

```ts
{
  text: string;                 // the exact verses.json string for this verse
  lang: Lang;
  verseNo: number;
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
