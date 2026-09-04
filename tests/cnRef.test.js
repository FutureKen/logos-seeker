import { describe, it, expect } from "vitest";
import { cnNum, CN_BOOK_ABBR, parseCnRefList } from "../scripts/lib/cnRef.mjs";

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
});
