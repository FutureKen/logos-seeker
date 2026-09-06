import fs from "node:fs";
import { describe, it, expect } from "vitest";

import { openZipBuffer, makeZipBuffer } from "../scripts/lib/epub.mjs";
import { decodeEntities, parse, findAll, hasClass } from "../scripts/lib/html.mjs";
import {
  parseAnchor,
  parseNoteAnchor,
  parseXrefAnchor,
  rangeFromText,
  refFromLink,
  parseOutlineId,
  levelFromLabel,
} from "../scripts/lib/refResolve.mjs";
import {
  parseChapterPart,
  parseNotesPart,
  parseOutlinePart,
  parseInfo,
  buildChapterEn,
  splitLabel,
  makeClampRef,
  readToc,
} from "../scripts/build-study-en.mjs";
import { validateChapterFile } from "../scripts/lib/schema.mjs";

/* --------------------------------------------------------------- helpers */

const CODES = { Gen: 1, Psa: 19, Isa: 23, Mat: 40, Joh: 43, SCo: 47, Eph: 49, FTi: 54, FJo: 62 };
const bookOf = (code) => CODES[code] ?? null;
const ctx = { bookOf, bookOfPart: () => 1 };

const page = (body) => `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body class="calibre">
${body}
</body></html>`;

const verseLabel = (n) =>
  `<b class="calibre8"><a href="part0006.html#5N3C0">Gn 1</a><a href="part0006.html#Gen1">:${n}</a></b>`;

/* ------------------------------------------------------------ zip reader */

describe("epub.mjs zip reader", () => {
  it("reads deflated and stored entries from an in-memory zip", () => {
    const text = "In the beginning ".repeat(40);
    const buf = makeZipBuffer([
      { name: "mimetype", data: "application/epub+zip", store: true },
      { name: "text/part0001.html", data: text },
      { name: "toc.ncx", data: "<ncx/>" },
    ]);
    const zip = openZipBuffer(buf);
    expect(zip.names()).toEqual(["mimetype", "text/part0001.html", "toc.ncx"]);
    expect(zip.read("mimetype")).toBe("application/epub+zip");
    expect(zip.read("text/part0001.html")).toBe(text);
    expect(zip.entry("text/part0001.html").compressedSize).toBeLessThan(text.length);
    expect(zip.has("nope.html")).toBe(false);
    expect(() => zip.read("nope.html")).toThrow(/not found/);
  });

  it("rejects something that is not a zip", () => {
    expect(() => openZipBuffer(Buffer.from("hello world, not a zip at all"))).toThrow(/not a zip/);
  });
});

/* ----------------------------------------------------------------- html */

describe("html.mjs", () => {
  it("decodes the entities the EPUB uses", () => {
    expect(decodeEntities("a &lt;b&gt; &amp; c &mdash; &#8217;d&#x2019;")).toBe("a <b> & c — ’d’");
  });

  it("survives a stray close tag", () => {
    const doc = parse("<p class='verse'>a</i> b</p>");
    const p = findAll(doc, (e) => e.name === "p")[0];
    expect(hasClass(p, "verse")).toBe(true);
  });
});

/* ----------------------------------------------------------- refResolve */

