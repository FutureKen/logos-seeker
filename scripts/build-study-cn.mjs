#!/usr/bin/env node
/**
 * Build the Chinese half of the study data from the raw recoveryversion.com.tw
 * cache written by `fetch-rcv-tw.mjs`.
 *
 *   node scripts/build-study-cn.mjs [--book N | --all] [--out public/data/study]
 *                                   [--password … | env STUDY_PASSWORD] [--plain]
 *
 * Per chapter the verse units are joined with a single space and compared with
 * the `verses.json` Chinese string (an exact match is the fast path); marker
 * offsets (`unitOffset + loc − 1`) are mapped through that comparison so every
 * `p` indexes the string the app actually renders. Markers that share a
 * position are merged into one label (digits before letters).
 *
 * Files are written into the **bilingual** study files: an existing file is
 * decrypted, its `cn` half replaced and its `en` half preserved, then
 * re-encrypted with the key from `<out>/index.json`. `--plain` writes readable
 * JSON instead, for eyeballing a build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCn, mapOffsets } from "./lib/align.mjs";
import { parseCnRefList, parseOutlineContent } from "./lib/cnRef.mjs";
import { encryptJson, decryptJson } from "./lib/studyCrypto.mjs";
import { getStudyKey, passwordFromArgs } from "./lib/studyKey.mjs";
import { validateBookFile, validateChapterFile } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts/.cache/rcv-tw");

export function parseArgs(argv) {
  const o = { book: null, all: false, out: "public/data/study", password: null, plain: false, cache: CACHE, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") o.all = true;
    else if (a === "--plain") o.plain = true;
    else if (a === "--quiet") o.quiet = true;
    else if (a === "--book") o.book = Number(argv[++i]);
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--cache") o.cache = argv[++i];
    else if (a.startsWith("--book=")) o.book = Number(a.slice(7));
    else if (a.startsWith("--out=")) o.out = a.slice(6);
    else if (a.startsWith("--cache=")) o.cache = a.slice(8);
  }
  o.password = passwordFromArgs(argv);
  return o;
}

/* ----------------------------------------------------------------- helpers */

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Group rows by a key, preserving the order the API returned them in. */
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows ?? []) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/**
 * Map raw offsets in `src` onto the exact `dst` string, ignoring the
 * whitespace that `normalizeCn` drops on either side.
 *
 * @returns {{pos: number|null, how: string}[]}
 */
export function mapCnOffsets(src, dst, offsets) {
  if (src === dst) {
    return offsets.map((o) => (o == null || o < 0 || o > dst.length ? { pos: null, how: "none" } : { pos: o, how: "exact" }));
  }
  // Index translation raw ⇄ normalized, on both sides.
  const strip = (s) => {
    const keep = [];
    let out = "";
    for (let i = 0; i < s.length; i++) {
      if (normalizeCn(s[i]) === "") continue;
      keep.push(i);
      out += s[i];
    }
    return { text: out, keep };
  };
  const a = strip(src);
  const b = strip(dst);
  const rawToNorm = new Array(src.length + 1).fill(null);
  for (let n = 0; n < a.keep.length; n++) rawToNorm[a.keep[n]] = n;
  rawToNorm[src.length] = a.text.length;
  // An offset that lands on a stripped character moves to the next kept one.
  for (let i = src.length - 1; i >= 0; i--) if (rawToNorm[i] == null) rawToNorm[i] = rawToNorm[i + 1];

  const normOffsets = offsets.map((o) => (o == null || o < 0 || o > src.length ? null : rawToNorm[o]));
  const mapped = mapOffsets(a.text, b.text, normOffsets);
  return mapped.map((m) => {
    if (m.pos == null) return { pos: null, how: "none" };
    const raw = m.pos >= b.keep.length ? dst.length : b.keep[m.pos];
    return { pos: raw, how: m.how };
  });
}

/**
 * `ˍ`-separated paragraphs → plain paragraph strings. Nothing is trimmed:
 * `footnoteLinks` offsets are measured on exactly this text with the `ˍ`
 * characters removed, so any edit here would shift every span.
 */
export function splitParagraphs(content) {
  return String(content ?? "")
    .split("ˍ")
    .filter((p) => p !== "");
}

/**
 * Turn a linked span into Rich runs. `note` items become `{note}` runs, plain
 * references become `{ref}` runs, and anything unparsed stays as text.
 */
