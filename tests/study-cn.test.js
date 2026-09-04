import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildChapter,
  buildBook,
  splitParagraphs,
  applyLinks,
  refRuns,
  mapCnOffsets,
} from "../scripts/build-study-cn.mjs";
import { validateChapterFile, validateBookFile } from "../scripts/lib/schema.mjs";
import { nextVersion, countHalf } from "../scripts/build-study-index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const books = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/books.json"), "utf8"));
const verses = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/verses.json"), "utf8"));
const GEN1 = path.join(ROOT, "scripts/.cache/rcv-tw/1/1.json");
const GENBOOK = path.join(ROOT, "scripts/.cache/rcv-tw/1/book.json");

const cnText = (book, chapter) => {
  const m = new Map();
  for (const r of verses) if (r[0] === book && r[1] === chapter) m.set(r[2], r[4] ?? "");
  return m;
};

/* ------------------------------------------------------- pure helper tests */

describe("splitParagraphs", () => {
  it("splits on ˍ without trimming — link offsets are measured on this text", () => {
    expect(splitParagraphs("第一段ˍ第二段ˍ")).toEqual(["第一段", "第二段"]);
    expect(splitParagraphs("有 空格 ˍ第二")).toEqual(["有 空格 ", "第二"]);
    expect(splitParagraphs("").length).toBe(0);
  });
});

describe("refRuns", () => {
  it("turns a linked span into {ref} runs and keeps the punctuation between them", () => {
    expect(refRuns("弗一10，三9", { book: 1, chapter: 1 })).toEqual([
      { ref: [49, 1, 10, 0], t: "弗一10" },
      "，",
      { ref: [49, 3, 9, 0], t: "三9" },
    ]);
  });

  it("emits a {note} run for a `与注N` tail", () => {
    expect(refRuns("罗一20与注1", { book: 1, chapter: 1 })).toEqual([
      { ref: [45, 1, 20, 0], t: "罗一20" },
      "与",
      { note: [45, 1, 20, 1], t: "注1" },
    ]);
  });

  it("counts text it cannot read and leaves it as plain text", () => {
    const stats = { unparsed: 0 };
    const runs = refRuns("某某某", { book: 1, chapter: 1 }, stats);
    expect(runs).toEqual(["某某某"]);
    expect(stats.unparsed).toBe(1);
  });
});

describe("applyLinks", () => {
  const paragraphs = ["起初的话。（弗一10。）", "第二段引用创一1。"];

  it("places spans measured on the paragraphs concatenated without separators", () => {
    // "起初的话。（" is 6 chars → 弗一10 is at 0-based 6..11 → 1-based 7..11.
    const rich = applyLinks(paragraphs, [{ start_loc: 7, end_loc: 11 }], { book: 1, chapter: 1 });
    expect(rich[0]).toEqual(["起初的话。（", { ref: [49, 1, 10, 0], t: "弗一10" }, "。）"]);
    expect(rich[1]).toEqual(["第二段引用创一1。"]);
  });

  it("resolves a span that falls in the second paragraph", () => {
    const base = paragraphs[0].length; // 12
    const rich = applyLinks(paragraphs, [{ start_loc: base + 6, end_loc: base + 9 }], { book: 1 });
    expect(rich[1]).toEqual(["第二段引用", { ref: [1, 1, 1, 0], t: "创一1" }, "。"]);
  });

  it("ignores spans whose offsets fall outside the note text", () => {
    expect(applyLinks(paragraphs, [{ start_loc: 0, end_loc: 0 }], { book: 1 })).toEqual([
      ["起初的话。（弗一10。）"],
      ["第二段引用创一1。"],
    ]);
  });
});

describe("mapCnOffsets", () => {
  it("is exact when the joined units equal the verses.json string", () => {
    const s = "而地变为荒废空虚，渊面黑暗。 神的灵覆罩在水面上。";
    expect(mapCnOffsets(s, s, [0, 15])).toEqual([
      { pos: 0, how: "exact" },
      { pos: 15, how: "exact" },
    ]);
  });

  it("maps through a wording change and reports how each offset landed", () => {
    const src = "神创造诸天与地";
    const dst = "神创造了诸天与地";
    const [a, b] = mapCnOffsets(src, dst, [0, 3]);
    expect(a).toEqual({ pos: 0, how: "diff" });
    expect(dst[b.pos]).toBe("诸");
  });
});

/* ------------------------------------------------------------ marker merge */