describe("refResolve.mjs", () => {
  it("parses verse anchors", () => {
    expect(parseAnchor("Joh1-1")).toEqual({ code: "Joh", chapter: 1, verse: 1 });
    expect(parseAnchor("Gen1")).toEqual({ code: "Gen", chapter: 1, verse: 0 });
    expect(parseAnchor("SCo3-15")).toEqual({ code: "SCo", chapter: 3, verse: 15 });
    expect(parseAnchor("n1_1_1")).toBe(null);
  });

  it("parses note and cross-reference block anchors", () => {
    expect(parseNoteAnchor("n1_2_3")).toEqual({ chapter: 1, verse: 2, num: 3 });
    expect(parseXrefAnchor("c1_3_b")).toEqual({ chapter: 1, verse: 3, letter: "b" });
    expect(parseNoteAnchor("c1_3_b")).toBe(null);
  });

  it("parses reference display text", () => {
    expect(rangeFromText("Eph. 1:22b-23")).toEqual({
      start: { chapter: 1, verse: 22, part: 2 },
      end: { chapter: 1, verse: 23, part: 0 },
    });
    expect(rangeFromText("1 Tim. 1:4b")).toEqual({
      start: { chapter: 1, verse: 4, part: 2 },
      end: null,
    });
    expect(rangeFromText("vv. 24-25")).toEqual({
      start: { chapter: null, verse: 24, part: 0 },
      end: { chapter: null, verse: 25, part: 0 },
    });
    expect(rangeFromText("1:2b — 2:3").end).toEqual({ chapter: 2, verse: 3, part: 0 });
  });

  it("turns anchor + text into a Ref", () => {
    expect(refFromLink("Eph1-22", "Eph. 1:22b-23", bookOf)).toEqual([49, 1, 22, 23]);
    expect(refFromLink("Joh1-1", "John 1:1", bookOf)).toEqual([43, 1, 1, 0]);
    // A range that crosses a chapter cannot be expressed by a Ref.
    expect(refFromLink("Gen1", "Gen. 1 — 2", bookOf)).toEqual([1, 1, 0, 0]);
    expect(refFromLink("Xyz1-1", "Xyz 1:1", bookOf)).toBe(null);
  });

  it("reads outline list ids and inline label levels", () => {
    expect(parseOutlineId("l1_pI_1")).toEqual({ level: 1, label: "I.", n: 1 });
    expect(parseOutlineId("l5_p_1__12")).toEqual({ level: 5, label: "(1)", n: 12 });
    expect(levelFromLabel("A.")).toBe(2);
    expect(levelFromLabel("a.")).toBe(4);
    expect(levelFromLabel("(a)")).toBe(6);
  });

  it("keeps refs inside the bounds books.json declares", () => {
    const clamp = makeClampRef([{ idx: 1, chapters: [31, 25] }]);
    expect(clamp([1, 1, 5, 40])).toEqual([1, 1, 5, 0]); // verseEnd past the chapter
    expect(clamp([1, 3, 1, 0])).toEqual([1, 2, 1, 0]); // chapter past the book
    expect(clamp([9, 1, 1, 0])).toBe(null);
  });
});

describe("splitLabel", () => {
  it("splits a marker label into note number and xref letter", () => {
    expect(splitLabel("1a")).toEqual({ num: 1, letter: "a" });
    expect(splitLabel("12")).toEqual({ num: 12, letter: null });
    expect(splitLabel("b")).toEqual({ num: null, letter: "b" });
  });
});

/* ------------------------------------------------------- chapter parsing */

describe("parseChapterPart", () => {
  it("extracts verse text and marker offsets, including a repeated note", () => {
    const html = page(`
<p id="Gen1-1" class="verse">${verseLabel(1)} <a href="part1257.html#n1_1_1"><sup class="calibre20">1a</sup>In</a> the <a href="part1257.html#n1_1_2"><sup class="calibre20">2</sup>beginning</a> God <a href="part1257.html#n1_1_2"><sup class="calibre20">2</sup>created</a> the heavens.</p>`);
    const { verses, notePart } = parseChapterPart(html, 1);
    const v = verses.get(1);
    expect(v.text).toBe("In the beginning God created the heavens.");
    expect(v.marks.map((m) => [m.label, m.word, m.offset])).toEqual([
      ["1a", "In", 0],
      ["2", "beginning", 7],
      ["2", "created", 21],
    ]);
    expect(notePart).toBe(1257);
  });

  it("keeps the poetry marks out of the text but the offsets right", () => {
    const html = page(
      `<p id="Psa34-1" class="verse">${verseLabel(1)} <span></span><a href="part1768.html#n34_1_1"><sup>1</sup>I</a> will <a href="part1768.html#n34_1_2"><sup>2</sup>bless</a> Jehovah at all times; /<span></span> His praise.</p>`,
    );
    const v = parseChapterPart(html, 34).verses.get(1);
    expect(v.text).toBe("I will bless Jehovah at all times; His praise.");
    expect(v.marks.map((m) => m.offset)).toEqual([0, 7]);
  });

  it("joins a split verse and records where the heading between the halves falls", () => {
    const html = page(`
<p class="text-outline">2. Judgment and Corruption<br/>1:2a</p>
<p id="Gen1-2" class="verse">${verseLabel(2)} <a href="part1257.html#n1_2_1"><sup>1</sup>But</a> the earth became waste,</p>
<p class="text-outline">3. God’s Restoration<br/>1:2b — 2:3</p>
<p class="verse"><a href="part1257.html#n1_2_4"><sup>4</sup>and</a> the Spirit of God was brooding.</p>`);
    const { verses, headings } = parseChapterPart(html, 1);
    const v = verses.get(2);
    expect(v.text).toBe("But the earth became waste, and the Spirit of God was brooding.");
    expect(v.marks.map((m) => m.offset)).toEqual([0, 28]);
    expect(v.heads).toEqual([28]);

    expect(headings.map((h) => [h.mid, h.verse, h.entries[0].title])).toEqual([
      [false, 2, "Judgment and Corruption"],
      [true, 2, "God’s Restoration"],
    ]);
    expect(headings[0].entries[0]).toMatchObject({ level: 3, start: [1, 2, 1], end: [1, 2, 1] });
    expect(headings[1].entries[0]).toMatchObject({ level: 3, start: [1, 2, 2], end: [2, 3, 0] });
  });
});