export function refRuns(text, ctx, stats) {
  const items = parseCnRefList(text, ctx);
  const inRange = ctx?.refOk ?? (() => true);
  const runs = [];
  let cursor = 0;
  for (const it of items) {
    const at = text.indexOf(it.t, cursor);
    if (at < 0) continue;
    if (at > cursor) runs.push(text.slice(cursor, at));
    if (!it.r) {
      if (stats) stats.unparsed++;
      runs.push(it.t);
    } else if (!inRange(it.r)) {
      // The reference reads fine but points outside the books.json verse
      // ranges (Psalm 131 is short a verse there); keep the words, drop the link.
      if (stats) stats.outOfRange = (stats.outOfRange ?? 0) + 1;
      runs.push(it.t);
    } else if (it.note != null) {
      runs.push({ note: [it.r[0], it.r[1], it.r[2], it.note], t: it.t });
    } else {
      runs.push({ ref: it.r, t: it.t });
    }
    cursor = at + it.t.length;
  }
  if (cursor < text.length) runs.push(text.slice(cursor));
  return runs.length ? runs : [text];
}

/**
 * Split `paragraphs` (plain strings) at the `[start, end)` spans in `links`,
 * whose offsets index the paragraphs concatenated without separators.
 */
export function applyLinks(paragraphs, links, ctx, stats) {
  const bounds = [];
  let at = 0;
  for (const p of paragraphs) {
    bounds.push([at, at + p.length]);
    at += p.length;
  }
  const total = at;
  const spans = links
    .map((l) => ({ start: l.start_loc - 1, end: l.end_loc }))
    .filter((s) => s.start >= 0 && s.end > s.start && s.end <= total)
    .sort((x, y) => x.start - y.start);

  return paragraphs.map((text, pi) => {
    const [lo, hi] = bounds[pi];
    const runs = [];
    let cursor = 0;
    for (const s of spans) {
      if (s.start < lo || s.end > hi) continue;
      const a = s.start - lo;
      const b = s.end - lo;
      if (a < cursor) continue;
      if (a > cursor) runs.push(text.slice(cursor, a));
      runs.push(...refRuns(text.slice(a, b), ctx, stats));
      cursor = b;
    }
    if (cursor < text.length) runs.push(text.slice(cursor));
    return mergeText(runs.length ? runs : [text]);
  });
}

/** Collapse adjacent plain-string runs, dropping empties. */
function mergeText(runs) {
  const out = [];
  for (const r of runs) {
    if (typeof r === "string") {
      if (!r) continue;
      if (typeof out[out.length - 1] === "string") out[out.length - 1] += r;
      else out.push(r);
    } else out.push(r);
  }
  return out.length ? out : [""];
}

/* ------------------------------------------------------------- one chapter */

/**
 * @param {object} raw cached `{book}/{chapter}.json`
 * @param {Map<number,string>} verseText verse number → exact verses.json CN text
 * @returns {{verses: object, stats: object}}
 */
