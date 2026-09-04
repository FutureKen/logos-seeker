#!/usr/bin/env node
/**
 * Build the **English** half of `public/data/study/**` from the Recovery
 * Version EPUB (footnotes, cross-references, outlines, book info).
 *
 *   STUDY_PASSWORD=… node scripts/build-study-en.mjs [--book 1 | --books 1-66]
 *                        [--epub <path>] [--out public/data/study] [--plain]
 *
 * Structure of the source (verified against the 2024 calibre build):
 *   toc.ncx           66 book navPoints between "Contents" and "Charts and Maps",
 *                     each pointing at the book's first chapter part; the part
 *                     just before it is the book Outline; chapter parts and note
 *                     parts are contiguous from there.
 *   chapter part      `<p id="Gen1-1" class="verse">` with `<a href="…#n1_1_1">
 *                     <sup>1a</sup>In</a>` markers, `<p class="text-outline">`
 *                     headings, and (chapter 1) `<p class="info">`/`<p class="subject">`.
 *   note part         one per chapter; `<div id="n1_1_1">` note blocks and
 *                     `<div id="c1_3_b">` cross-reference-only blocks.
 *
 * Marker offsets are measured on the normalized EPUB text and then mapped onto
 * the exact `verses.json` string with `mapOffsets`, because `verses.json` is a
 * newer revision of the English text; offsets that cannot be mapped become
 * `p: null` (the UI renders those as a verse-level marker group).
 *
 * Existing files are decrypted, their `cn` half kept, and re-encrypted, so the
 * English and Chinese pipelines can run in either order.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openEpub } from "./lib/epub.mjs";
import { parse, findAll, find, hasClass, attr, innerText, hrefAnchor } from "./lib/html.mjs";
import { normalizeEn, mapOffsets } from "./lib/align.mjs";
import {
  parseAnchor,
  parseNoteAnchor,
  parseXrefAnchor,
  refFromLink,
  rangeFromText,
  locsFromLinks,
  parseOutlineId,
  levelFromLabel,
} from "./lib/refResolve.mjs";
import { encryptJson, decryptJson } from "./lib/studyCrypto.mjs";
import { getStudyKey, passwordFromArgs } from "./lib/studyKey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EPUB = "G:\\Dropbox\\Public\\Gospel\\Recovery Bible_ENG (with_FN_OL_CR) .epub";

/** Sentinels smuggled through `normalizeEn` so offsets survive normalization. */
const MARK = "\uE000";
const HEAD = "\uE001";

/* ------------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const o = {
    epub: process.env.RCV_EN_EPUB || DEFAULT_EPUB,
    out: null,
    books: null,
    password: null,
    plain: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (inline) => (inline != null ? inline : argv[++i]);
    if (a === "--plain") o.plain = true;
    else if (a === "--quiet") o.quiet = true;
    else if (a.startsWith("--epub")) o.epub = val(a.includes("=") ? a.slice(7) : null);
    else if (a.startsWith("--out")) o.out = val(a.includes("=") ? a.slice(6) : null);
    else if (a.startsWith("--book=")) o.books = parseRange(a.slice(7));
    else if (a === "--book") o.books = parseRange(argv[++i]);
    else if (a.startsWith("--books=")) o.books = parseRange(a.slice(8));
    else if (a === "--books") o.books = parseRange(argv[++i]);
  }
  o.password = passwordFromArgs(argv);
  if (!o.out) o.out = o.plain ? "scripts/.cache/study-en-plain" : "public/data/study";
  if (!o.books) o.books = range(1, 66);
  return o;
}

function parseRange(spec) {
  const s = String(spec ?? "").trim();
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
  if (m) return range(Number(m[1]), Number(m[2]));
  if (/^\d+$/.test(s)) return [Number(s)];
  if (s.includes(",")) return s.split(",").flatMap((p) => parseRange(p));
  throw new Error(`bad book range: ${spec}`);
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/* ------------------------------------------------------- EPUB navigation */

const partName = (n) => `text/part${String(n).padStart(4, "0")}.html`;
const partNumber = (href) => {
  const m = /part(\d+)\.html/.exec(String(href ?? ""));
  return m ? Number(m[1]) : null;
};

/**
 * The 66 book navPoints, in canonical order, with the part numbers of the book
 * outline and of every chapter, and the 3-letter verse-id code of the book.
 */
