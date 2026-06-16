/**
 * search.js — data loading, reference lookup, and word search over the aligned
 * verses. All in-browser; no server. Index columns:
 *   verses.json rows = [bookIdx, chapter, verse, enText, cnText]
 *
 * Strategy:
 *   - Reference lookup: O(1) via a Map keyed "bookIdx:chapter:verse".
 *   - English word search: inverted token index (built lazily on first use).
 *   - Chinese word search: bigram (2-gram) index (built lazily), then a final
 *     includes() verify so short or partial queries still match precisely.
 */

import { buildAliasIndex, parseQuery, hasCJK } from "./parseQuery.js";

export const COL = { BOOK: 0, CHAP: 1, VERSE: 2, EN: 3, CN: 4 };

export class BibleSearch {
  constructor() {
    this.verses = null; // array of rows
    this.books = null; // array of book meta
    this.aliasIndex = null;
    this.refMap = null; // "b:c:v" -> row index
    this.bookByIdx = null; // bookIdx -> book meta
    this._enIndex = null; // token -> Set(rowIdx)
    this._cnIndex = null; // bigram -> Set(rowIdx)
    this._loading = null;
  }

  /**
   * Index already-parsed data. Use this in Node or a bundler where the JSON is
   * read/imported directly rather than fetched (`logos-seeker/data/*.json`).
   *   verses: array of rows [bookIdx, chapter, verse, enText, cnText]
   *   books:  array of book metadata
   */
  setData(verses, books) {
    this.verses = verses;
    this.books = books;
    this.aliasIndex = buildAliasIndex(this.books);
    this.bookByIdx = new Map(this.books.map((b) => [b.idx, b]));
    this.refMap = new Map();
    for (let i = 0; i < this.verses.length; i++) {
      const r = this.verses[i];
      this.refMap.set(`${r[COL.BOOK]}:${r[COL.CHAP]}:${r[COL.VERSE]}`, i);
    }
  }