export function buildChapter(raw, verseText, opts = {}) {
  const book = raw.book;
  const chapter = raw.chapter;
  const refOk = opts.refOk ?? (() => true);
  const maxVerse = opts.maxVerse ?? Infinity;
  const stats = { verses: 0, match: 0, exact: 0, diff: 0, snap: 0, none: 0, unparsed: 0, notes: 0, xrefs: 0, outOfRange: 0, skipped: 0 };

  const unitsByVerse = groupBy(raw.verses, "segment_code");
  const notesByVerse = groupBy(raw.footnotes, "segment_code");
  const footsByVerse = groupBy(raw.foots, "segment_code");
  const linksByVerse = groupBy(raw.footnoteLinks, "segment_code");

  const verses = {};
  for (const [vn, units] of [...unitsByVerse].sort((a, b) => a[0] - b[0])) {
    const notes = notesByVerse.get(vn) ?? [];
    const foots = footsByVerse.get(vn) ?? [];
    if (!notes.length && !foots.length) continue;
    // The API has verses our verses.json does not — 1 Chr 22:19, and the
    // Psalm superscriptions it numbers 0. The app has no row to hang those
    // markers on, so leave them out rather than emit something unreachable.
    if (vn > maxVerse || !verseText.has(vn)) {
      stats.skipped++;
      continue;
    }
    stats.verses++;

    const src = units.map((u) => u.content).join(" ");
    const dst = verseText.get(vn) ?? src;
    if (src === dst) stats.match++;

    // Offset of each unit inside the joined string.
    const unitOffset = new Map();
    let at = 0;
    for (const u of units) {
      unitOffset.set(u.unit_code, at);
      at += u.content.length + 1;
    }

    /** Raw marker events, before merging and offset mapping. */
    const events = [];
    const noteRich = {};
    const seenNote = new Set();
    for (const n of notes) {
      const base = unitOffset.get(n.unit_code);
      const off = base == null ? null : base + (n.note_loc - 1);
      events.push({ off, kind: "n", key: String(n.note_num) });
      // An empty `note_content` is a repeat marker for a note already given.
      if (!n.note_content || seenNote.has(String(n.note_num))) continue;
      seenNote.add(String(n.note_num));
      const paragraphs = splitParagraphs(n.note_content);
      noteRich[String(n.note_num)] = paragraphs.length ? paragraphs : [""];
    }
    for (const f of foots) {
      const base = unitOffset.get(f.unit_code);
      const off = base == null ? null : base + (f.loc - 1);
      events.push({ off, kind: "x", key: String(f.beaded) });
    }

    // Footnote-link spans are measured on every note of the verse concatenated
    // (ˍ removed) in the order the API returned them.
    const noteOrder = notes.filter((n) => n.note_content);
    const flat = [];
    for (const n of noteOrder) flat.push(...splitParagraphs(n.note_content));
    const flatRich = applyLinks(flat, linksByVerse.get(vn) ?? [], { book, chapter, refOk }, stats);
    let pi = 0;
    for (const n of noteOrder) {
      const count = splitParagraphs(n.note_content).length;
      const rich = flatRich.slice(pi, pi + count);
      pi += count;
      if (rich.length) noteRich[String(n.note_num)] = rich;
    }

    const xrefs = {};
    for (const f of foots) {
      const items = parseCnRefList(f.beaded_content, { book, chapter });
      const list = [];
      for (const it of items) {
        if (!it.r) {
          stats.unparsed++;
          continue;
        }
        if (it.note != null) continue;
        if (!refOk(it.r)) {
          stats.outOfRange++;
          continue;
        }
        list.push(it.cf ? { r: it.r, t: it.t, cf: true } : { r: it.r, t: it.t });
      }
      if (list.length) xrefs[String(f.beaded)] = list;
    }

    // Map every offset onto the verses.json string in one pass.
    const mapped = mapCnOffsets(src, dst, events.map((e) => e.off));
    mapped.forEach((m, i) => {
      events[i].p = m.pos;
      stats[m.how]++;
    });

    // Merge markers that land on the same position into one label, digits
    // before letters; unaligned markers (`p === null`) each stay on their own
    // and sort last. A repeat marker — the same note number a second time in
    // the verse — keeps its own entry so both superscripts are rendered.
    const groups = [];
    const byPos = new Map();
    for (const e of events) {
      if (!(e.kind === "n" ? String(e.key) in noteRich : String(e.key) in xrefs)) continue;
      let g = e.p == null ? null : byPos.get(e.p);
      if (!g) {
        g = { p: e.p ?? null, nums: [], letters: [] };
        groups.push(g);
        if (e.p != null) byPos.set(e.p, g);
      }
      (e.kind === "n" ? g.nums : g.letters).push(e.key);
    }
    groups.sort((a, b) => (a.p == null) - (b.p == null) || (a.p ?? 0) - (b.p ?? 0));

    const m = [];
    for (const g of groups) {
      // One entry per note/cross-reference pair at this position: the usual
      // case is a single number beside a single letter ("1a"). When two notes
      // (or two letters) genuinely share a position they each keep an entry, so
      // no note is left without a marker pointing at it.
      const count = Math.max(g.nums.length, g.letters.length);
      for (let k = 0; k < count; k++) {
        const num = g.nums[k];
        const letter = g.letters[k];
        const entry = { l: `${num ?? ""}${letter ?? ""}`, p: g.p };
        if (!entry.l) continue;
        if (num != null) entry.n = Number(num);
        if (letter != null) entry.x = letter;
        m.push(entry);
      }
    }

    const entry = {};
    if (m.length) entry.m = m;
    if (Object.keys(noteRich).length) entry.n = sortKeys(noteRich);
    if (Object.keys(xrefs).length) entry.x = sortKeys(xrefs);
    if (!m.length) continue;
    stats.notes += Object.keys(noteRich).length;
    for (const l of Object.values(xrefs)) stats.xrefs += l.length;
    verses[String(vn)] = entry;
  }
  return { verses, stats };
}

function sortKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort((a, b) => (isNaN(a) || isNaN(b) ? a.localeCompare(b) : Number(a) - Number(b)))) {
    out[k] = obj[k];
  }
  return out;
}

/* ---------------------------------------------------------------- one book */

/**
 * `getBookIntros` returns each field with a stable `note` id. The narrative
 * books use 著者/著时/著地/涵盖时段; the prophets swap in 尽职时间/尽职地点/
 * 尽职对象 and a few books use 记载地点. Those variants share the contract's
 * four slots — the first id present wins, and only the canonical label (the
 * head of each list, the one the UI prints itself) is stripped from the text.
 */
const INTRO_SLOTS = [
  ["author", [[1, "著者"]]],
  ["written", [[2, "著时"], [7, "尽职时间"]]],
  ["place", [[3, "著地"], [5, "记载地点"], [8, "尽职地点"]]],
  ["period", [[6, "涵盖时段"], [9, "尽职对象"]]],
];

/**
 * @param {object} raw cached `{book}/book.json`
 * @param {object} meta books.json row
 * @param {Map<string,string>} verseText `"c:v"` → exact verses.json CN text
 */
export function buildBook(raw, meta, verseText, opts = {}) {
  const book = meta.idx;
  const refOk = opts.refOk ?? (() => true);
  const stats = { outline: 0, unparsed: 0, noRange: 0, outOfRange: 0 };

  const info = {};
  const linksByNote = groupBy(raw.introLinks, "note");
  const intros = raw.intros ?? [];
  for (const [field, candidates] of INTRO_SLOTS) {
    for (const [id, label] of candidates) {
      const it = intros.find((x) => x.note === id || String(x.content ?? "").startsWith(label));
      if (!it) continue;
      const rich = applyLinks(splitParagraphs(it.content), linksByNote.get(it.note) ?? [], { book, refOk }, stats);
      if (label === candidates[0][1]) stripLabel(rich, label);
      info[field] = rich;
      break;
    }
  }
  const subject = raw.topics?.[0]?.content;
  if (subject) info.subject = [[String(subject)]];

  const lastVerse = (c) => meta.chapters[c - 1] ?? 1;
  /**
   * Keep a `Loc` inside the book. The Recovery Version numbers a few verses
   * our `verses.json` does not (John 7:53 opens the passage there but is part
   * of chapter 8 here), so a verse past the end of its chapter rolls into the
   * next one rather than being clipped to the wrong heading position.
   */
  const clampLoc = (loc) => {
    let [c, v, part] = loc;
    c = Math.min(Math.max(c, 1), meta.chapters.length);
    if (v > lastVerse(c) && c < meta.chapters.length) {
      c++;
      v = 1;
    }
    return [c, Math.min(Math.max(v, 0), lastVerse(c)), part];
  };

  const outline = [];
  for (const o of raw.outlines ?? []) {
    const { label, title, range } = parseOutlineContent(o.outline_content);
    if (!title) continue;
    stats.outline++;
    const startChapter = o.related_chapters || range?.start?.[0] || 1;
    const start = clampLoc([
      startChapter,
      o.related_number ?? range?.start?.[1] ?? 0,
      o.related_section_code ?? range?.start?.[2] ?? 0,
    ]);
    let end = [...start];
    if (range) {
      const ec = range.endBook != null && range.endBook !== book ? meta.chapters.length : (range.end[0] ?? startChapter);
      const ev = range.endBook != null && range.endBook !== book ? lastVerse(meta.chapters.length) : range.end[1];
      end = clampLoc([ec, ev, range.end[2] ?? 0]);
    } else stats.noRange++;

    // Keep `start <= end`, which the schema requires.
    end[0] = Math.min(Math.max(end[0], start[0]), meta.chapters.length);
    end[1] = Math.min(Math.max(end[1], end[0] === start[0] ? start[1] : 0), lastVerse(end[0]));
    if (end[0] === start[0] && end[1] === start[1] && end[2] < start[2]) end[2] = start[2];

    const entry = { level: Math.min(Math.max(o.level || 1, 1), 6), label, title, start, end };
    if (start[2] === 2) {
      const pos = midVersePos(verseText, start[0], start[1]);
      if (pos != null) entry.pos = pos;
    }
    outline.push(entry);
  }
  return { info: Object.keys(info).length ? info : null, outline, stats };
}