export function readToc(epub, books) {
  const ncx = epub.read("toc.ncx");
  const nav = [
    ...ncx.matchAll(
      /<navPoint[^>]*>\s*<navLabel>\s*<text>([^<]*)<\/text>\s*<\/navLabel>\s*<content src="([^"]+)"/g,
    ),
  ].map((m) => ({ label: m[1].trim(), src: m[2] }));

  const start = nav.findIndex((n) => n.label === "Contents");
  const end = nav.findIndex((n) => n.label === "Charts and Maps");
  const slice = nav.slice(start + 1, end < 0 ? start + 67 : end);
  if (slice.length !== 66) throw new Error(`toc.ncx: expected 66 books, found ${slice.length}`);

  const out = [];
  for (let i = 0; i < 66; i++) {
    const meta = books[i];
    const first = partNumber(slice[i].src);
    const doc = parse(epub.read(partName(first)));
    const firstVerse = find(doc, (e) => e.name === "p" && hasClass(e, "verse") && attr(e, "id"));
    const code = /^([A-Za-z]+)\d+-\d+$/.exec(attr(firstVerse, "id") ?? "")?.[1] ?? null;
    if (!code) throw new Error(`${slice[i].label}: no verse id in ${partName(first)}`);

    // 2 Samuel / 2 Kings / 2 Chronicles have no outline part of their own: they
    // share the previous book's combined "1 & 2 …" outline, which is split by
    // the book code of each entry's start anchor.
    const candidate = first - 1;
    const title = /<title>([^<]*)<\/title>/.exec(epub.read(partName(candidate)))?.[1] ?? "";
    out.push({
      idx: meta.idx,
      label: slice[i].label,
      code,
      outlinePart: /outline/i.test(title) ? candidate : (out[i - 1]?.outlinePart ?? null),
      firstPart: first,
      chapters: meta.chapters.length,
    });
  }
  return out;
}

/** Flat chapter list in canonical order — note parts follow the same order. */
function chapterList(books) {
  const flat = [];
  for (const b of books) for (let c = 1; c <= b.chapters.length; c++) flat.push([b.idx, c]);
  return flat;
}

/* ------------------------------------------------------ text + markers */

const MARKER_ANCHOR = /^([nc])(\d+)_(\d+)_([0-9a-z]+)$/i;

/** Split a `<sup>` label into its note number and cross-reference letter. */
export function splitLabel(label) {
  const s = String(label ?? "").trim();
  const num = /(\d+)/.exec(s)?.[1];
  const letter = /([a-z]+)/i.exec(s)?.[1];
  return { num: num ? Number(num) : null, letter: letter ? letter.toLowerCase() : null };
}

const cleanWord = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;:.!?]+$/, "");

/**
 * Accumulate a verse paragraph's text into `state.raw`, inserting a `MARK`
 * sentinel before every marker's anchor word and recording the marker.
 */
function appendParagraph(state, p) {
  let skippedLabel = false;
  const rec = (node) => {
    if (node.type === "text") {
      state.raw += node.text;
      return;
    }
    if (node.type !== "el") return;
    if (node.name === "br") {
      state.raw += "\n";
      return;
    }
    if (node.name === "sup") return; // a bare label; never verse text
    if (node.name === "b" && !skippedLabel && !state.raw.replace(/[\uE000\uE001]/g, "").trim()) {
      skippedLabel = true; // the "Gn 1:1" verse label that opens every verse
      return;
    }
    if (node.name === "a") {
      const anchor = hrefAnchor(attr(node, "href"));
      const m = anchor ? MARKER_ANCHOR.exec(anchor) : null;
      if (m) {
        const sup = find(node, (e) => e.name === "sup");
        const label = sup ? innerText(sup).trim() : "";
        let word = "";
        for (const c of node.children) {
          if (c.type === "text") word += c.text;
          else if (c.type === "el" && c.name !== "sup") word += innerText(c);
        }
        state.raw += MARK + word;
        state.marks.push({ label, anchor, word: cleanWord(word) });
        return;
      }
    }
    for (const c of node.children ?? []) rec(c);
  };
  for (const c of p.children ?? []) rec(c);
}

/** Normalize the accumulated text and pull the sentinel offsets back out. */
export function extractOffsets(raw) {
  const normalized = normalizeEn(raw);
  let text = "";
  const marks = [];
  const heads = [];
  for (const ch of normalized) {
    if (ch === MARK) marks.push(text.length);
    else if (ch === HEAD) heads.push(text.length);
    else text += ch;
  }
  return { text, marks, heads };
}

/* ------------------------------------------------- chapter part parsing */

/**
 * Parse one chapter part.
 *
 * @returns {{verses: Map<number, {text, marks, heads}>, order: number[],
 *            headings: object[], info: object[], notePart: number|null}}
 */
