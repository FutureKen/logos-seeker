#!/usr/bin/env node
/**
 * Cache the Simplified-Chinese Recovery Version apparatus from
 * recoveryversion.com.tw into `scripts/.cache/rcv-tw/` (gitignored).
 *
 *   node scripts/fetch-rcv-tw.mjs [--book N | --all] [--delay 400] [--force]
 *
 * Layout (one file per chapter plus one per book):
 *   scripts/.cache/rcv-tw/{book}/{chapter}.json
 *     {book, chapter, verses, footnotes, foots, footnoteLinks}
 *   scripts/.cache/rcv-tw/{book}/book.json
 *     {book, outlines, intros, introLinks, topics}
 *
 * Values are the raw JSON arrays the endpoints return (`VERSION=2` =
 * Simplified). The run is resumable — existing files are skipped, never
 * rewritten — throttled, and retries transient failures three times with
 * exponential backoff. A 403/429 aborts the whole run so we stop hammering.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts/.cache/rcv-tw");
const BASE = "https://www.recoveryversion.com.tw//api/";

export function parseArgs(argv) {
  const o = { book: null, all: false, delay: 400, force: false, cache: CACHE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") o.all = true;
    else if (a === "--force") o.force = true;
    else if (a === "--book") o.book = Number(argv[++i]);
    else if (a === "--delay") o.delay = Number(argv[++i]);
    else if (a === "--cache") o.cache = argv[++i];
    else if (a.startsWith("--book=")) o.book = Number(a.slice(7));
    else if (a.startsWith("--delay=")) o.delay = Number(a.slice(8));
    else if (a.startsWith("--cache=")) o.cache = a.slice(8);
  }
  return o;
}

/** Endpoint → query string, exactly as the site issues them. */
export function chapterUrls(book, chapter) {
  const cs = `chapter_code=${book}&section_code=${chapter}`;
  return {
    verses: `getVerses?VERSION=2&output[]=content&output[]=unit_code&output[]=segment_code&${cs}&ORDER=id`,
    footnotes: `getFootnotes?VERSION=2&${cs}`,
    foots: `getFoots?VERSION=2&${cs}`,
    footnoteLinks: `getFootnoteLinks?VERSION=2&${cs}`,
  };
}

export function bookUrls(book) {
  const c = `chapter_code=${book}`;
  return {
    outlines:
      "getOutlines?VERSION=2&output[]=level&output[]=outline_content&output[]=related_chapters" +
      `&output[]=related_number&output[]=related_section_code&${c}&ORDER=volume_order`,
    intros: `getBookIntros?VERSION=2&output[]=content&output[]=note&${c}&ORDER=id`,
    introLinks: `getBookIntroLinks?VERSION=2&${c}`,
    topics: `getTopics?VERSION=2&output[]=content&${c}&LIMIT=1`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Blocked extends Error {}

async function getJson(url, { retries = 3 } = {}) {
  let wait = 1000;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json, text/plain, */*" },
      });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(wait);
      wait *= 2;
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      throw new Blocked(`${res.status} from ${url} — stopping`);
    }
    if (!res.ok) {
      if (attempt >= retries) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      await sleep(wait);
      wait *= 2;
      continue;
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (attempt >= retries) throw new Error(`non-JSON response for ${url}`);
      await sleep(wait);
      wait *= 2;
    }
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj) + "\n");
}

async function fetchAll(urls, delay) {
  const out = {};
  for (const [key, q] of Object.entries(urls)) {
    out[key] = await getJson(BASE + q);
    await sleep(delay);
  }
  return out;
}

export async function fetchBook(book, chapters, o) {
  const dir = path.join(o.cache, String(book));
  let fetched = 0;
  let skipped = 0;

  const bookFile = path.join(dir, "book.json");
  if (!o.force && fs.existsSync(bookFile)) skipped++;
  else {
    writeJson(bookFile, { book, ...(await fetchAll(bookUrls(book), o.delay)) });
    fetched++;
  }

  for (let chapter = 1; chapter <= chapters; chapter++) {
    const file = path.join(dir, `${chapter}.json`);
    if (!o.force && fs.existsSync(file)) {
      skipped++;
      continue;
    }
    writeJson(file, { book, chapter, ...(await fetchAll(chapterUrls(book, chapter), o.delay)) });
    fetched++;
    if (fetched % 10 === 0) console.log(`  book ${book}: ${chapter}/${chapters}`);
  }
  return { fetched, skipped };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.all && !o.book) {
    console.error("usage: node scripts/fetch-rcv-tw.mjs [--book N | --all] [--delay 400]");
    process.exit(2);
  }
  const books = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/books.json"), "utf8"));
  const wanted = o.all ? books : books.filter((b) => b.idx === o.book);
  if (!wanted.length) {
    console.error(`unknown book ${o.book}`);
    process.exit(2);
  }

  let total = 0;
  for (const b of wanted) {
    try {
      const r = await fetchBook(b.idx, b.chapters.length, o);
      total += r.fetched;
      console.log(`book ${b.idx} ${b.cn}: ${r.fetched} fetched, ${r.skipped} cached`);
    } catch (e) {
      if (e instanceof Blocked) {
        console.error(`blocked: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  }
  console.log(`done — ${total} file(s) written to ${path.relative(ROOT, o.cache)}`);
}

if (process.argv[1]?.endsWith("fetch-rcv-tw.mjs")) await main();