/**
 * The API keeps the field name inside the intro text (`著者　摩西，…`); the UI
 * renders its own label, so drop the prefix once the links have been placed
 * against the original offsets.
 */
function stripLabel(rich, label) {
  const first = rich[0];
  if (!first || typeof first[0] !== "string") return;
  const m = new RegExp(`^\s*${label}[　\s]*`).exec(first[0]);
  if (!m) return;
  first[0] = first[0].slice(m[0].length);
  if (!first[0]) first.shift();
}

/**
 * Where the second half (下) of a split verse starts in the `verses.json`
 * string: the units are joined with one space, so it is `len(unit1) + 1`.
 */
function midVersePos(verseText, chapter, verse) {
  const text = verseText.get(`${chapter}:${verse}`);
  if (!text) return null;
  const at = text.indexOf(" ");
  return at < 0 ? null : at + 1;
}

/* ------------------------------------------------------------------- files */

async function readStudyFile(file, key) {
  if (!fs.existsSync(file)) return null;
  const raw = readJson(file);
  if (raw && typeof raw.ct === "string") {
    // Never overwrite an encrypted file we cannot read — that would throw away
    // the English half the other pipeline wrote.
    if (!key) throw new Error(`${file} is encrypted; --plain cannot merge into it`);
    return decryptJson(raw, key);
  }
  return raw;
}

async function writeStudyFile(file, obj, key, plain) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = plain || !key ? obj : await encryptJson(obj, key);
  fs.writeFileSync(file, JSON.stringify(body, plain ? null : undefined, plain ? 2 : undefined) + "\n");
}

/* -------------------------------------------------------------------- main */

