// Port of the former scripts/test-parse.mjs — same cases, same expectations.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildAliasIndex, parseQuery } from "../src/parseQuery.js";

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