const rawChapter = (over = {}) => ({
  book: 1,
  chapter: 1,
  verses: [{ content: "起初神创造诸天与地，", unit_code: 0, segment_code: 1 }],
  footnotes: [],
  foots: [],
  footnoteLinks: [],
  ...over,
});

describe("buildChapter — markers", () => {
  it("merges a note and a cross-reference at the same position, digits first", () => {
    const raw = rawChapter({
      footnotes: [{ segment_code: 1, unit_code: 0, note_loc: 1, note_num: 1, note_content: "注一。" }],
      foots: [{ segment_code: 1, unit_code: 0, loc: 1, beaded: "a", beaded_content: "创一2" }],
    });
    const { verses: v } = buildChapter(raw, cnText(1, 1));
    expect(v["1"].m).toEqual([{ l: "1a", p: 0, n: 1, x: "a" }]);
  });

  it("gives a repeat marker (empty note_content) its own entry and no second note", () => {
    const raw = rawChapter({
      footnotes: [
        { segment_code: 1, unit_code: 0, note_loc: 1, note_num: 1, note_content: "注一。" },
        { segment_code: 1, unit_code: 0, note_loc: 6, note_num: 1, note_content: "" },
      ],
    });
    const { verses: v } = buildChapter(raw, cnText(1, 1));
    expect(v["1"].m).toEqual([
      { l: "1", p: 0, n: 1 },
      { l: "1", p: 5, n: 1 },
    ]);
    expect(Object.keys(v["1"].n)).toEqual(["1"]);
  });

  it("splits a note on ˍ into one paragraph per Rich entry", () => {
    const raw = rawChapter({
      footnotes: [{ segment_code: 1, unit_code: 0, note_loc: 1, note_num: 1, note_content: "第一段。ˍ第二段。" }],
    });
    const { verses: v } = buildChapter(raw, cnText(1, 1));
    expect(v["1"].n["1"]).toEqual([["第一段。"], ["第二段。"]]);
  });

  it("marks cross-reference items after 参 with cf", () => {
    const raw = rawChapter({
      foots: [{ segment_code: 1, unit_code: 0, loc: 1, beaded: "a", beaded_content: "亚十二1，参约一1" }],
    });
    const { verses: v } = buildChapter(raw, cnText(1, 1));
    expect(v["1"].x.a).toEqual([
      { r: [38, 12, 1, 0], t: "亚十二1" },
      { r: [43, 1, 1, 0], t: "约一1", cf: true },
    ]);
  });
});

/* ---------------------------------------------------------- outline / book */

describe("buildBook", () => {
  const meta = books[0];
  const verseText = new Map();
  for (const r of verses) if (r[0] === 1) verseText.set(`${r[1]}:${r[2]}`, r[4] ?? "");

  it("parses label, title and the end of the range from outline_content", () => {
    const { outline } = buildBook(
      {
        outlines: [
          { level: 1, outline_content: "壹　神的创造　一1～二25", related_chapters: 1, related_number: 1, related_section_code: 0 },
          { level: 3, outline_content: "3　神的恢复和进一步的创造　一2下～二3", related_chapters: 1, related_number: 2, related_section_code: 2 },
          { level: 4, outline_content: "（一）　地上的走兽　24～25", related_chapters: 1, related_number: 24, related_section_code: 0 },
        ],
        intros: [],
        introLinks: [],
        topics: [],
      },
      meta,
      verseText,
    );
    expect(outline[0]).toEqual({ level: 1, label: "壹", title: "神的创造", start: [1, 1, 0], end: [2, 25, 0] });
    // `一2下` starts at the second unit of Genesis 1:2 — after "…黑暗。 ".
    expect(outline[1]).toEqual({
      level: 3,
      label: "3",
      title: "神的恢复和进一步的创造",
      start: [1, 2, 2],
      end: [2, 3, 0],
      pos: 15,
    });
    // A chapter-less range takes its chapter from related_chapters.
    expect(outline[2].end).toEqual([1, 25, 0]);
  });

  it("maps the intro fields and strips the 著者/著时/著地 labels", () => {
    const { info } = buildBook(
      {
        outlines: [],
        intros: [
          { content: "著者　摩西。（申三一9。）", note: 1 },
          { content: "著地　旷野。", note: 3 },
        ],
        // "著者　摩西。（" is 7 chars → 申三一9 is 1-based 8..12.
        introLinks: [{ note: 1, start_loc: 8, end_loc: 12 }],
        topics: [{ content: "神创造" }],
      },
      meta,
      verseText,
    );
    expect(info.author).toEqual([["摩西。（", { ref: [5, 31, 9, 0], t: "申三一9" }, "。）"]]);
    expect(info.place).toEqual([["旷野。"]]);
    expect(info.subject).toEqual([["神创造"]]);
  });

  it("folds the prophets' 尽职时间/尽职地点 fields into the same slots, label kept", () => {
    const { info } = buildBook(
      {
        outlines: [],
        intros: [
          { content: "著者　何西阿。", note: 1 },
          { content: "尽职时间　主前约七五○年。", note: 7 },
          { content: "尽职地点　北国以色列。", note: 8 },
          { content: "尽职对象　以色列。", note: 9 },
        ],
        introLinks: [],
        topics: [],
      },
      meta,
      verseText,
    );
    expect(info.author).toEqual([["何西阿。"]]);
    expect(info.written).toEqual([["尽职时间　主前约七五○年。"]]);
    expect(info.place).toEqual([["尽职地点　北国以色列。"]]);
    expect(info.period).toEqual([["尽职对象　以色列。"]]);
  });
});