  /** Lazy-load data files via fetch once (browser); safe to call repeatedly. */
  async load(basePath = "") {
    if (this.verses) return;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const [vRes, bRes] = await Promise.all([
        fetch(`${basePath}data/verses.json`),
        fetch(`${basePath}data/books.json`),
      ]);
      if (!vRes.ok || !bRes.ok) throw new Error("Failed to load Bible data files.");
      this.setData(await vRes.json(), await bRes.json());
    })();
    return this._loading;
  }

  parse(raw) {
    return parseQuery(raw, this.aliasIndex);
  }

  /** Format a verse reference label in the requested language. */
  refLabel(row, lang) {
    const b = this.bookByIdx.get(row[COL.BOOK]);
    const name = lang === "cn" ? b.cn || b.en : b.en;
    return `${name} ${row[COL.CHAP]}:${row[COL.VERSE]}`;
  }

  /** Resolve a reference query to an array of row indices (verse or range). */
  lookupReference(ref) {
    const out = [];
    const book = this.bookByIdx.get(ref.bookIdx);
    if (!book) return out;

    if (ref.verse == null) {
      // whole chapter
      const count = book.chapters[ref.chapter - 1] || 0;
      for (let v = 1; v <= count; v++) {
        const i = this.refMap.get(`${ref.bookIdx}:${ref.chapter}:${v}`);
        if (i != null) out.push(i);
      }
      // Some books include a verse 0 (e.g. Chinese Psalm superscriptions)
      const z = this.refMap.get(`${ref.bookIdx}:${ref.chapter}:0`);
      if (z != null) out.unshift(z);
      return out;
    }

    const end = ref.verseEnd != null ? ref.verseEnd : ref.verse;
    for (let v = ref.verse; v <= end; v++) {
      const i = this.refMap.get(`${ref.bookIdx}:${ref.chapter}:${v}`);
      if (i != null) out.push(i);
    }
    return out;
  }

  /** Return the full chapter (row indices) that a given row belongs to. */
  chapterRowsForRow(rowIdx) {
    const r = this.verses[rowIdx];
    return this.lookupReference({
      bookIdx: r[COL.BOOK],
      chapter: r[COL.CHAP],
      verse: null,
    });
  }

  /**
   * Given a row, return a row index in the previous (dir=-1) or next (dir=+1)
   * chapter, crossing book boundaries. Returns null at the start/end of the
   * canon. The returned row is verse 1 (or the chapter's first available verse).
   */
  siblingChapterRow(rowIdx, dir) {
    const r = this.verses[rowIdx];
    let bookIdx = r[COL.BOOK];
    let chapter = r[COL.CHAP] + dir;

    while (true) {
      const book = this.bookByIdx.get(bookIdx);
      if (!book) return null;
      if (chapter >= 1 && chapter <= book.chapters.length) {
        // Find the first existing verse of this chapter.
        const count = book.chapters[chapter - 1] || 0;
        for (let v = 0; v <= count; v++) {
          const i = this.refMap.get(`${bookIdx}:${chapter}:${v}`);
          if (i != null) return i;
        }
        return null;
      }
      // Move to an adjacent book.
      bookIdx += dir;
      const adj = this.bookByIdx.get(bookIdx);
      if (!adj) return null; // past the start/end of the canon
      chapter = dir > 0 ? 1 : adj.chapters.length;
    }
  }

  /* -------------------------- word search -------------------------- */

  _ensureEnIndex() {
    if (this._enIndex) return;
    const idx = new Map();
    for (let i = 0; i < this.verses.length; i++) {
      const text = this.verses[i][COL.EN];
      if (!text) continue;
      const seen = new Set();
      for (const tok of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
        if (seen.has(tok)) continue;
        seen.add(tok);
        let set = idx.get(tok);
        if (!set) idx.set(tok, (set = new Set()));
        set.add(i);
      }
    }
    this._enIndex = idx;
  }

  _ensureCnIndex() {
    if (this._cnIndex) return;
    const idx = new Map();
    for (let i = 0; i < this.verses.length; i++) {
      const text = this.verses[i][COL.CN];
      if (!text) continue;
      const chars = [...text];
      const seen = new Set();
      for (let k = 0; k < chars.length - 1; k++) {
        const bg = chars[k] + chars[k + 1];
        if (seen.has(bg)) continue;
        seen.add(bg);
        let set = idx.get(bg);
        if (!set) idx.set(bg, (set = new Set()));
        set.add(i);
      }
    }
    this._cnIndex = idx;
  }

  /**
   * Word search. Returns { rows:[rowIdx], total } where rows is capped at
   * `limit` but total reflects the full match count.
   */
  wordSearch(term, lang, limit = 300) {
    term = term.trim();
    if (!term) return { rows: [], total: 0 };
    return lang === "cn"
      ? this._wordSearchCn(term, limit)
      : this._wordSearchEn(term, limit);
  }

  _wordSearchEn(term, limit) {
    this._ensureEnIndex();
    const lower = term.toLowerCase();
    const tokens = lower.match(/[a-z0-9]+/g) || [];
    const results = [];

    if (tokens.length >= 2) {
      // Multi-word query → AND of all words, in any order/position.
      // Each token matches as a substring of a word (so "join" matches
      // "joined"). Intersect verse-sets, expanding partial-word tokens.
      let candidates = null;
      for (const tok of tokens) {
        const set = this._tokenVerseSet(tok);
        candidates = candidates == null ? new Set(set) : intersect(candidates, set);
        if (candidates.size === 0) break;
      }
      if (candidates) {
        // Verify every token is present, and note which verses also contain the
        // full phrase consecutively so they can be ranked first.
        const phrase = tokens.join(" ");
        const exact = [];
        const partial = [];
        for (const i of candidates) {
          const t = this.verses[i][COL.EN].toLowerCase();
          if (!tokens.every((tok) => t.includes(tok))) continue;
          (t.includes(phrase) ? exact : partial).push(i);
        }
        exact.sort((a, b) => a - b);
        partial.sort((a, b) => a - b);
        const rows = exact.concat(partial);
        return { rows: rows.slice(0, limit), total: rows.length };
      }
    } else if (tokens.length === 1) {
      // Single word → substring match (e.g. "Christ" finds "Christ's",
      // "spirit" finds "spiritual").
      const tok = tokens[0];
      for (let i = 0; i < this.verses.length; i++) {
        const t = this.verses[i][COL.EN];
        if (t && t.toLowerCase().includes(tok)) results.push(i);
      }
    }

    results.sort((a, b) => a - b);
    return { rows: results.slice(0, limit), total: results.length };
  }

  /**
   * Verse-index set for a query token: the union of every indexed word that
   * contains the token as a substring (so "join" → "join", "joined", "joins",
   * "rejoine", …). This is a superset that the caller verifies with includes().
   */
  _tokenVerseSet(tok) {
    const union = new Set();
    for (const [word, set] of this._enIndex) {
      if (word.includes(tok)) {
        for (const i of set) union.add(i);
      }
    }
    return union;
  }

  _wordSearchCn(term, limit) {
    // Whitespace-separated segments are ANDed: every segment must appear
    // somewhere in the verse (in any order). A single segment behaves as before.
    const segments = term.split(/\s+/).filter(Boolean);
    if (!segments.length) return { rows: [], total: 0 };

    // Candidate rows = intersection of each segment's candidate set.
    let candidates = null;
    for (const seg of segments) {
      const set = this._cnSegmentSet(seg);
      candidates = candidates == null ? new Set(set) : intersect(candidates, set);
      if (candidates.size === 0) break;
    }

    // Rank verses containing all segments adjacently (the joined phrase) first.
    const phrase = segments.join("");
    const exact = [];
    const partial = [];
    if (candidates) {
      for (const i of candidates) {
        const t = this.verses[i][COL.CN];
        if (!t || !segments.every((seg) => t.includes(seg))) continue;
        (segments.length > 1 && t.includes(phrase) ? exact : partial).push(i);
      }
    }
    exact.sort((a, b) => a - b);
    partial.sort((a, b) => a - b);
    const rows = exact.concat(partial);
    return { rows: rows.slice(0, limit), total: rows.length };
  }

  /** Candidate verse-index set for one Chinese segment (phrase). */
  _cnSegmentSet(seg) {
    const chars = [...seg];
    if (chars.length < 2) {
      // Single character: the bigram index can't help → scan all verses.
      const set = new Set();
      for (let i = 0; i < this.verses.length; i++) {
        const t = this.verses[i][COL.CN];
        if (t && t.includes(seg)) set.add(i);
      }
      return set;
    }
    this._ensureCnIndex();
    let candidates = null;
    for (let k = 0; k < chars.length - 1; k++) {
      const bg = chars[k] + chars[k + 1];
      const set = this._cnIndex.get(bg);
      if (!set) return new Set();
      candidates = candidates == null ? new Set(set) : intersect(candidates, set);
      if (candidates.size === 0) break;
    }
    return candidates || new Set();
  }
}

function intersect(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set();
  for (const x of small) if (big.has(x)) out.add(x);
  return out;
}
