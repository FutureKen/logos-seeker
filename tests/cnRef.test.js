import { describe, it, expect } from "vitest";
import {
  cnNum,
  CN_BOOK_ABBR,
  parseCnRefList,
  parseCnRange,
  parseOutlineContent,
} from "../scripts/lib/cnRef.mjs";

const refs = (s, ctx) => parseCnRefList(s, ctx).map((i) => i.r ?? { t: i.t });

describe("cnNum", () => {
  it.each([
    ["十", 10],
    ["十九", 19],
    ["二十", 20],
    ["二一", 21],
    ["四五", 45],
    ["一○四", 104],
    ["五十", 50],
    ["一二○", 120],
    ["一", 1],
    ["九", 9],
  ])("%s → %i", (s, n) => {
    expect(cnNum(s)).toBe(n);
  });
});

describe("CN_BOOK_ABBR", () => {
  it("covers all 66 books", () => {
    expect(CN_BOOK_ABBR).toHaveLength(66);
    expect(new Set(CN_BOOK_ABBR.map(([, i]) => i)).size).toBe(66);
  });

  it("is sorted longest abbreviation first, so 林后 wins over a shorter prefix", () => {
    const lens = CN_BOOK_ABBR.map(([a]) => a.length);
    expect(lens).toEqual([...lens].sort((a, b) => b - a));
    expect(CN_BOOK_ABBR.find(([a]) => a === "林后")[1]).toBe(47);
    expect(CN_BOOK_ABBR.find(([a]) => a === "约")[1]).toBe(43);
    expect(CN_BOOK_ABBR.find(([a]) => a === "约壹")[1]).toBe(62);
  });
});

describe("parseCnRefList", () => {
  it("参约一1，2 — cf marker, `，` continues the chapter", () => {
    expect(parseCnRefList("参约一1，2")).toEqual([
      { r: [43, 1, 1, 0], t: "约一1", cf: true },
      { r: [43, 1, 2, 0], t: "2", cf: true },
    ]);
  });

  it("赛四五7，林后四6 — a new book resets the chapter", () => {
    expect(parseCnRefList("赛四五7，林后四6")).toEqual([
      { r: [23, 45, 7, 0], t: "赛四五7", cf: false },
      { r: [47, 4, 6, 0], t: "林后四6", cf: false },
    ]);
  });

  it("创一3", () => {
    expect(parseCnRefList("创一3")).toEqual([{ r: [1, 1, 3, 0], t: "创一3", cf: false }]);
  });

  it("parses a verse range", () => {
    expect(parseCnRefList("弗一22～23")).toEqual([{ r: [49, 1, 22, 23], t: "弗一22～23", cf: false }]);
  });

  it("single-chapter books omit the chapter (犹3)", () => {
    expect(parseCnRefList("犹3")).toEqual([{ r: [65, 1, 3, 0], t: "犹3", cf: false }]);
  });

  it("诗一○四30 uses digit-wise chapter numerals", () => {
    expect(parseCnRefList("诗一○四30")).toEqual([{ r: [19, 104, 30, 0], t: "诗一○四30", cf: false }]);
  });

  it("； resets the book and the cf flag", () => {
    expect(parseCnRefList("参约一1；创一3")).toEqual([
      { r: [43, 1, 1, 0], t: "约一1", cf: true },
      { r: [1, 1, 3, 0], t: "创一3", cf: false },
    ]);
  });

  it("uses the context book/chapter for a bare verse", () => {
    expect(parseCnRefList("16", { book: 43, chapter: 3 })).toEqual([
      { r: [43, 3, 16, 0], t: "16", cf: false },
    ]);
  });

  it("弗一22下～23，三8～11 — half-verse marks and a chapter change", () => {
    expect(refs("弗一22下～23，三8～11")).toEqual([
      [49, 1, 22, 23],
      [49, 3, 8, 11],
    ]);
  });

  it("创一～二 — a chapter-only range keeps verse 0", () => {
    expect(refs("创一～二")).toEqual([[1, 1, 0, 0]]);
  });

  it("二八1～三五10，三七，三九～四九 — a bare chapter inside a list", () => {
    expect(refs("二八1～三五10，三七，三九～四九", { book: 1, chapter: 12 })).toEqual([
      [1, 28, 1, 0],
      [1, 37, 0, 0],
      [1, 39, 0, 0],
    ]);
  });

  it("罗一20与注1，注2 — `与注N` becomes a note reference on the same verse", () => {
    expect(parseCnRefList("罗一20与注1，注2", { book: 1, chapter: 1 })).toEqual([
      { r: [45, 1, 20, 0], t: "罗一20", cf: false },
      { r: [45, 1, 20, 0], t: "注1", cf: false, note: 1 },
      { r: [45, 1, 20, 0], t: "注2", cf: false, note: 2 },
    ]);
  });

  it("伯三八4～7与7注1 — the note tail hangs off the verse that precedes it", () => {
    expect(parseCnRefList("伯三八4～7与7注1", { book: 1, chapter: 1 })).toEqual([
      { r: [18, 38, 4, 7], t: "伯三八4～7", cf: false },
      { r: [18, 38, 7, 0], t: "7", cf: false },
      { r: [18, 38, 7, 0], t: "注1", cf: false, note: 1 },
    ]);
  });

  it("ignores `N段`, a bare `注` and `标题` tails", () => {
    expect(refs("林后十三14注1三段")).toEqual([[47, 13, 14, 0], [47, 13, 14, 0]]);
    expect(refs("赛十四12～15与注，结二八12～19与注")).toEqual([
      [23, 14, 12, 15],
      [26, 28, 12, 19],
    ]);
    expect(refs("诗二二标题与注", { book: 19 })).toEqual([[19, 22, 0, 0]]);
  });

  it("reads the stray Traditional forms the Simplified feed still contains", () => {
    expect(refs("彼後一3")).toEqual([[61, 1, 3, 0]]);
    expect(refs("參約一1")).toEqual([[43, 1, 1, 0]]);
    // 約參 is 3 John, not "cf. John" — book matching wins over the 參 marker.
    expect(refs("约参7与注2")).toEqual([[64, 1, 7, 0], [64, 1, 7, 0]]);
  });

  it("accepts 节 / 篇 suffixes and the 中 / 末 part marks", () => {
    expect(refs("26节", { book: 1, chapter: 3 })).toEqual([[1, 3, 26, 0]]);
    expect(refs("28节下～29节上", { book: 19, chapter: 68 })).toEqual([[19, 68, 28, 29]]);
    expect(refs("14中", { book: 19, chapter: 22 })).toEqual([[19, 22, 14, 0]]);
    expect(refs("3末", { book: 21, chapter: 12 })).toEqual([[21, 12, 3, 0]]);
  });

  it("skips the 本章 / 并 connectives that join two references", () => {
    expect(refs("本章4节～二五46", { book: 40, chapter: 24 })).toEqual([[40, 24, 4, 0]]);
    expect(refs("加四19并启十二2、5")).toEqual([
      [48, 4, 19, 0],
      [66, 12, 2, 0],
      [66, 12, 5, 0],
    ]);
  });

  it("returns unreadable text as a {t}-only item", () => {
    expect(parseCnRefList("某某某", { book: 1, chapter: 1 })).toEqual([{ t: "某某某" }]);
  });
});