/* --------------------------------------------------------- note parsing */

const NOTE_BLOCK = `
<div id="n1_1_1" class="calibre5">
  <p id="hr_1_1_1" class="note-head"><b><a href="part0006.html#Gen1-1">Gn 1:1<sup>1a</sup> In</a></b>  -
    <span id="xr_1_1_1"> cf. <a href="part1042.html#Joh1-1">John 1:1-2</a></span>
  </p>
  <p class="note">The <i class="calibre6">Genesis</i> revelation of the divine economy (<a href="part1148.html#Eph1-22">Eph. 1:22b-23</a>). See <a href="part1257.html#n1_3_1">note 3<sup>1</sup></a>.</p>
  <p class="note">A second paragraph.</p>
</div>`;

const XREF_BLOCK = `
<div id="c1_3_b" class="calibre5">
  <p id="hr_1_3_b" class="note-head"><b><a href="part0006.html#Gen1-3">Gn 1:3<sup>1b</sup> light</a></b>  -
    <span id="xr_1_3_b">
      <a href="part0748.html#Isa45-7">Isa. 45:7;</a> <a href="part1129.html#SCo4-6">2 Cor. 4:6;</a> cf. <a href="part1042.html#Joh1-4">John 1:4-5</a>
    </span>
  </p>
  <p class="note">See <a href="part1257.html#n1_3_1">note 3<sup>1</sup></a>.</p>
</div>`;

describe("parseNotesPart", () => {
  it("builds Rich runs with italics, refs, note links and superscripts", () => {
    const { byVerse } = parseNotesPart(page(NOTE_BLOCK), ctx);
    const v1 = byVerse.get(1);
    expect(v1.notes.get(1)).toEqual([
      [
        "The ",
        { i: "Genesis" },
        " revelation of the divine economy (",
        { ref: [49, 1, 22, 23], t: "Eph. 1:22b-23" },
        "). See ",
        { note: [1, 1, 3, 1], t: "note 3" },
        { sup: "1" },
        ".",
      ],
      ["A second paragraph."],
    ]);
    // The `a` letter of the "1a" label comes from the note block's own xr span.
    expect(v1.xrefs.get("a")).toEqual([{ r: [43, 1, 1, 2], t: "John 1:1-2", cf: true }]);
  });

  it("reads a cross-reference-only block and marks the items after cf.", () => {
    const { byVerse } = parseNotesPart(page(XREF_BLOCK), ctx);
    expect(byVerse.get(3).xrefs.get("b")).toEqual([
      { r: [23, 45, 7, 0], t: "Isa. 45:7" },
      { r: [47, 4, 6, 0], t: "2 Cor. 4:6" },
      { r: [43, 1, 4, 5], t: "John 1:4-5", cf: true },
    ]);
    // Its "See note 3¹" paragraph is only a pointer; it stands in as note 1
    // because this fragment carries no `n1_3_1` block of its own.
    expect(byVerse.get(3).notes.has(1)).toBe(true);
  });
});

/* ------------------------------------------------------- outline + info */