export function parseChapterPart(html, chapter) {
  const doc = parse(html);
  const verses = new Map();
  const order = [];
  const headings = [];
  const info = [];
  let notePart = null;
  let current = null; // {num, raw, marks}
  let pendingHead = null; // a text-outline paragraph waiting for its anchor

  const flush = () => {
    if (!current) return;
    const { text, marks, heads } = extractOffsets(current.raw);
    verses.set(current.num, {
      text,
      marks: current.marks.map((m, i) => ({ ...m, offset: marks[i] ?? null })),
      heads,
    });
    current = null;
  };

  for (const el of findAll(doc, (e) => e.name === "p")) {
    if (hasClass(el, "verse")) {
      const id = attr(el, "id");
      if (id) {
        const num = Number(/^[A-Za-z]+\d+-(\d+)$/.exec(id)?.[1]);
        flush();
        current = { num, raw: "", marks: [] };
        order.push(num);
        if (pendingHead) {
          // A heading immediately before a new verse starts that verse.
          pendingHead.verse = num;
          pendingHead.mid = false;
          headings.push(pendingHead);
          pendingHead = null;
        }
      } else if (current) {
        current.raw += " ";
        if (pendingHead) {
          // A heading between two halves of one verse: remember where it fell.
          current.raw += HEAD;
          pendingHead.verse = current.num;
          pendingHead.mid = true;
          headings.push(pendingHead);
          pendingHead = null;
        }
      } else {
        continue;
      }
      appendParagraph(current, el);
      for (const a of findAll(el, (e) => e.name === "a")) {
        const anchor = hrefAnchor(attr(a, "href"));
        if (anchor && MARKER_ANCHOR.test(anchor)) notePart ??= partNumber(attr(a, "href"));
      }
      continue;
    }

    if (hasClass(el, "text-outline")) {
      const entries = parseTextOutline(el, chapter);
      if (entries.length) {
        if (pendingHead) headings.push({ ...pendingHead, verse: null, mid: false });
        pendingHead = { entries, verse: null, mid: false };
      }
      continue;
    }

    if (hasClass(el, "info") || hasClass(el, "subject")) info.push(el);
  }
  flush();
  if (pendingHead) headings.push({ ...pendingHead, verse: null, mid: false });

  return { verses, order, headings, info, notePart };
}

/**
 * `<p class="text-outline">I. Title<br/>1:1 — 2:25<br/>A. …<br/>1:1 — 2:3</p>`
 * → `[{level, label, title, start, end}]` (Locs, chapter-relative).
 */
export function parseTextOutline(el, chapter) {
  const lines = innerText(el, { br: "\n" })
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const m = /^(\([0-9a-z]+\)|[A-Za-z0-9]+\.)\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const level = levelFromLabel(m[1]);
    if (!level) continue;
    const r = rangeFromText(lines[i + 1]);
    if (!r) continue;
    const startChapter = r.start.chapter ?? chapter;
    const start = [startChapter, r.start.verse, r.start.part];
    const end = r.end
      ? [r.end.chapter ?? startChapter, r.end.verse, r.end.part]
      : [...start];
    out.push({ level, label: m[1], title: m[2], start, end });
  }
  return out;
}

/* --------------------------------------------------- note part parsing */

/**
 * Parse a chapter's note part into `{verse → {notes, xrefs}}`.
 *
 * @param {string} html
 * @param {{bookOf: (code:string)=>number|null, noteRefOf: (part:number)=>[number,number]|null}} ctx
 */
