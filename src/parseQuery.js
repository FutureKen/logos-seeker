/**
 * parseQuery.js — classify an omni-search query as a scripture REFERENCE or a
 * free-text WORD search, and parse references into { bookIdx, chapter, verse… }.
 *
 * Reference forms supported (English & Chinese aliases):
 *   John 1:1        John 1        John 1:1-5
 *   1 John 2:3      1John 2:3
 *   约翰福音 1:1     约 1:1        约 1        创 1:1-3
 *   Ps 23           诗 23:1
 *   西三16           太二四37       诗一一九105  启二二1～5
 *                   (the compact form the Recovery Version prints: a Chinese
 *                    numeral chapter run straight into an Arabic verse)
 *
 * Public API:
 *   buildAliasIndex(books) -> aliasIndex   (call once after books.json loads)
 *   parseQuery(raw, aliasIndex) -> { type:'ref'|'word', ... }
 */

/** Does the string contain any CJK ideograph? */
export function hasCJK(s) {
  return /[㐀-鿿豈-﫿]/.test(s);
}

const CN_DIGITS = {
  "〇": 0,
  "○": 0,
  "零": 0,
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
};

const CN_NUMERAL = /^[〇○零一二三四五六七八九十]+$/;

/**
 * A Chinese numeral as printed in a Recovery Version reference.
 *
 * Chapters are written digit by digit — 二四 is 24, 一一九 is 119 — with 十
 * still read the ordinary way, so 十九 is 19 and 二十一 is 21.
 *
 * @param {string} s
 * @returns {number} NaN when the string is not a numeral
 */
export function cnNum(s) {
  const t = String(s ?? "").trim();
  if (!t) return NaN;
  const ten = t.indexOf("十");
  if (ten >= 0 && t.length <= 3) {
    const head = t.slice(0, ten);
    const tail = t.slice(ten + 1);
    const h = head === "" ? 1 : CN_DIGITS[head];
    const l = tail === "" ? 0 : CN_DIGITS[tail];
    if (h != null && l != null) return h * 10 + l;
  }
  let n = 0;
  for (const c of t) {
    const d = CN_DIGITS[c];
    if (d == null) return NaN;
    n = n * 10 + d;
  }
  return n;
}

