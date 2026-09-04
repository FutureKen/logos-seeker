import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { StudyStore } from "../src/study/studyStore.js";
import { deriveKey, encryptJson, makeVerify, randomSalt } from "../src/study/studyCrypto.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const PASSWORD = "fixture-password";
const ITER = 1000;
const BASE = "/app/";

let key;
let files; // url → JSON body
let fetchMock;

beforeAll(async () => {
  const salt = randomSalt();
  key = await deriveKey(PASSWORD, salt, ITER);
  const bookFile = read("scripts/fixtures/study/1/book.json");
  const chapterFile = read("scripts/fixtures/study/1/1.json");

  files = new Map([
    [
      `${BASE}data/study/index.json`,
      {
        schema: 1,
        version: "2026-09-04.1",
        kdf: { salt, iter: ITER },
        verify: await makeVerify(key),
        books: { 1: { chapters: 1, bytes: 4096, notes: 5, xrefs: 4, unaligned: { en: 1, cn: 1 } } },
        totalBytes: 4096,
      },
    ],
    [`${BASE}data/study/1/book.json`, await encryptJson(bookFile, key)],
    [`${BASE}data/study/1/1.json`, await encryptJson(chapterFile, key)],
  ]);
});

function install() {
  fetchMock = vi.fn(async (url) => {
    const body = files.get(String(url));
    if (!body) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => body };
  });
  globalThis.fetch = fetchMock;
  return new StudyStore(BASE);
}

describe("StudyStore", () => {
  it("reads the plaintext manifest while still locked", async () => {
    const store = install();
    const index = await store.loadIndex();
    expect(index.version).toBe("2026-09-04.1");
    expect(store.unlocked).toBe(false);
  });

  it("refuses encrypted files without a key", async () => {
    const store = install();
    await expect(store.ensureChapter(1, 1)).rejects.toThrow("study-locked");
  });

  it("decrypts a chapter once the key is set", async () => {
    const store = install();
    store.setKey(key);
    const ch = await store.ensureChapter(1, 1);
    expect(ch.book).toBe(1);
    expect(ch.en.verses["1"].m[0].l).toBe("1a");
    expect(store.chapter(1, 1)).toBe(ch);
    expect(store.verse(1, 1, 1, "cn").m[0].p).toBe(0);
    expect(store.verse(1, 1, 9, "en")).toBeNull();
  });

  it("caches and dedupes concurrent requests", async () => {
    const store = install();
    store.setKey(key);
    const [a, b] = await Promise.all([store.ensureChapter(1, 1), store.ensureChapter(1, 1)]);
    expect(a).toBe(b);
    await store.ensureChapter(1, 1);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("1/1.json"))).toHaveLength(1);
  });

  it("clears the cache when the key changes", async () => {
    const store = install();
    store.setKey(key);
    await store.ensureChapter(1, 1);
    store.setKey(null);
    expect(store.chapter(1, 1)).toBeNull();
    expect(store.unlocked).toBe(false);
  });

  it("groups outline entries by their starting verse", async () => {
    const store = install();
    store.setKey(key);
    await store.ensureBook(1);
    const map = store.outlineForChapter(1, 1, "en");
    expect([...map.keys()].sort()).toEqual([1, 2]);
    expect(map.get(1)).toHaveLength(2);
    expect(map.get(2)).toHaveLength(2);
    expect(store.outlineForChapter(1, 2, "en").size).toBe(0);
  });

  it("reports 404s as errors", async () => {
    const store = install();
    store.setKey(key);
    await expect(store.ensureChapter(1, 2)).rejects.toThrow(/study fetch failed/);
  });

  it("preloadAll walks every file in the manifest and reports progress", async () => {
    const store = install();
    store.setKey(key);
    const seen = [];
    const res = await store.preloadAll({ concurrency: 2, onProgress: (p) => seen.push(p) });
    expect(res).toEqual({ done: 2, total: 2 });
    expect(seen).toHaveLength(2);
    expect(store.book(1)).not.toBeNull();
    expect(store.chapter(1, 1)).not.toBeNull();
  });
});