export function parseNotesPart(html, ctx) {
  const doc = parse(html);
  const byVerse = new Map();
  const unresolved = [];

  const slot = (verse) => {
    let s = byVerse.get(verse);
    if (!s) byVerse.set(verse, (s = { notes: new Map(), xrefs: new Map() }));
    return s;
  };

  for (const div of findAll(doc, (e) => e.name === "div" && attr(e, "id"))) {
    const id = attr(div, "id");
    const note = parseNoteAnchor(id);
    const xref = parseXrefAnchor(id);
    if (!note && !xref) continue;
    const verse = (note ?? xref).verse;
    const s = slot(verse);

    // `<p class="note-head"><b><a …>Gn 1:1<sup>1a</sup> In</a></b> - <span id="xr_…">`
    const head = find(div, (e) => e.name === "p" && hasClass(e, "note-head"));
    const headLink = head
      ? find(head, (e) => e.name === "a" && /#[A-Za-z]+\d+/.test(attr(e, "href") ?? ""))
      : null;
    const headSup = headLink ? find(headLink, (e) => e.name === "sup") : null;
    const label = headSup ? innerText(headSup).trim() : "";
    const { num, letter } = splitLabel(label);

    // Cross-references: the `<span id="xr_…">` inside the head.
    const span = head ? find(head, (e) => e.name === "span" && /^xr_/.test(attr(e, "id") ?? "")) : null;
    const key = xref ? xref.letter : letter;
    if (span && key) {
      const items = parseXrefSpan(span, ctx, unresolved);
      if (items.length) s.xrefs.set(key, items);
    }

    // Note text: only `n…` blocks carry a footnote of their own; a `c…` block's
    // paragraph is a "See note 3¹" pointer at a note that already exists.
    const paras = findAll(div, (e) => e.name === "p" && hasClass(e, "note"));
    const rich = paras.map((p) => richFromNode(p, ctx, unresolved)).filter((r) => r.length);
    if (note && rich.length) s.notes.set(note.num, rich);
    else if (xref && rich.length && num != null && !s.notes.has(num)) {
      s.pending ??= new Map();
      s.pending.set(num, rich);
    }
  }

  // A `c…` block's pointer text becomes the note only when the real note block
  // for that number is missing from the chapter.
  for (const s of byVerse.values()) {
    for (const [num, rich] of s.pending ?? []) if (!s.notes.has(num)) s.notes.set(num, rich);
    delete s.pending;
  }
  return { byVerse, unresolved };
}

/** `<span id="xr_…">Isa. 45:7; 2 Cor. 4:6; cf. John 1:4-5</span>` → xref items. */
export function parseXrefSpan(span, ctx, unresolved = []) {
  const items = [];
  let cf = false;
  const rec = (node) => {
    if (node.type === "text") {
      if (/\bcf\./i.test(node.text)) cf = true;
      return;
    }
    if (node.type !== "el") return;
    if (node.name === "a") {
      const anchor = hrefAnchor(attr(node, "href"));
      const t = cleanRefText(innerText(node));
      // "Titus 2:13 and note 4" — the tail links a note (or cross-reference)
      // block, not a verse; point it at the verse that block hangs on so the
      // chip still navigates.
      const block = anchor ? (parseNoteAnchor(anchor) ?? parseXrefAnchor(anchor)) : null;
      const book = block ? ctx.bookOfPart?.(attr(node, "href")) : null;
      const raw = book
        ? [book, block.chapter, block.verse, 0]
        : anchor
          ? refFromLink(anchor, t, ctx.bookOf)
          : null;
      const r = raw && ctx.clampRef ? ctx.clampRef(raw) : raw;
      if (r && t) items.push(cf ? { r, t, cf: true } : { r, t });
      else if (anchor) unresolved.push(anchor);
      return;
    }
    for (const c of node.children ?? []) rec(c);
  };
  for (const c of span.children ?? []) rec(c);
  return items;
}

/**
 * Keep a `Ref` inside the bounds `books.json` declares. A handful of EPUB
 * anchors point past the end of a chapter (Ezek. 36 note 1 links "vv. 22-33"
 * to Ezek. 32), and `verses.json` itself files Psalm 131:1 under 132:0.
 */
export function makeClampRef(books) {
  const by = new Map(books.map((b) => [b.idx, b.chapters]));
  return (r) => {
    if (!r) return r;
    const chapters = by.get(r[0]);
    if (!chapters) return null;
    const c = Math.min(Math.max(r[1], 1), chapters.length);
    const last = chapters[c - 1];
    const v = Math.min(Math.max(r[2], 0), last);
    const ve = r[3] > v && r[3] <= last ? r[3] : 0;
    return [r[0], c, v, ve];
  };
}

const cleanRefText = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[;,]+$/, "")
    .replace(/\s*[—–-]$/, "")
    .trim();

/* --------------------------------------------------------------- Rich */

/** One `<p>` → a `Paragraph` (array of runs). */
export function richFromNode(node, ctx, unresolved = []) {
  const runs = [];
  const pushText = (t) => {
    if (!t) return;
    const last = runs[runs.length - 1];
    if (typeof last === "string") runs[runs.length - 1] = last + t;
    else runs.push(t);
  };

  const linkRun = (el) => {
    const anchor = hrefAnchor(attr(el, "href"));
    // A `<sup>` inside the link ("note 3" + sup "1") becomes its own run, so
    // the link text stays a single contiguous string.
    let before = "";
    let sup = "";
    let after = "";
    let seenSup = false;
    const rec = (n) => {
      if (n.type === "text") {
        if (seenSup) after += n.text;
        else before += n.text;
        return;
      }
      if (n.type !== "el") return;
      if (n.name === "sup") {
        seenSup = true;
        sup += innerText(n);
        return;
      }
      for (const c of n.children ?? []) rec(c);
    };
    for (const c of el.children ?? []) rec(c);

    if (!before.trim()) {
      // No text before the superscript: the whole link is one label.
      before += after;
      after = "";
    }
    const whole = collapse(before + after);
    const label = cleanRefText(before);
    const noteA = anchor ? parseNoteAnchor(anchor) : null;
    const xrefA = anchor && !noteA ? parseXrefAnchor(anchor) : null;
    let emitted = false;

    if (noteA) {
      const book = ctx.bookOfPart?.(attr(el, "href")) ?? null;
      if (book && label) {
        runs.push({ note: [book, noteA.chapter, noteA.verse, noteA.num], t: label });
        emitted = true;
      }
    } else if (xrefA) {
      const book = ctx.bookOfPart?.(attr(el, "href")) ?? null;
      const r = book ? (ctx.clampRef?.([book, xrefA.chapter, xrefA.verse, 0]) ?? [book, xrefA.chapter, xrefA.verse, 0]) : null;
      if (r && label) {
        runs.push({ ref: r, t: label });
        emitted = true;
      }
    } else if (anchor && parseAnchor(anchor)) {
      const raw = refFromLink(anchor, whole, ctx.bookOf);
      const r = raw && ctx.clampRef ? ctx.clampRef(raw) : raw;
      if (r && label) {
        runs.push({ ref: r, t: label });
        emitted = true;
      } else unresolved.push(anchor);
    }
    if (!emitted) pushText(before);
    if (sup.trim()) runs.push({ sup: sup.trim() });
    pushText(after);
  };

  const rec = (n) => {
    if (n.type === "text") {
      pushText(n.text);
      return;
    }
    if (n.type !== "el") return;
    if (n.name === "br") {
      pushText(" ");
      return;
    }
    if (n.name === "i" || n.name === "em") {
      const t = collapse(innerText(n));
      if (t) runs.push({ i: t });
      return;
    }
    if (n.name === "sup") {
      const t = innerText(n).trim();
      if (t) runs.push({ sup: t });
      return;
    }
    if (n.name === "a") {
      linkRun(n);
      return;
    }
    for (const c of n.children ?? []) rec(c);
  };
  for (const c of node.children ?? []) rec(c);

  return tidyRuns(runs);
}

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ");

function tidyRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (typeof r === "string") {
      const t = collapse(r);
      if (!t) continue;
      const last = out[out.length - 1];
      if (typeof last === "string") out[out.length - 1] = last + t;
      else out.push(t);
    } else out.push(r);
  }
  if (typeof out[0] === "string") out[0] = out[0].replace(/^\s+/, "");
  const n = out.length - 1;
  if (n >= 0 && typeof out[n] === "string") out[n] = out[n].replace(/\s+$/, "");
  return out.filter((r) => r !== "");
}

/* ------------------------------------------------------- outline part */

/**
 * The book Outline part → contract outline entries.
 *
 * `code` selects the book when the part is a combined outline ("1 & 2 Samuel");
 * `chapters` is the books.json verse-count array, used to clamp ranges that
 * reach into the following book, which a book-relative `Loc` cannot express.
 */
export function parseOutlinePart(html, { code, chapters } = {}) {
  const doc = parse(html);
  const out = [];
  const lastLoc = chapters ? [chapters.length, chapters[chapters.length - 1], 0] : null;
  const clamp = (loc) => {
    if (!chapters || !loc) return loc;
    const c = Math.min(Math.max(loc[0], 1), chapters.length);
    const v = Math.min(Math.max(loc[1], 0), chapters[c - 1]);
    return [c, v, loc[2]];
  };
  for (const li of findAll(doc, (e) => e.name === "li" && attr(e, "id"))) {
    const meta = parseOutlineId(attr(li, "id"));
    if (!meta) continue;

    // The li's own content, up to the first nested <ol>.
    let title = "";
    const links = [];
    for (const c of li.children ?? []) {
      if (c.type === "el" && c.name === "ol") break;
      if (c.type === "el" && c.name === "a") {
        links.push(c);
        continue;
      }
      if (links.length) continue;
      title += c.type === "text" ? c.text : innerText(c);
    }
    title = collapse(title)
      .trim()
      .replace(/^\(?[A-Za-z0-9]+[.)]\s*/, "")
      .replace(/[\s—–-]+$/, "")
      .trim();
    if (!title || !links.length) continue;

    const startAnchor = parseAnchor(hrefAnchor(attr(links[0], "href")));
    if (!startAnchor) continue;
    if (code && startAnchor.code !== code) continue; // another book of a combined outline

    const endAnchor = links[1] ? parseAnchor(hrefAnchor(attr(links[1], "href"))) : null;
    const sameBook = !endAnchor || endAnchor.code === startAnchor.code;
    const locs = locsFromLinks(
      hrefAnchor(attr(links[0], "href")),
      innerText(links[0]),
      sameBook && links[1] ? hrefAnchor(attr(links[1], "href")) : null,
      sameBook && links[1] ? innerText(links[1]) : null,
    );
    if (!locs) continue;
    // A range that runs into the next book ends at this book's last verse.
    const end = sameBook ? clamp(locs.end) : (lastLoc ?? locs.end);
    const start = clamp(locs.start);
    out.push({ level: meta.level, label: meta.label, title, start, end });
  }
  if (out.length) return out;

  // Psalms is outlined as a definition list of its five books rather than an
  // ordered list: `<dt>Book One — <a>Psalms 1 —</a> <a>41</a></dt><dd>…</dd>`.
  for (const dl of findAll(doc, (e) => e.name === "dl")) {
    let pending = null;
    for (const child of dl.children ?? []) {
      if (child.type !== "el") continue;
      if (child.name === "dt") {
        const links = findAll(child, (e) => e.name === "a");
        const label = collapse(innerText(child).split("—")[0]).trim();
        pending = links.length ? { label, links } : null;
        continue;
      }
      if (child.name !== "dd" || !pending) continue;
      const title = collapse(innerText(child)).trim();
      const locs = locsFromLinks(
        hrefAnchor(attr(pending.links[0], "href")),
        innerText(pending.links[0]),
        pending.links[1] ? hrefAnchor(attr(pending.links[1], "href")) : null,
        pending.links[1] ? innerText(pending.links[1]) : null,
      );
      if (title && locs) {
        out.push({ level: 1, label: pending.label, title, start: clamp(locs.start), end: clamp(locs.end) });
      }
      pending = null;
    }
  }
  return out;
}

