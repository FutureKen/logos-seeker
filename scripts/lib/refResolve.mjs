/**
 * EPUB anchors and reference display text → the language-neutral `Ref` /
 * `Loc` tuples of the study-data contract.
 *
 * Every scripture link in the English EPUB carries an anchor that already
 * names the book, chapter and (usually) verse — `#Gen1-1`, `#Joh1`, `#SCo3-15`
 * — so the English prose never has to be parsed. The link *text* only adds the
 * end of a range ("1:22b-23") and the half-verse suffix ("1:2b").
 */

/** `Gen1-1` → `{code:"Gen", chapter:1, verse:1}`; `Gen1` → `verse: 0`. */
export function parseAnchor(anchor) {
  const m = /^([A-Za-z]{2,5})(\d+)(?:-(\d+))?$/.exec(String(anchor ?? "").trim());
  if (!m) return null;
  return { code: m[1], chapter: Number(m[2]), verse: m[3] == null ? 0 : Number(m[3]) };
}

/** `n1_2_3` → `{chapter:1, verse:2, num:3}` (a footnote block). */
export function parseNoteAnchor(anchor) {
  const m = /^n(\d+)_(\d+)_(\d+)$/.exec(String(anchor ?? "").trim());
  return m ? { chapter: Number(m[1]), verse: Number(m[2]), num: Number(m[3]) } : null;
}

/** `c1_3_b` → `{chapter:1, verse:3, letter:"b"}` (a cross-reference-only block). */
export function parseXrefAnchor(anchor) {
  const m = /^c(\d+)_(\d+)_([a-z]+)$/i.exec(String(anchor ?? "").trim());
  return m ? { chapter: Number(m[1]), verse: Number(m[2]), letter: m[3] } : null;
}

const PART = { a: 1, b: 2 };

/**
 * Parse the *display text* of a reference link.
 *
 * Returns `{start, end}` where each side is `{chapter, verse, part}` and a
 * `chapter` of `null` means "the number had no `chapter:` prefix" — the caller
 * disambiguates with the link's anchor. `end` is `null` for a single verse.
 *
 *   rangeFromText("Eph. 1:22b-23")
 *   // { start: {chapter:1, verse:22, part:2}, end: {chapter:1, verse:23, part:0} }
 *   rangeFromText("vv. 24-25")
 *   // { start: {chapter:null, verse:24, part:0}, end: {chapter:null, verse:25, part:0} }
 */
export function rangeFromText(text) {
  let s = String(text ?? "")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[;,.\s-]+$/, "");
  // Drop a leading book / "vv." / "ch." label: everything before the first digit
  // that is made of letters, dots and spaces (a leading "1 " of "1 Tim." too).
  s = s.replace(/^(?:[123]\s+)?[A-Za-z][A-Za-z.\s]*/, "").trim();

  const m = /^(\d+)(?::\s*(\d+))?\s*([ab])?(?:\s*-\s*(?:(\d+):\s*)?(\d+)\s*([ab])?)?/.exec(s);
  if (!m) return null;

  const hasColon = m[2] != null;
  const start = hasColon
    ? { chapter: Number(m[1]), verse: Number(m[2]), part: PART[m[3]] ?? 0 }
    : { chapter: null, verse: Number(m[1]), part: PART[m[3]] ?? 0 };

  if (m[5] == null) return { start, end: null };
  const end = {
    chapter: m[4] != null ? Number(m[4]) : hasColon ? start.chapter : null,
    verse: Number(m[5]),
    part: PART[m[6]] ?? 0,
  };
  return { start, end };
}

/**
 * Anchor + display text → `Ref = [book, chapter, verse, verseEnd]`.
 *
 * `verseEnd` is 0 for a single verse and for ranges that cross a chapter
 * boundary (which `Ref` cannot express — the start still navigates correctly).
 *
 * @param {string} anchor  the `#…` fragment of the link
 * @param {string} text    the link text
 * @param {(code: string) => number|null} bookOf  code → books.json idx
 */
export function refFromLink(anchor, text, bookOf) {
  const a = parseAnchor(anchor);
  if (!a) return null;
  const book = bookOf(a.code);
  if (!book) return null;

  const r = rangeFromText(text);
  let verseEnd = 0;
  if (r?.end) {
    const sameChapter = r.end.chapter == null || r.end.chapter === a.chapter;
    // "Gen. 1 — 2" links a whole chapter: the second number is a chapter.
    if (sameChapter && a.verse > 0 && r.end.verse > a.verse) verseEnd = r.end.verse;
  }
  return [book, a.chapter, a.verse, verseEnd];
}

/**
 * Anchor + display text → the `{start, end}` `Loc` pair of an outline entry.
 * `endAnchor`/`endText` come from a second link when the range spans two of
 * them ("1:1 —" + "2:25").
 */
export function locsFromLinks(anchor, text, endAnchor, endText) {
  const a = parseAnchor(anchor);
  if (!a) return null;
  const r = rangeFromText(text);
  const start = [a.chapter, a.verse, r?.start.part ?? 0];

  if (endAnchor) {
    const b = parseAnchor(endAnchor);
    if (b) {
      const er = rangeFromText(endText);
      return { start, end: [b.chapter, b.verse, er?.start.part ?? 0] };
    }
  }
  if (r?.end) {
    const chapter = r.end.chapter ?? a.chapter;
    // A trailing number on a whole-chapter link is another chapter, not a verse.
    const verse = a.verse === 0 && r.end.chapter == null ? 0 : r.end.verse;
    const endChapter = a.verse === 0 && r.end.chapter == null ? r.end.verse : chapter;
    return { start, end: [endChapter, verse, r.end.part] };
  }
  return { start, end: [...start] };
}

/** `l3_p1_5` → `{level:3, label:"1."}`; `l5_p_1__12` → `{level:5, label:"(1)"}`. */
export function parseOutlineId(id) {
  const m = /^l(\d+)_p(.*)_(\d+)$/.exec(String(id ?? "").trim());
  if (!m) return null;
  const raw = m[2];
  // `_x_` is the source's escaping of the parenthesised labels `(x)`.
  const label = /^_(.+)_$/.test(raw) ? `(${raw.slice(1, -1)})` : `${raw}.`;
  return { level: Number(m[1]), label, n: Number(m[3]) };
}

/** Level implied by an inline `<p class="text-outline">` label: `I.` `A.` `1.` `a.` `(1)` `(a)`. */
export function levelFromLabel(label) {
  const s = String(label ?? "").trim();
  if (/^\([0-9]+\)$/.test(s)) return 5;
  if (/^\([a-z]+\)$/.test(s)) return 6;
  if (/^[IVXLC]+\.$/.test(s)) return 1;
  if (/^[A-Z]+\.$/.test(s)) return 2;
  if (/^[0-9]+\.$/.test(s)) return 3;
  if (/^[a-z]+\.$/.test(s)) return 4;
  return null;
}