describe("parseCnRange", () => {
  it.each([
    ["一1～二25", [1, 1, 0], [2, 25, 0]],
    ["一2下～二3", [1, 2, 2], [2, 3, 0]],
    ["一2下～5", [1, 2, 2], [1, 5, 0]],
    ["一2上", [1, 2, 1], [1, 2, 1]],
    ["一～二", [1, 0, 0], [2, 0, 0]],
    ["24～25", [null, 24, 0], [null, 25, 0]],
    ["26", [null, 26, 0], [null, 26, 0]],
    ["三１～24", [3, 1, 0], [3, 24, 0]],
  ])("%s", (text, start, end) => {
    const r = parseCnRange(text);
    expect(r.start).toEqual(start);
    expect(r.end).toEqual(end);
  });

  it("spans a comma-joined list from the first start to the last end", () => {
    const r = parseCnRange("二五19～21，27～28，二六1～二七4");
    expect(r.start).toEqual([25, 19, 0]);
    expect(r.end).toEqual([27, 4, 0]);
  });

  it("reports the book when the range crosses into the next one", () => {
    const r = parseCnRange("王上二12～王下二五30");
    expect(r.start).toEqual([2, 12, 0]);
    expect(r.endBook).toBe(12);
  });
});

describe("parseOutlineContent", () => {
  it("splits label, title and range on the ideographic space", () => {
    expect(parseOutlineContent("壹　神的创造　一1～二25")).toMatchObject({
      label: "壹",
      title: "神的创造",
    });
    expect(parseOutlineContent("壹　神的创造　一1～二25").range.end).toEqual([2, 25, 0]);
  });

  it("keeps a title that has no range", () => {
    expect(parseOutlineContent("卷一　第一至四十一篇")).toEqual({
      label: "卷一",
      title: "第一至四十一篇",
      range: null,
    });
  });

  it("treats a fully parenthesised continuation heading as title-only", () => {
    expect(parseOutlineContent("（二　以撒的经历─续）")).toEqual({
      label: "",
      title: "（二　以撒的经历─续）",
      range: null,
    });
  });

  it("does not mistake a title word for a range", () => {
    const r = parseOutlineContent("a　第一日，灵来了，话来了，光来了　一2下～5");
    expect(r.title).toBe("第一日，灵来了，话来了，光来了");
    expect(r.range.start).toEqual([1, 2, 2]);
  });
});
