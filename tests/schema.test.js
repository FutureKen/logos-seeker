import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { validateBookFile, validateChapterFile } from "../scripts/lib/schema.mjs";
import { runValidation } from "../scripts/validate-study.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const books = read("public/data/books.json");
const verses = read("public/data/verses.json");
const bookFixture = read("scripts/fixtures/study/1/book.json");
const chapterFixture = read("scripts/fixtures/study/1/1.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const has = (errors, substr) => expect(errors.join("\n")).toContain(substr);

describe("fixtures satisfy the contract", () => {
  it("book.json validates without errors", () => {
    expect(validateBookFile(bookFixture, { books }).errors).toEqual([]);
  });

  it("1.json validates without errors", () => {
    expect(validateChapterFile(chapterFixture, { books, verses }).errors).toEqual([]);
  });

  it("validate-study --fixtures reports no errors", async () => {
    const res = await runValidation({ dir: "scripts/fixtures/study" });
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ book: 1, files: 2 });
    expect(res.rows[0].notes).toEqual({ en: 5, cn: 5 });
    expect(res.rows[0].xrefs).toEqual({ en: 4, cn: 4 });
    expect(res.rows[0].unaligned).toEqual({ en: 1, cn: 1 });
  });
});

describe("validateChapterFile catches violations", () => {
  const bad = (mutate) => {
    const obj = clone(chapterFixture);
    mutate(obj);
    return validateChapterFile(obj, { books, verses }).errors;
  };

  it("flags a marker position past the end of the verse", () => {
    has(
      bad((o) => (o.en.verses["1"].m[0].p = 9999)),
      "en.verses.1.m[0].p: position 9999 is past the end",
    );
  });

  it("flags markers that are not sorted by position", () => {
    has(
      bad((o) => (o.en.verses["1"].m[2].p = 1)),
      "en.verses.1.m[2].p: markers must be sorted by position",
    );
  });

  it("flags a positioned marker after a null one", () => {
    has(
      bad((o) => (o.en.verses["3"].m = [o.en.verses["3"].m[1], o.en.verses["3"].m[0]])),
      "must come before null positions",
    );
  });

  it("flags a marker whose note is missing from `n`", () => {
    has(
      bad((o) => (o.en.verses["1"].m[1].n = 9)),
      'en.verses.1.m[1].n: no note "9"',
    );
  });

  it("flags a marker whose xref group is missing from `x`", () => {
    has(
      bad((o) => (o.en.verses["1"].m[2].x = "z")),
      'en.verses.1.m[2].x: no cross-reference "z"',
    );
  });

  it("flags a duplicate label that is not a repeat marker", () => {
    has(
      bad((o) => (o.en.verses["2"].m[1].l = "1")),
      'en.verses.2.m[1].l: duplicate label "1"',
    );
  });

  it("accepts a repeat marker (same label, same note)", () => {
    const { errors } = validateChapterFile(chapterFixture, { books, verses });
    expect(errors.filter((e) => e.includes("duplicate label"))).toEqual([]);
  });

  it("flags an unresolvable cross-reference", () => {
    has(
      bad((o) => (o.en.verses["1"].x.b[0].r = [38, 99, 1, 0])),
      "chapter 99 out of range",
    );
  });

  it("flags a verse number beyond the chapter length", () => {
    has(
      bad((o) => (o.en.verses["99"] = { m: [], n: {}, x: {} })),
      "verse 99 beyond chapter length 31",
    );
  });

  it("warns rather than errors when a language half is absent", () => {
    const obj = clone(chapterFixture);
    delete obj.cn;
    const { errors, warnings } = validateChapterFile(obj, { books, verses });
    expect(errors).toEqual([]);
    has(warnings, "cn: language half is absent");
  });

  it("errors when both halves are absent", () => {
    const obj = clone(chapterFixture);
    delete obj.en;
    delete obj.cn;
    has(validateChapterFile(obj, { books, verses }).errors, "neither `en` nor `cn` half is present");
  });
});

describe("validateBookFile catches violations", () => {
  const bad = (mutate) => {
    const obj = clone(bookFixture);
    mutate(obj);
    return validateBookFile(obj, { books }).errors;
  };

  it("flags an out-of-range outline level", () => {
    has(
      bad((o) => (o.en.outline[0].level = 7)),
      "en.outline[0].level: level must be 1..6",
    );
  });

  it("flags start after end", () => {
    has(
      bad((o) => (o.en.outline[0].start = [3, 1, 0])),
      "is after end",
    );
  });

  it("flags an invalid Loc part", () => {
    has(
      bad((o) => (o.en.outline[1].start = [1, 1, 5])),
      "part must be 0, 1 or 2",
    );
  });

  it("flags a bad reference inside info", () => {
    has(
      bad((o) => (o.en.info.author[0][1].ref = [70, 1, 1, 0])),
      "en.info.author[0][1].ref: book 70 is not 1..66",
    );
  });

  it("warns when `pos` is set on a non-part-2 outline entry", () => {
    const obj = clone(bookFixture);
    obj.en.outline[0].pos = 5;
    const { errors, warnings } = validateBookFile(obj, { books });
    expect(errors).toEqual([]);
    has(warnings, "only meaningful when start.part === 2");
  });
});