/* ---------------------------------------------------------- book info */

const INFO_FIELDS = [
  [/^authors?$/i, "author"],
  [/^time of writing$/i, "written"],
  [/^time of his ministry$/i, "written"],
  [/^place of (writing|the record|his ministry)$/i, "place"],
  [/^time period covered$/i, "period"],
  [/^subject\b/i, "subject"],
  [/^(recipients?|object of his ministry)$/i, "recipients"],
];

/** `<p class="info">Author: …</p>` paragraphs → the contract's `info` object. */
export function parseInfo(paras, ctx, unresolved = []) {
  const info = {};
  for (const p of paras) {
    const text = innerText(p, { br: "\n" });
    const label = (text.split(/[:\n]/)[0] ?? "").trim();
    const field = INFO_FIELDS.find(([re]) => re.test(label))?.[1] ?? null;

    if (hasClass(p, "subject") || field === "subject") {
      const body = text.replace(/^[^:\n]*:?\s*/, "").replace(/\s+/g, " ").trim();
      if (body) info.subject = [[body]];
      continue;
    }
    const rich = richFromNode(p, ctx, unresolved);
    if (!rich.length) continue;
    if (typeof rich[0] === "string") {
      rich[0] = rich[0].replace(/^[^:]{0,40}:\s*/, "");
      if (!rich[0]) rich.shift();
    }
    if (!rich.length) continue;
    // An unlabelled paragraph ("For Author, … see 1 Samuel.") stands in for the
    // whole card; the five canonical fields are otherwise filled by label.
    const key = field ?? (Object.keys(info).length ? null : "author");
    if (!key) continue;
    info[key] = info[key] ? [...info[key], rich] : [rich];
  }
  return Object.keys(info).length ? info : null;
}

/* ------------------------------------------------------------- build */

function markerSort(a, b) {
  if (a.p == null && b.p == null) return a.seq - b.seq;
  if (a.p == null) return 1;
  if (b.p == null) return -1;
  return a.p - b.p || a.seq - b.seq;
}

/** Merge markers that landed on the same position into one label. */
function mergeMarkers(list) {
  const out = [];
  for (const mk of list) {
    const prev = out[out.length - 1];
    const mergeable =
      prev &&
      prev.p != null &&
      prev.p === mk.p &&
      !(prev.n != null && mk.n != null && prev.n !== mk.n) &&
      !(prev.x != null && mk.x != null && prev.x !== mk.x);
    if (!mergeable) {
      out.push(mk);
      continue;
    }
    const num = prev.n ?? mk.n;
    const letter = prev.x ?? mk.x;
    prev.l = `${num ?? ""}${letter ?? ""}` || prev.l;
    if (num != null) prev.n = num;
    if (letter != null) prev.x = letter;
    prev.w ??= mk.w;
  }
  return out;
}

/** Build the English half of one chapter. */
export function buildChapterEn({ chapterHtml, parsed: pre, notesHtml, chapter, verseTextOf, ctx, log }) {
  const parsed = pre ?? parseChapterPart(chapterHtml, chapter);
  const notes = notesHtml ? parseNotesPart(notesHtml, ctx) : { byVerse: new Map(), unresolved: [] };
  const stats = { verses: 0, total: 0, exact: 0, diff: 0, snap: 0, none: 0, dropped: 0 };
  const unresolved = [...notes.unresolved];
  const verses = {};
  const heads = [];

  const shift = detectShift(parsed, verseTextOf);
  if (shift) log?.(`  verse numbering shifted by ${shift}`);

  for (const num of parsed.order) {
    const v = parsed.verses.get(num);
    const target = num + shift;
    const dst = verseTextOf(target);
    if (dst == null) {
      if (v.marks.length) stats.dropped += v.marks.length;
      continue;
    }
    stats.verses++;

    const mapped = mapOffsets(v.text, dst, v.marks.map((m) => m.offset));
    const headPos = mapOffsets(v.text, dst, v.heads);

    const apparatus = notes.byVerse.get(num);
    const list = [];
    v.marks.forEach((mk, i) => {
      const { num: n, letter } = splitLabel(mk.label);
      const hasNote = n != null && !!apparatus?.notes.has(n);
      const hasXref = !!letter && !!apparatus?.xrefs.has(letter);
      if (!hasNote && !hasXref) {
        stats.dropped++;
        return;
      }
      // Recompose the label from the halves that actually resolved, so a
      // marker never advertises a note or reference the file does not carry.
      const l = `${hasNote ? n : ""}${hasXref ? letter : ""}`;
      const entry = { l, p: mapped[i].pos, seq: i };
      if (hasNote) entry.n = n;
      if (hasXref) entry.x = letter;
      if (mk.word) entry.w = mk.word;
      stats.total++;
      stats[mapped[i].how]++;
      list.push(entry);
    });
    if (!list.length) continue;

    const markers = mergeMarkers(list.sort(markerSort)).map(({ seq, ...m }) => m);
    const used = { n: new Set(), x: new Set() };
    for (const m of markers) {
      if (m.n != null) used.n.add(m.n);
      if (m.x != null) used.x.add(m.x);
    }

    const entry = { m: markers };
    const n = {};
    for (const k of [...used.n].sort((a, b) => a - b)) n[k] = apparatus.notes.get(k);
    if (Object.keys(n).length) entry.n = n;
    const x = {};
    for (const k of [...used.x].sort()) x[k] = apparatus.xrefs.get(k);
    if (Object.keys(x).length) entry.x = x;
    verses[target] = entry;

    // Mid-verse outline positions, in this verse's coordinate system.
    let hi = 0;
    for (const h of parsed.headings) {
      if (!h.mid || h.verse !== num) continue;
      const pos = headPos[hi++]?.pos ?? null;
      for (const e of h.entries) heads.push({ ...e, pos, verse: target });
    }
  }

  // Headings that start a verse carry no mid-verse position.
  for (const h of parsed.headings) {
    if (h.mid) continue;
    for (const e of h.entries) heads.push({ ...e, pos: null, verse: h.verse });
  }

  return { verses, heads, stats, unresolved };
}

