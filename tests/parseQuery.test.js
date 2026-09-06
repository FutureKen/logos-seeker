// Port of the former scripts/test-parse.mjs — same cases, same expectations.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildAliasIndex, parseQuery, cnNum } from "../src/parseQuery.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const books = JSON.parse(fs.readFileSync(path.join(root, "public/data/books.json"), "utf8"));
const ai = buildAliasIndex(books);

describe("parseQuery — references", () => {
  it.each([
    ["John 1:1", 43, 1, 1],
    ["约 1:1", 43, 1, 1],
    ["约翰福音 1:1", 43, 1, 1],
    ["1 John 2:3", 62, 2, 3],
    ["Gen 1:1", 1, 1, 1],
    ["John 1", 43, 1, null], // single-digit chapter, not fuzzy
    ["诗 23:1", 19, 23, 1],
    ["Rev 22:21", 66, 22, 21],
  ])("%s → book %i, %i:%s", (q, bookIdx, chapter, verse) => {
    const r = parseQuery(q, ai);
    expect(r.type).toBe("ref");
    expect(r.bookIdx).toBe(bookIdx);
    expect(r.chapter).toBe(chapter);
    expect(r.verse).toBe(verse);
  });

  it("parses every smoke-test form without throwing", () => {
    const cases = [
      "John 1:1",
      "John 1",
      "John 1:1-5",
      "1 John 2:3",
      "1John 2:3",
      "Ps 23",
      "Psalm 23:1",
      "Gen 1:1",
      "约翰福音 1:1",
      "约 1:1",
      "创 1",
      "诗 23:1",
      "Christ",
      "基督",
      "love one another",
      "Rev 22:21",
      "Revelation 22",
      "S.S. 2:1",
    ];
    for (const c of cases) {
      const r = parseQuery(c, ai);
      expect(["ref", "word"]).toContain(r.type);
    }
  });
});

describe("parseQuery — word searches", () => {
  it.each([
    ["Christ", "en"],
    ["基督", "cn"],
    ["love one another", "en"],
  ])("%s → word/%s", (q, lang) => {
    const r = parseQuery(q, ai);
    expect(r.type).toBe("word");
    expect(r.lang).toBe(lang);
  });
});

describe("parseQuery — fuzzy / blurred references", () => {
  it.each([
    ["heb 111", ["1:11", "11:1"]],
    ["heb11", ["11", "1:1"]],
    ["Ps 23", ["23", "2:3"]],
    ["约 111", ["1:11", "11:1"]], // Chinese fuzzy too (John has 21 chapters)
  ])("%s → %j", (q, expected) => {
    const r = parseQuery(q, ai);
    expect(r.type).toBe("ref");
    expect(r.fuzzy).toBeTruthy();
    const got = r.candidates.map((c) => (c.verse == null ? `${c.chapter}` : `${c.chapter}:${c.verse}`));
    expect(got.sort()).toEqual([...expected].sort());
  });
});

/* The compact form the Recovery Version prints in its cross-references: the
   chapter in Chinese numerals, run straight into an Arabic verse. */
