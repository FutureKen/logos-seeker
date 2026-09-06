// Port of the former scripts/test-search.mjs — fetch is stubbed to read the
// committed JSON from public/data so the engine runs unchanged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?(data\/.+)$/, "$1");
  const body = fs.readFileSync(path.join(root, "public", rel), "utf8");
  return { ok: true, json: async () => JSON.parse(body) };
};

let bs;
let COL;

beforeAll(async () => {
  const mod = await import("../src/search.js");
  COL = mod.COL;
  bs = new mod.BibleSearch();
  await bs.load("");
});

describe("reference lookups", () => {
  it("John 1:1 resolves to one row with the right text", () => {
    const rows = bs.lookupReference(bs.parse("John 1:1"));
    expect(rows).toHaveLength(1);
    expect(bs.verses[rows[0]][COL.EN]).toMatch(/^In the beginning was the Word/);
  });

  it("John 1 is the whole 51-verse chapter", () => {
    expect(bs.lookupReference(bs.parse("John 1"))).toHaveLength(51);
  });

  it("John 1:1-5 is a 5-verse range", () => {
    expect(bs.lookupReference(bs.parse("John 1:1-5"))).toHaveLength(5);
  });

  it("约 3:16 resolves and has Chinese text", () => {
    const rows = bs.lookupReference(bs.parse("约 3:16"));
    expect(rows).toHaveLength(1);
    expect(bs.verses[rows[0]][COL.CN]).toBeTruthy();
  });

  it("chapter context for John 1:1 is the full chapter", () => {
    const john11 = bs.lookupReference(bs.parse("John 1:1"));
    expect(bs.chapterRowsForRow(john11[0])).toHaveLength(51);
  });
});

describe("English word search", () => {
  it("finds many matches for Christ", () => {
    const r = bs.wordSearch("Christ", "en", 1000);
    expect(r.total).toBeGreaterThan(250);
    expect(bs.verses[r.rows[0]][COL.EN]).toContain("Christ");
  });

  it("matches the phrase 'love one another'", () => {
    expect(bs.wordSearch("love one another", "en", 1000).total).toBeGreaterThanOrEqual(5);
  });

  it("'join spirit' matches non-consecutively (1 Cor 6:17)", () => {
    const r = bs.wordSearch("join spirit", "en", 100000);
    const has = r.rows.some((i) => {
      const row = bs.verses[i];
      return (
        bs.bookByIdx.get(row[COL.BOOK]).en === "1 Corinthians" &&
        row[COL.CHAP] === 6 &&
        row[COL.VERSE] === 17
      );
    });
    expect(has).toBe(true);
    expect(
      r.rows.every((i) => {
        const t = bs.verses[i][COL.EN].toLowerCase();
        return t.includes("join") && t.includes("spirit");
      }),
    ).toBe(true);
  });

  it("word order does not change the result count", () => {
    expect(bs.wordSearch("spirit join", "en", 100000).total).toBe(
      bs.wordSearch("join spirit", "en", 100000).total,
    );
  });

  it("ranks the exact consecutive phrase before scattered matches", () => {
    const r = bs.wordSearch("one spirit", "en", 100000);
    expect(r.total).toBeGreaterThanOrEqual(5);
    expect(bs.verses[r.rows[0]][COL.EN].toLowerCase()).toContain("one spirit");
    expect(bs.verses[r.rows[r.rows.length - 1]][COL.EN].toLowerCase()).not.toContain("one spirit");
  });
});

describe("Chinese word search", () => {
  it("'神 爱' matches verses containing both segments", () => {
    const r = bs.wordSearch("神 爱", "cn", 100000);
    expect(r.total).toBeGreaterThan(5);
    expect(
      r.rows.every((i) => {
        const t = bs.verses[i][COL.CN];
        return t.includes("神") && t.includes("爱");
      }),
    ).toBe(true);
  });

  it("基督 matches", () => {
    const r = bs.wordSearch("基督", "cn", 1000);
    expect(r.total).toBeGreaterThan(100);
    expect(bs.verses[r.rows[0]][COL.CN]).toContain("基督");
  });

  it("a single character 爱 matches", () => {
    expect(bs.wordSearch("爱", "cn", 1000).total).toBeGreaterThan(100);
  });

  it("耶和华 (3 characters) matches", () => {
    expect(bs.wordSearch("耶和华", "cn", 100000).total).toBeGreaterThan(5000);
  });
});