export async function build(o) {
  const books = readJson(path.join(ROOT, "public/data/books.json"));
  const verses = readJson(path.join(ROOT, "public/data/verses.json"));
  const outDir = path.resolve(ROOT, o.out);

  const cn = new Map();
  for (const r of verses) cn.set(`${r[0]}:${r[1]}:${r[2]}`, r[4] ?? "");

  // The same bounds `schema.mjs` checks, so a link we keep always validates.
  const byIdx = new Map(books.map((b) => [b.idx, b]));
  const refOk = ([b, c, v, ve]) => {
    const meta = byIdx.get(b);
    if (!meta || c < 1 || c > meta.chapters.length) return false;
    const last = meta.chapters[c - 1];
    return v >= 0 && v <= last && (ve === 0 || (ve >= v && ve <= last));
  };

  const wanted = books.filter((b) => {
    if (o.book) return b.idx === o.book;
    return fs.existsSync(path.join(o.cache, String(b.idx), "book.json"));
  });
  if (!wanted.length) throw new Error(`no cached data for ${o.book ? `book ${o.book}` : "any book"} in ${o.cache}`);

  const key = o.plain ? null : (await getStudyKey(outDir, o.password)).key;

  const totals = { files: 0, warnings: 0, ...blank() };
  const perBook = [];

  for (const meta of wanted) {
    const bdir = path.join(o.cache, String(meta.idx));
    const outBook = path.join(outDir, String(meta.idx));
    const sum = { book: meta.idx, cn: meta.cn, chapters: 0, ...blank() };

    // book.json
    const rawBook = path.join(bdir, "book.json");
    if (fs.existsSync(rawBook)) {
      const verseText = new Map();
      for (const r of verses) if (r[0] === meta.idx) verseText.set(`${r[1]}:${r[2]}`, r[4] ?? "");
      const built = buildBook(readJson(rawBook), meta, verseText, { refOk });
      sum.unparsed += built.stats.unparsed;
      sum.outOfRange += built.stats.outOfRange ?? 0;
      const file = path.join(outBook, "book.json");
      const prev = (await readStudyFile(file, key)) ?? {};
      const merged = { schema: 1, book: meta.idx, ...prev, cn: { info: built.info, outline: built.outline } };
      const res = validateBookFile(merged, { books });
      for (const e of res.errors) console.error(`ERROR ${meta.idx}/book.json ${e}`);
      totals.warnings += res.warnings.length;
      await writeStudyFile(file, merged, key, o.plain);
      totals.files++;
    }

    for (let chapter = 1; chapter <= meta.chapters.length; chapter++) {
      const rawFile = path.join(bdir, `${chapter}.json`);
      if (!fs.existsSync(rawFile)) continue;
      const raw = readJson(rawFile);
      const verseText = new Map();
      for (let v = 0; v <= meta.chapters[chapter - 1]; v++) {
        const t = cn.get(`${meta.idx}:${chapter}:${v}`);
        if (t != null) verseText.set(v, t);
      }
      const { verses: built, stats } = buildChapter(raw, verseText, {
        refOk,
        maxVerse: meta.chapters[chapter - 1],
      });
      sum.chapters++;
      for (const k of Object.keys(blank())) sum[k] += stats[k] ?? 0;

      const file = path.join(outBook, `${chapter}.json`);
      const prev = (await readStudyFile(file, key)) ?? {};
      const merged = { schema: 1, book: meta.idx, chapter, ...prev, cn: { verses: built } };
      const res = validateChapterFile(merged, { books, verses });
      for (const e of res.errors) console.error(`ERROR ${meta.idx}/${chapter}.json ${e}`);
      totals.warnings += res.warnings.length;
      await writeStudyFile(file, merged, key, o.plain);
      totals.files++;

      if (!o.quiet) {
        const cross = crossCheck(prev, built);
        console.log(
          `  ${meta.idx}/${chapter}: ${stats.verses} verses (${stats.match} text exact) ` +
            `markers ${stats.exact}/${stats.diff}/${stats.snap}/${stats.none} ` +
            `notes ${stats.notes} xrefs ${stats.xrefs}` +
            (stats.unparsed ? ` unparsed ${stats.unparsed}` : "") +
            (stats.outOfRange ? ` out-of-range ${stats.outOfRange}` : "") +
            (cross ? ` — ${cross}` : ""),
        );
      }
    }
    for (const k of Object.keys(blank())) totals[k] += sum[k];
    perBook.push(sum);
    console.log(
      `book ${meta.idx} ${meta.cn}: ${sum.chapters} chapters, markers ` +
        `${sum.exact} exact / ${sum.diff} diff / ${sum.snap} snap / ${sum.none} none, ` +
        `${sum.notes} notes, ${sum.xrefs} xrefs, ${sum.unparsed} unparsed` +
        (sum.outOfRange ? `, ${sum.outOfRange} out-of-range` : "") +
        (sum.skipped ? `, ${sum.skipped} verse(s) not in verses.json` : ""),
    );
  }
  return { totals, perBook, outDir };
}

const blank = () => ({ verses: 0, match: 0, exact: 0, diff: 0, snap: 0, none: 0, unparsed: 0, notes: 0, xrefs: 0, outOfRange: 0, skipped: 0 });

/** Warn (never fail) when the English half disagrees about the apparatus. */
function crossCheck(prev, cnVerses) {
  const en = prev?.en?.verses;
  if (!en) return "";
  let notes = 0;
  let letters = 0;
  for (const [vk, v] of Object.entries(en)) {
    const c = cnVerses[vk];
    if (!c) continue;
    if (Object.keys(v.n ?? {}).length !== Object.keys(c.n ?? {}).length) notes++;
    const a = Object.keys(v.x ?? {}).sort().join("");
    const b = Object.keys(c.x ?? {}).sort().join("");
    if (a !== b) letters++;
  }
  if (!notes && !letters) return "";
  return `warn: ${notes} verse(s) differ in note count, ${letters} in xref letters vs en`;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.all && !o.book) {
    console.error("usage: node scripts/build-study-cn.mjs [--book N | --all] [--out dir] [--plain]");
    process.exit(2);
  }
  const { totals, outDir } = await build(o);
  console.log(
    `\n${totals.files} file(s) → ${path.relative(ROOT, outDir)}\n` +
      `markers: ${totals.exact} exact, ${totals.diff} diff, ${totals.snap} snap, ${totals.none} none\n` +
      `${totals.notes} notes, ${totals.xrefs} cross-references, ${totals.unparsed} unparsed reference(s), ` +
      `${totals.outOfRange} out-of-range reference(s), ${totals.skipped} verse(s) skipped, ` +
      `${totals.warnings} schema warning(s)`,
  );
}

if (process.argv[1]?.endsWith("build-study-cn.mjs")) await main();