describe("parseQuery — compact Chinese references", () => {
  it.each([
    ["西三16", 51, 3, 16],
    ["太二四37", 40, 24, 37],
    ["诗一一九105", 19, 119, 105],
    ["创一1", 1, 1, 1],
    ["启二二1", 66, 22, 1],
    ["罗十六27", 45, 16, 27],
    ["林前十三13", 46, 13, 13],
    ["约壹一1", 62, 1, 1],
  ])("%s → book %i, %i:%i", (q, bookIdx, chapter, verse) => {
    const r = parseQuery(q, ai);
    expect(r.type).toBe("ref");
    expect(r.bookIdx).toBe(bookIdx);
    expect(r.chapter).toBe(chapter);
    expect(r.verse).toBe(verse);
  });

  it("takes a chapter on its own", () => {
    const r = parseQuery("西三", ai);
    expect(r).toMatchObject({ type: "ref", bookIdx: 51, chapter: 3, verse: null });
  });

  it("takes a verse range, however it is dashed", () => {
    for (const q of ["启二二1～5", "启二二1-5", "启二二1—5"]) {
      expect(parseQuery(q, ai)).toMatchObject({
        type: "ref",
        bookIdx: 66,
        chapter: 22,
        verse: 1,
        verseEnd: 5,
      });
    }
  });

  it("accepts a full-width colon and full-width digits", () => {
    expect(parseQuery("西3：16", ai)).toMatchObject({ bookIdx: 51, chapter: 3, verse: 16 });
    expect(parseQuery("西３：１６", ai)).toMatchObject({ bookIdx: 51, chapter: 3, verse: 16 });
  });

  it("leaves anything that is not a reference to the word search", () => {
    for (const q of ["西", "西零", "爱", "生命树"]) {
      expect(parseQuery(q, ai).type).toBe("word");
    }
  });

  it("rejects a chapter the book does not have", () => {
    // Colossians has four chapters.
    expect(parseQuery("西九1", ai).type).toBe("word");
  });
});

describe("cnNum", () => {
  it.each([
    ["一", 1],
    ["十", 10],
    ["十九", 19],
    ["二十", 20],
    ["二十一", 21],
    ["二一", 21],
    ["二四", 24],
    ["一一九", 119],
    ["一○四", 104],
    ["五十", 50],
  ])("%s → %i", (s, n) => expect(cnNum(s)).toBe(n));

  it("returns NaN for anything else", () => {
    expect(cnNum("x")).toBeNaN();
    expect(cnNum("")).toBeNaN();
  });
});

/* Several references at once, the way they are quoted in a message or a note. */
describe("parseQuery — lists of references", () => {
  const refs = (q) => parseQuery(q, ai).refs;

  it("reads a comma-separated list, in either language's comma", () => {
    expect(refs("弗五18~19,西三16，来十24~25")).toEqual([
      { type: "ref", bookIdx: 49, chapter: 5, verse: 18, verseEnd: 19 },
      { type: "ref", bookIdx: 51, chapter: 3, verse: 16, verseEnd: null },
      { type: "ref", bookIdx: 58, chapter: 10, verse: 24, verseEnd: 25 },
    ]);
  });

  it("reads an English list too", () => {
    expect(refs("John 1:1, Rom 8:28")).toEqual([
      { type: "ref", bookIdx: 43, chapter: 1, verse: 1, verseEnd: null },
      { type: "ref", bookIdx: 45, chapter: 8, verse: 28, verseEnd: null },
    ]);
  });

  it("carries the chapter over to a bare verse", () => {
    expect(refs("西三16，17")).toEqual([
      { type: "ref", bookIdx: 51, chapter: 3, verse: 16, verseEnd: null },
      { type: "ref", bookIdx: 51, chapter: 3, verse: 17, verseEnd: null },
    ]);
    expect(refs("John 1:1, 3")[1]).toMatchObject({ bookIdx: 43, chapter: 1, verse: 3 });
  });

  it("carries the book over to a bare chapter", () => {
    expect(refs("弗五18，六1")).toEqual([
      { type: "ref", bookIdx: 49, chapter: 5, verse: 18, verseEnd: null },
      { type: "ref", bookIdx: 49, chapter: 6, verse: 1, verseEnd: null },
    ]);
  });

  it("accepts the enumeration comma and the semicolon", () => {
    expect(refs("创一1、二3")).toHaveLength(2);
    expect(refs("创一1；二3")).toHaveLength(2);
  });

  it("tolerates a trailing separator, which leaves one reference", () => {
    expect(parseQuery("西三16,", ai)).toMatchObject({
      type: "ref",
      bookIdx: 51,
      chapter: 3,
      verse: 16,
    });
  });

  it("leaves ordinary text with a comma to the word search", () => {
    for (const q of ["love, joy", "爱，喜乐", "西三16, love"]) {
      expect(parseQuery(q, ai).type).toBe("word");
    }
  });
});
