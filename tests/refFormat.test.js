import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { formatRef, refKey } from "../src/study/refFormat.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const books = JSON.parse(fs.readFileSync(path.join(root, "public/data/books.json"), "utf8"));
const bookByIdx = new Map(books.map((b) => [b.idx, b]));

describe("formatRef", () => {
  it.each([
    [[43, 1, 1, 2], "en", "John 1:1-2"],
    [[43, 1, 1, 2], "cn", "约翰福音 1:1-2"],
    [[43, 1, 1, 0], "en", "John 1:1"],
    [[43, 1, 0, 0], "en", "John 1"],
    [[43, 1, 0, 0], "cn", "约翰福音 1"],
    [[19, 33, 6, 0], "en", "Psalms 33:6"],
    [[43, 1, 5, 5], "en", "John 1:5"],
  ])("%j (%s) → %s", (ref, lang, expected) => {
    expect(formatRef(ref, lang, bookByIdx)).toBe(expected);
  });

  it("falls back to #idx for an unknown book", () => {
    expect(formatRef([99, 1, 1, 0], "en", bookByIdx)).toBe("#99 1:1");
  });
});

describe("refKey", () => {
  it("collapses a range to its first verse", () => {
    expect(refKey([43, 1, 1, 2])).toBe("43:1:1");
    expect(refKey([43, 1, 0, 0])).toBe("43:1:0");
  });

  it("returns an empty string for a non-array", () => {
    expect(refKey(null)).toBe("");
  });
});