describe("parseOutlinePart", () => {
  it("reads a nested ordered list into Loc ranges", () => {
    const html = page(`
<ol class="otl">
<li id="l1_pI_1" class="calibre10">I.   God’s creation — <a href="part0006.html#Gen1-1">1:1 —</a>  <a href="part0007.html#Gen2-25">2:25</a>
<ol class="otl1">
<li id="l3_p2_4" class="calibre10">2.   Judgment and corruption — <a href="part0006.html#Gen1-2">1:2a</a></li>
<li id="l3_p3_5" class="calibre10">3.   God’s restoration — <a href="part0006.html#Gen1-2">1:2b —</a>  <a href="part0007.html#Gen2-3">2:3</a></li>
<li id="l5_p_1__12" class="calibre10">(1)   The animals of the earth — <a href="part0006.html#Gen1-24">vv. 24-25</a></li>
</ol></li></ol>`);
    expect(parseOutlinePart(html, { code: "Gen", chapters: [31, 25] })).toEqual([
      { level: 1, label: "I.", title: "God’s creation", start: [1, 1, 0], end: [2, 25, 0] },
      { level: 3, label: "2.", title: "Judgment and corruption", start: [1, 2, 1], end: [1, 2, 1] },
      { level: 3, label: "3.", title: "God’s restoration", start: [1, 2, 2], end: [2, 3, 0] },
      { level: 5, label: "(1)", title: "The animals of the earth", start: [1, 24, 0], end: [1, 25, 0] },
    ]);
  });

  it("keeps only the entries of the requested book of a combined outline", () => {
    const html = page(`
<ol class="otl">
<li id="l1_pIII_17">III. The history concerning David — <a href="part0265.html#Gen16-1">1 Sam. 16:1 —</a> <a href="part0304.html#Psa24-25">2 Sam. 24:25</a></li>
<li id="l2_pB_44">B. Crowned by the people — <a href="part0282.html#Psa2-1">2 Sam. 2:1 —</a> <a href="part0304.html#Psa24-25">24:25</a></li>
</ol>`);
    const chapters = Array.from({ length: 31 }, () => 25);
    const got = parseOutlinePart(html, { code: "Gen", chapters });
    expect(got).toHaveLength(1);
    // The range runs into the following book, so it ends at this book's end.
    expect(got[0]).toMatchObject({ start: [16, 1, 0], end: [31, 25, 0] });
  });
});

describe("parseInfo", () => {
  it("maps the labelled paragraphs onto the five contract fields", () => {
    const html = page(`
<p class="info">Author: Moses (<a href="part1042.html#Joh1-45">John 1:45</a>).</p>
<p class="info">Time of Writing: Probably about 1490 B.C.</p>
<p class="info">Place of Writing: In the wilderness.</p>
<p class="info">Time Period Covered: From the beginning of creation.</p>
<p class="subject">Subject:<br/>God Created, Satan Corrupted</p>`);
    const paras = findAll(parse(html), (e) => e.name === "p");
    expect(parseInfo(paras, ctx)).toEqual({
      author: [["Moses (", { ref: [43, 1, 45, 0], t: "John 1:45" }, ")."]],
      written: [["Probably about 1490 B.C."]],
      place: [["In the wilderness."]],
      period: [["From the beginning of creation."]],
      subject: [["God Created, Satan Corrupted"]],
    });
  });
});

/* ----------------------------------------------------------- buildChapter */