/* --------------------------------------------------- the real Genesis data */

const hasCache = fs.existsSync(GEN1);
describe.skipIf(!hasCache)("Genesis 1 from the cache", () => {
  const raw = JSON.parse(fs.readFileSync(GEN1, "utf8"));
  const built = buildChapter(raw, cnText(1, 1));

  it("puts the four verse-1 markers before 起 神 创 诸", () => {
    const text = "起初神创造诸天与地，";
    expect(cnText(1, 1).get(1)).toBe(text);
    expect(built.verses["1"].m.map((mk) => mk.p)).toEqual([0, 2, 3, 5]);
    expect(built.verses["1"].m.map((mk) => text[mk.p])).toEqual(["起", "神", "创", "诸"]);
    expect(built.verses["1"].m[0]).toEqual({ l: "1a", p: 0, n: 1, x: "a" });
  });

  it("offsets the second unit of the split verse 1:2 by len(unit1) + 1", () => {
    const units = raw.verses.filter((u) => u.segment_code === 2);
    const base = units[0].content.length + 1;
    expect(base).toBe(15);
    const secondUnit = built.verses["2"].m.filter((mk) => mk.p >= base);
    expect(secondUnit.length).toBeGreaterThan(0);
    expect(built.verses["2"].m.some((mk) => mk.p === base)).toBe(true);
  });

  it("keeps repeat markers but only one note body", () => {
    const labels = built.verses["2"].m.filter((mk) => mk.n === 2);
    expect(labels.length).toBe(2);
    expect(built.verses["2"].n["2"]).toBeDefined();
  });

  it("resolves every reference in the chapter", () => {
    expect(built.stats.unparsed).toBe(0);
    expect(built.stats.none).toBe(0);
  });

  it("validates against the contract", () => {
    const file = { schema: 1, book: 1, chapter: 1, cn: { verses: built.verses } };
    expect(validateChapterFile(file, { books, verses }).errors).toEqual([]);
  });
});

describe.skipIf(!fs.existsSync(GENBOOK))("Genesis book.json from the cache", () => {
  it("validates against the contract", () => {
    const verseText = new Map();
    for (const r of verses) if (r[0] === 1) verseText.set(`${r[1]}:${r[2]}`, r[4] ?? "");
    const { info, outline } = buildBook(JSON.parse(fs.readFileSync(GENBOOK, "utf8")), books[0], verseText);
    const file = { schema: 1, book: 1, cn: { info, outline } };
    expect(validateBookFile(file, { books }).errors).toEqual([]);
    expect(outline.length).toBeGreaterThan(50);
    expect(info.subject).toBeDefined();
  });
});

/* ---------------------------------------------------------------- manifest */

describe("build-study-index helpers", () => {
  it("bumps the daily counter", () => {
    expect(nextVersion(undefined, "2026-09-04")).toBe("2026-09-04.1");
    expect(nextVersion("2026-09-03.7", "2026-09-04")).toBe("2026-09-04.1");
    expect(nextVersion("2026-09-04.1", "2026-09-04")).toBe("2026-09-04.2");
  });

  it("counts notes, cross-references and unaligned markers", () => {
    const half = {
      verses: {
        1: { m: [{ l: "1", p: 0, n: 1 }, { l: "a", p: null, x: "a" }], n: { 1: [["x"]] }, x: { a: [{ r: [1, 1, 1, 0], t: "创一1" }] } },
      },
    };
    expect(countHalf(half)).toEqual({ notes: 1, xrefs: 1, unaligned: 1 });
  });
});
