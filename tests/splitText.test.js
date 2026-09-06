import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { splitText } from "../src/study/splitText.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const chapter = read("scripts/fixtures/study/1/1.json");
const bookFile = read("scripts/fixtures/study/1/book.json");
const verses = read("public/data/verses.json");
const textOf = (b, c, v, lang) => {
  const row = verses.find((r) => r[0] === b && r[1] === c && r[2] === v);
  return lang === "cn" ? row[4] : row[3];
};

describe("splitText — English", () => {
  it("splits Gen 1:1 at every marker", () => {
    const text = textOf(1, 1, 1, "en");
    const segs = splitText(text, chapter.en.verses["1"].m);
    expect(segs).toEqual([
      { m: 0, l: "1a", x: true },
      { t: "In the " },
      { m: 1, l: "2", x: false },
      { t: "beginning " },
      { m: 2, l: "b", x: true },
      { t: "God created the heavens and the earth." },
    ]);
    expect(segs.filter((s) => s.t).map((s) => s.t).join("")).toBe(text);
  });

  it("emits unaligned markers first, flagged floating", () => {
    const text = textOf(1, 1, 3, "en");
    const segs = splitText(text, chapter.en.verses["3"].m);
    expect(segs[0]).toEqual({ m: 1, l: "a", x: true, floating: true });
    expect(segs[1]).toEqual({ t: "And God " });
    expect(segs[2]).toEqual({ m: 0, l: "1", x: false });
    expect(segs.filter((s) => s.t).map((s) => s.t).join("")).toBe(text);
  });

  it("places a mid-verse outline heading at its pos, before a marker there", () => {
    const text = textOf(1, 1, 2, "en");
    const head = bookFile.en.outline.find((e) => e.pos != null);
    const segs = splitText(text, chapter.en.verses["2"].m, [head]);
    const headIdx = segs.findIndex((s) => s.h);
    const markerIdx = segs.findIndex((s) => s.m === 2);
    expect(headIdx).toBeGreaterThan(0);
    expect(headIdx).toBeLessThan(markerIdx);
    expect(segs.filter((s) => s.t).map((s) => s.t).join("")).toBe(text);
    // the heading opens the second half of the verse
    expect(text.slice(head.pos)).toMatch(/^and the Spirit of God/);
  });
});

describe("splitText — Chinese", () => {
  it("splits Gen 1:1 at the Chinese offsets", () => {
    const text = textOf(1, 1, 1, "cn");
    const segs = splitText(text, chapter.cn.verses["1"].m);
    expect(segs).toEqual([
      { m: 0, l: "1a", x: true },
      { t: "起初" },
      { m: 1, l: "2", x: false },
      { t: "神" },
      { m: 2, l: "b", x: true },
      { t: "创造诸天与地，" },
    ]);
  });

  it("anchors the mid-verse heading at the 下 split point", () => {
    const text = textOf(1, 1, 2, "cn");
    const head = bookFile.cn.outline.find((e) => e.pos != null);
    const segs = splitText(text, chapter.cn.verses["2"].m, [head]);
    expect(text.slice(head.pos)).toMatch(/^神的灵/);
    expect(segs.filter((s) => s.t).map((s) => s.t).join("")).toBe(text);
  });
});

describe("splitText — edge cases", () => {
  it("returns a single text segment when there is no apparatus", () => {
    expect(splitText("abc", [], [])).toEqual([{ t: "abc" }]);
  });

  it("clamps out-of-range positions instead of producing gaps", () => {
    const segs = splitText("abc", [{ l: "1", p: 99, n: 1 }]);
    expect(segs.filter((s) => s.t).map((s) => s.t).join("")).toBe("abc");
  });

  it("puts a heading with no pos before the text", () => {
    const h = { level: 1, title: "Head", pos: null };
    expect(splitText("abc", [], [h])).toEqual([{ h }, { t: "abc" }]);
  });
});