describe("buildChapterEn", () => {
  it("maps offsets onto the verses.json text and drops markers with no apparatus", () => {
    const chapterHtml = page(`
<p id="Gen1-1" class="verse">${verseLabel(1)} <a href="part1257.html#n1_1_1"><sup>1a</sup>In</a> the beginning God created the heavens and the earth.</p>
<p id="Gen1-3" class="verse">${verseLabel(3)} And God <a href="part1257.html#n1_3_1"><sup>1a</sup>said</a>, Let there be <a href="part1257.html#c1_3_b"><sup>1b</sup>light;</a> and there was light.</p>`);
    const text = {
      1: "In the beginning God created the heavens and the earth.",
      3: "And God said, Let there be light; and there was light.",
    };
    const built = buildChapterEn({
      chapterHtml,
      notesHtml: page(NOTE_BLOCK + XREF_BLOCK),
      chapter: 1,
      verseTextOf: (v) => text[v] ?? null,
      ctx,
    });

    expect(built.verses["1"].m).toEqual([{ l: "1a", p: 0, n: 1, x: "a", w: "In" }]);
    // Verse 3 has no `n1_3_1` block here, so the "1" half of both labels is the
    // pointer note the `c1_3_b` block supplied; the `a` letter has no group.
    expect(built.verses["3"].m).toEqual([
      { l: "1", p: 8, n: 1, w: "said" },
      { l: "1b", p: 27, n: 1, x: "b", w: "light" },
    ]);
    expect(built.stats).toMatchObject({ verses: 2, total: 3, exact: 3, none: 0 });
  });

  it("falls back to p: null when the verse text was revised", () => {
    const chapterHtml = page(
      `<p id="Gen1-29" class="verse">${verseLabel(29)} And God said, Behold, I have given you every herb that <a href="part1257.html#n1_29_1"><sup>1</sup>produces</a> seed.</p>`,
    );
    const built = buildChapterEn({
      chapterHtml,
      notesHtml: page(`<div id="n1_29_1"><p class="note-head"><b><a href="part0006.html#Gen1-29">Gn 1:29<sup>1</sup> produces</a></b></p><p class="note">Note.</p></div>`),
      chapter: 1,
      // verses.json is a newer revision: "that produces seed" → "yielding seed".
      verseTextOf: () => "And God said, Behold, I have given you every herb yielding seed.",
      ctx,
    });
    expect(built.verses["29"].m[0].p).toBe(null);
    expect(built.stats.none).toBe(1);
  });
});

/* ------------------------------------------------------------ integration */

const EPUB =
  process.env.RCV_EN_EPUB ||
  "G:\\Dropbox\\Public\\Gospel\\Recovery Bible_ENG (with_FN_OL_CR) .epub";
const haveEpub = (() => {
  try {
    return fs.existsSync(EPUB);
  } catch {
    return false;
  }
})();

describe.skipIf(!haveEpub)("Genesis 1 from the real EPUB", () => {
  it("places the markers of Gen 1:1 and validates against the contract", async () => {
    const { openEpub } = await import("../scripts/lib/epub.mjs");
    const epub = openEpub(EPUB);
    const books = JSON.parse(fs.readFileSync("public/data/books.json", "utf8"));
    const verses = JSON.parse(fs.readFileSync("public/data/verses.json", "utf8"));
    const textOf = new Map();
    for (const r of verses) if (r[0] === 1 && r[1] === 1) textOf.set(r[2], r[3]);

    const toc = readToc(epub, books);
    const codes = new Map(toc.map((b) => [b.code, b.idx]));
    const gen = toc[0];
    const partOf = (n) => `text/part${String(n).padStart(4, "0")}.html`;
    const parsed = parseChapterPart(epub.read(partOf(gen.firstPart)), 1);

    const built = buildChapterEn({
      parsed,
      notesHtml: epub.read(partOf(parsed.notePart)),
      chapter: 1,
      verseTextOf: (v) => textOf.get(v) ?? null,
      ctx: {
        bookOf: (c) => codes.get(c) ?? null,
        // Note parts follow the canonical chapter order, starting right after
        // the last chapter part of Revelation.
        bookOfPart: (href) => {
          const flat = books.flatMap((b) => b.chapters.map((_, i) => [b.idx, i + 1]));
          const first = toc[65].firstPart + toc[65].chapters;
          const n = Number(/part(\d+)\.html/.exec(String(href))?.[1]);
          return flat[n - first]?.[0] ?? null;
        },
        clampRef: makeClampRef(books),
      },
    });

    expect(built.verses["1"].m.map((m) => [m.w, m.p])).toEqual([
      ["In", 0],
      ["beginning", 7],
      ["God", 17],
      ["created", 21],
      ["heavens", 33],
    ]);
    expect(built.stats.none).toBe(0);

    const file = { schema: 1, book: 1, chapter: 1, en: { verses: built.verses } };
    const res = validateChapterFile(file, { books, verses });
    expect(res.errors).toEqual([]);
  });
});