/**
 * The EPUB and `verses.json` disagree about verse numbering in a handful of
 * chapters (1 Chron. 22, John 7 …). When shifting every verse by one lines the
 * texts up far better, use the shift rather than attaching notes to the wrong
 * verses.
 */
function detectShift(parsed, verseTextOf) {
  const score = (s) => {
    let hits = 0;
    for (const [num, v] of parsed.verses) {
      const dst = verseTextOf(num + s);
      if (dst != null && dst === v.text) hits++;
    }
    return hits;
  };
  const base = score(0);
  if (base >= parsed.verses.size * 0.5) return 0;
  for (const s of [-1, 1]) if (score(s) > base + 2) return s;
  return 0;
}

/* --------------------------------------------------------------- I/O */

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

async function readExisting(file, key) {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = readJson(file);
    if (raw && typeof raw.ct === "string") return key ? await decryptJson(raw, key) : null;
    return raw;
  } catch {
    return null;
  }
}

async function writeStudyFile(file, obj, key) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = key ? JSON.stringify(await encryptJson(obj, key)) : JSON.stringify(obj, null, 2);
  fs.writeFileSync(file, body + "\n");
  return Buffer.byteLength(body) + 1;
}

/* -------------------------------------------------------------- main */

export async function run(opts) {
  const o = { ...opts };
  const outDir = path.resolve(ROOT, o.out);
  const books = readJson(path.join(ROOT, "public/data/books.json"));
  const verses = readJson(path.join(ROOT, "public/data/verses.json"));

  const verseText = new Map();
  for (const r of verses) verseText.set(`${r[0]}:${r[1]}:${r[2]}`, r[3] ?? "");

  const epub = openEpub(o.epub);
  const toc = readToc(epub, books);
  const codeToBook = new Map(toc.map((b) => [b.code, b.idx]));
  const bookOf = (code) => codeToBook.get(code) ?? null;

  const flat = chapterList(books);
  const firstNotePart = toc[65].firstPart + toc[65].chapters; // right after Revelation
  const noteRefOf = (part) => (part == null ? null : (flat[part - firstNotePart] ?? null));
  /** Which book a `part1257.html#n1_1_1` style link belongs to. */
  const bookOfPart = (href) => noteRefOf(partNumber(href))?.[0] ?? null;
  const clampRef = makeClampRef(books);

  const key = o.plain ? null : (await getStudyKey(outDir, o.password)).key;

  const totals = { chapters: 0, verses: 0, total: 0, exact: 0, diff: 0, snap: 0, none: 0, dropped: 0 };
  const unresolvedAll = new Map();
  const problems = [];
  let bytes = 0;

  for (const idx of o.books) {
    const meta = toc[idx - 1];
    if (!meta) {
      problems.push(`book ${idx}: not in the toc`);
      continue;
    }
    const bookMeta = books[idx - 1];
    const heads = [];

    for (let c = 1; c <= meta.chapters; c++) {
      try {
        const chapterHtml = epub.read(partName(meta.firstPart + c - 1));
        const parsed = parseChapterPart(chapterHtml, c);
        const notesHtml = parsed.notePart != null ? epub.read(partName(parsed.notePart)) : null;

        const ctx = { bookOf, bookOfPart, clampRef };
        const built = buildChapterEn({
          parsed,
          notesHtml,
          chapter: c,
          verseTextOf: (v) => verseText.get(`${idx}:${c}:${v}`) ?? null,
          ctx,
          log: o.quiet ? null : (m) => console.log(`${bookMeta.en} ${c}:${m}`),
        });
        // Verses beyond the books.json length would fail the schema.
        for (const k of Object.keys(built.verses)) {
          if (Number(k) > bookMeta.chapters[c - 1]) delete built.verses[k];
        }
        heads.push(...built.heads.map((h) => ({ ...h, chapter: c })));

        const file = path.join(outDir, String(idx), `${c}.json`);
        const existing = await readExisting(file, key);
        const obj = {
          schema: 1,
          book: idx,
          chapter: c,
          en: { verses: built.verses },
          ...(existing?.cn ? { cn: existing.cn } : {}),
        };
        bytes += await writeStudyFile(file, obj, key);

        const s = built.stats;
        for (const k of Object.keys(totals)) if (k in s) totals[k] += s[k];
        totals.chapters++;
        for (const a of built.unresolved) unresolvedAll.set(a, (unresolvedAll.get(a) ?? 0) + 1);
        if (!o.quiet) {
          console.log(
            `${bookMeta.en} ${c}: verses ${s.verses}/${parsed.order.length}, markers ${s.total} ` +
              `(exact ${s.exact}, diff ${s.diff}, snap ${s.snap}, none ${s.none})` +
              `${s.dropped ? `, dropped ${s.dropped}` : ""}` +
              `${built.unresolved.length ? `, unresolved ${built.unresolved.length}` : ""}`,
          );
        }
      } catch (e) {
        problems.push(`${bookMeta.en} ${c}: ${e.message}`);
        console.error(`ERROR ${bookMeta.en} ${c}: ${e.message}`);
      }
    }

    // book.json — outline (with mid-verse positions merged in) and info.
    try {
      const outline =
        meta.outlinePart == null
          ? []
          : parseOutlinePart(epub.read(partName(meta.outlinePart)), {
              code: meta.code,
              chapters: bookMeta.chapters,
            });
      const posBy = new Map();
      for (const h of heads) {
        if (h.pos == null) continue;
        posBy.set(`${h.start[0]}:${h.start[1]}:${h.start[2]}|${h.level}`, h.pos);
        posBy.set(`${h.start[0]}:${h.start[1]}:${h.start[2]}`, h.pos);
      }
      for (const e of outline) {
        if (e.start[2] !== 2) continue;
        const pos =
          posBy.get(`${e.start[0]}:${e.start[1]}:${e.start[2]}|${e.level}`) ??
          posBy.get(`${e.start[0]}:${e.start[1]}:${e.start[2]}`);
        if (pos != null) e.pos = pos;
      }

      const firstHtml = epub.read(partName(meta.firstPart));
      const infoParas = parseChapterPart(firstHtml, 1).info;
      const unresolvedInfo = [];
      const info = parseInfo(infoParas, { bookOf, bookOfPart, clampRef }, unresolvedInfo);
      for (const a of unresolvedInfo) unresolvedAll.set(a, (unresolvedAll.get(a) ?? 0) + 1);

      const file = path.join(outDir, String(idx), "book.json");
      const existing = await readExisting(file, key);
      const obj = {
        schema: 1,
        book: idx,
        en: { info, outline },
        ...(existing?.cn ? { cn: existing.cn } : {}),
      };
      bytes += await writeStudyFile(file, obj, key);
    } catch (e) {
      problems.push(`${bookMeta.en} book.json: ${e.message}`);
      console.error(`ERROR ${bookMeta.en} book.json: ${e.message}`);
    }
  }

  return { totals, unresolved: unresolvedAll, problems, bytes, outDir };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scripts", "build-study-en.mjs"));

if (invokedDirectly) {
  const started = Date.now();
  const o = parseArgs(process.argv.slice(2));
  const res = await run(o);
  const t = res.totals;
  const pct = (n) => (t.total ? ((n / t.total) * 100).toFixed(2) : "0.00");
  console.log(
    `\n${t.chapters} chapters, ${t.verses} verses, ${t.total} markers — ` +
      `exact ${t.exact} (${pct(t.exact)}%), diff ${t.diff} (${pct(t.diff)}%), ` +
      `snap ${t.snap} (${pct(t.snap)}%), none ${t.none} (${pct(t.none)}%)`,
  );
  console.log(
    `dropped ${t.dropped} marker(s) with no apparatus, ` +
      `${res.unresolved.size} unresolved anchor(s), ` +
      `${(res.bytes / 1048576).toFixed(2)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s → ${res.outDir}`,
  );
  if (res.unresolved.size) {
    console.log(`unresolved: ${[...res.unresolved.keys()].slice(0, 20).join(", ")}`);
  }
  for (const p of res.problems) console.error(`ERROR ${p}`);
  process.exit(res.problems.length ? 1 : 0);
}
