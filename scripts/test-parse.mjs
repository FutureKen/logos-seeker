// Smoke-test parseQuery + search against the real generated data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAliasIndex, parseQuery } from "../src/parseQuery.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const books = JSON.parse(fs.readFileSync(path.join(dir, "books.json"), "utf8"));
const ai = buildAliasIndex(books);

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

let fail = 0;
for (const c of cases) {
  const r = parseQuery(c, ai);
  const summary =
    r.type === "ref"
      ? `REF book#${r.bookIdx} ${r.chapter}:${r.verse ?? "(whole)"}${
          r.verseEnd ? "-" + r.verseEnd : ""
        }`
      : `WORD lang=${r.lang} "${r.term}"`;
  console.log(`${c.padEnd(22)} -> ${summary}`);
}

// Assertions
function assertRef(q, bookIdx, ch, v) {
  const r = parseQuery(q, ai);
  const ok = r.type === "ref" && r.bookIdx === bookIdx && r.chapter === ch && r.verse === v;
  if (!ok) {
    console.error(`FAIL: ${q} => ${JSON.stringify(r)} (wanted ${bookIdx} ${ch}:${v})`);
    fail++;
  }
}
function assertWord(q, lang) {
  const r = parseQuery(q, ai);
  if (!(r.type === "word" && r.lang === lang)) {
    console.error(`FAIL: ${q} => ${JSON.stringify(r)} (wanted word/${lang})`);
    fail++;
  }
}
function assertFuzzy(q, expected /* array of "c:v" or "c" strings */) {
  const r = parseQuery(q, ai);
  if (!(r.type === "ref" && r.fuzzy)) {
    console.error(`FAIL: ${q} => ${JSON.stringify(r)} (wanted fuzzy ref)`);
    fail++;
    return;
  }
  const got = r.candidates.map((c) => (c.verse == null ? `${c.chapter}` : `${c.chapter}:${c.verse}`));
  const ok = expected.length === got.length && expected.every((e) => got.includes(e));
  if (!ok) {
    console.error(`FAIL: ${q} => [${got}] (wanted [${expected}])`);
    fail++;
  }
}

assertRef("John 1:1", 43, 1, 1);
assertRef("约 1:1", 43, 1, 1);
assertRef("约翰福音 1:1", 43, 1, 1);
assertRef("1 John 2:3", 62, 2, 3);
assertRef("Gen 1:1", 1, 1, 1);
assertRef("John 1", 43, 1, null); // single digit chapter, not fuzzy
assertRef("诗 23:1", 19, 23, 1);
assertRef("Rev 22:21", 66, 22, 21);
assertWord("Christ", "en");
assertWord("基督", "cn");
assertWord("love one another", "en");

// Fuzzy / blurred references
assertFuzzy("heb 111", ["1:11", "11:1"]);
assertFuzzy("heb11", ["11", "1:1"]);
assertFuzzy("Ps 23", ["23", "2:3"]);
assertFuzzy("约 111", ["1:11", "11:1"]); // Chinese fuzzy too (John has 21 ch)

console.log(fail === 0 ? "\nALL PARSE ASSERTIONS PASSED" : `\n${fail} ASSERTION(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