/** Full-width colons, digits and dashes are what a Chinese keyboard produces. */
function normalizeCnPunct(s) {
  return s
    .replace(/[：]/g, ":")
    .replace(/[～~—–]/g, "-")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

/**
 * Build a lookup from alias -> bookIdx. English aliases are stored lowercased
 * with internal spaces removed so "1 John", "1John", "1 jn" all collapse to one
 * key. Chinese aliases are stored verbatim. Longer aliases are preferred at
 * match time by trying the longest leading book-name match first.
 */
export function buildAliasIndex(books) {
  const en = new Map(); // normalized en alias -> bookIdx
  const cn = new Map(); // cn alias -> bookIdx
  const cnByLen = []; // cn aliases sorted longest-first for greedy matching
  for (const b of books) {
    for (const a of b.enAlias || []) en.set(normalizeEn(a), b.idx);
    // include the canonical English display name too
    if (b.en) en.set(normalizeEn(b.en), b.idx);
    for (const a of b.cnAlias || []) {
      cn.set(a, b.idx);
      cnByLen.push(a);
    }
    if (b.cn) {
      cn.set(b.cn, b.idx);
      cnByLen.push(b.cn);
    }
  }
  cnByLen.sort((a, b) => b.length - a.length);
  return { en, cn, cnByLen, books };
}

function normalizeEn(s) {
  return s.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
}

/**
 * Try to parse `raw` as a reference. Returns null if it isn't one.
 * Result: { type:'ref', bookIdx, chapter, verse?|null, verseEnd?|null,
 *           candidates?:[{bookIdx,chapter,verse}], fuzzy?:boolean }
 *
 * When the numeric part uses an explicit "C:V" separator the result is exact.
 * When it is a bare digit string (e.g. "heb 111" or "heb11"), the parse is
 * "fuzzy": every plausible chapter/verse split that exists in the book is
 * returned in `candidates` so the UI can show all of them (e.g. Heb 1:11 and
 * Heb 11:1, or Heb chapter 11 and Heb 1:1).
 */
export function parseReference(raw, aliasIndex) {
  const q = raw.trim();
  if (!q) return null;

  // ---- Chinese reference: <cnBookAlias> then any of the forms below ----
  if (hasCJK(q)) {
    // Longest alias first, but a longer one that leads nowhere gives way to a
    // shorter one rather than failing the whole parse.
    for (const alias of aliasIndex.cnByLen) {
      if (!q.startsWith(alias)) continue;
      const bookIdx = aliasIndex.cn.get(alias);
      const rest = normalizeCnPunct(q.slice(alias.length).trim());
      const ref = parseCnRest(bookIdx, rest, aliasIndex);
      if (ref) return ref;
    }
    return null;
  }

  // ---- English reference: <bookAlias> <chap>[:<v>[-<v2>]] ----
  // Allow an optional leading book number (1/2/3). Greedily match the longest
  // alias by scanning candidate splits between book-name and chapter digits.
  const m = /^(.*?)(\d+(?::\d+(?:\s*-\s*\d+)?)?)\s*$/.exec(q);
  if (!m) return null;
  const namePart = normalizeEn(m[1]);
  const numPart = m[2];
  if (!namePart) return null;

  const bookIdx = aliasIndex.en.get(namePart);
  if (!bookIdx) return null;

  // Explicit C:V (or C:V-V) form → exact parse.
  if (numPart.includes(":")) {
    const nums = parseChapterVerse(numPart);
    return nums ? makeRef(bookIdx, nums, aliasIndex) : null;
  }
  // Bare digit string with no colon → fuzzy split into chapter/verse options.
  return makeFuzzy(bookIdx, numPart, aliasIndex);
}

/**
 * What can follow a Chinese book name:
 *   "3:16", "3:16-18"   an explicit chapter and verse
 *   "316"               bare digits, split every plausible way
 *   "三16", "三16-18"    the compact form: a Chinese numeral chapter, then the
 *                       verse in Arabic digits, with nothing in between
 *   "三"                 a chapter on its own
 * Anything else (including the bare book name) is not a reference.
 */
function parseCnRest(bookIdx, rest, aliasIndex) {
  if (!rest) return null;
  if (rest.includes(":")) {
    const nums = parseChapterVerse(rest);
    return nums ? makeRef(bookIdx, nums, aliasIndex) : null;
  }
  if (/^\d+$/.test(rest)) return makeFuzzy(bookIdx, rest, aliasIndex);

  const m = /^([〇○零一二三四五六七八九十]+)(?:(\d+)(?:\s*-\s*(\d+))?)?$/.exec(rest);
  if (!m) return null;
  if (!CN_NUMERAL.test(m[1])) return null;
  const chapter = cnNum(m[1]);
  if (!Number.isFinite(chapter)) return null;
  return makeRef(
    bookIdx,
    {
      chapter,
      verse: m[2] != null ? Number(m[2]) : null,
      verseEnd: m[3] != null ? Number(m[3]) : null,
    },
    aliasIndex,
  );
}

/**
 * Enumerate plausible chapter/verse interpretations of a bare digit string for
 * a given book, using the book's real chapter and per-chapter verse counts.
 *
 * Examples (Hebrews, 13 chapters):
 *   "111" -> Heb 1:11, Heb 11:1
 *   "11"  -> Heb 11 (whole chapter), Heb 1:1
 *   "3"   -> Heb 3 (whole chapter)
 *
 * Returns a fuzzy ref descriptor with a `candidates` array, or null.
 */
function makeFuzzy(bookIdx, digits, aliasIndex) {
  const book = aliasIndex.books.find((b) => b.idx === bookIdx);
  if (!book || !book.chapters || !book.chapters.length) return null;
  const nChapters = book.chapters.length;
  const verseCount = (c) => book.chapters[c - 1] || 0;

  const seen = new Set();
  const candidates = [];
  const add = (chapter, verse) => {
    const key = `${chapter}:${verse == null ? "*" : verse}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ bookIdx, chapter, verse });
  };

  // Whole-number interpretation: the digits are a chapter on their own.
  const whole = Number(digits);
  if (whole >= 1 && whole <= nChapters) add(whole, null);

  // Every split point: left = chapter, right = verse (no leading-zero verses).
  for (let i = 1; i < digits.length; i++) {
    const cStr = digits.slice(0, i);
    const vStr = digits.slice(i);
    if (vStr.length > 1 && vStr[0] === "0") continue; // avoid "01" style verses
    const c = Number(cStr);
    const v = Number(vStr);
    if (c < 1 || c > nChapters) continue;
    if (v < 1 || v > verseCount(c)) continue;
    add(c, v);
  }

  if (!candidates.length) return null;

  // Order: the whole-number-as-chapter reading first (most common intent for a
  // short reference like "ps 23"), then verse splits by chapter then verse.
  candidates.sort((a, b) => {
    const aw = a.verse == null ? 0 : 1;
    const bw = b.verse == null ? 0 : 1;
    if (aw !== bw) return aw - bw;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return (a.verse || 0) - (b.verse || 0);
  });

  if (candidates.length === 1) {
    const c = candidates[0];
    return makeRef(bookIdx, { chapter: c.chapter, verse: c.verse, verseEnd: null }, aliasIndex);
  }
  return { type: "ref", fuzzy: true, bookIdx, candidates };
}

/** Parse "1", "1:1", "1:1-5" → { chapter, verse|null, verseEnd|null }. */
function parseChapterVerse(s) {
  const t = s.trim();
  const m = /^(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/.exec(t);
  if (!m) return null;
  return {
    chapter: Number(m[1]),
    verse: m[2] != null ? Number(m[2]) : null,
    verseEnd: m[3] != null ? Number(m[3]) : null,
  };
}

function makeRef(bookIdx, nums, aliasIndex) {
  if (!bookIdx) return null;
  const book = aliasIndex.books.find((b) => b.idx === bookIdx);
  if (!book) return null;
  // Validate chapter is within range when metadata is available.
  if (book.chapters && book.chapters.length) {
    if (nums.chapter < 1 || nums.chapter > book.chapters.length) return null;
  }
  return {
    type: "ref",
    bookIdx,
    chapter: nums.chapter,
    verse: nums.verse,
    verseEnd: nums.verseEnd,
  };
}

/**
 * Top-level: returns a reference descriptor, or a word-search descriptor.
 * Word search carries the detected language so the caller searches the right
 * text column.
 */
export function parseQuery(raw, aliasIndex) {
  const ref = parseReference(raw, aliasIndex);
  if (ref) return ref;
  const term = raw.trim();
  return { type: "word", term, lang: hasCJK(term) ? "cn" : "en" };
}
