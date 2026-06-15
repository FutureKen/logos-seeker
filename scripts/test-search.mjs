// Exercise BibleSearch logic in Node by stubbing fetch with local files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Minimal fetch stub for the two data files.
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?(data\/.+)$/, "$1");
  const body = read(rel);
  return { ok: true, json: async () => JSON.parse(body) };
};

const { BibleSearch, COL } = await import("../src/search.js");
const bs = new BibleSearch();
await bs.load("");

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail++;
};

// Reference lookups
const john11 = bs.lookupReference(bs.parse("John 1:1"));
check("John 1:1 resolves to 1 row", john11.length === 1);
check("John 1:1 text", bs.verses[john11[0]][COL.EN].startsWith("In the beginning was the Word"));

const john1 = bs.lookupReference(bs.parse("John 1"));
check("John 1 whole chapter = 51 verses", john1.length === 51, `got ${john1.length}`);

const range = bs.lookupReference(bs.parse("John 1:1-5"));
check("John 1:1-5 = 5 verses", range.length === 5, `got ${range.length}`);

const cnRef = bs.lookupReference(bs.parse("约 3:16"));
check("约 3:16 resolves", cnRef.length === 1);
check("约 3:16 CN text non-empty", !!bs.verses[cnRef[0]][COL.CN]);

// English word search
const christ = bs.wordSearch("Christ", "en", 1000);
check("Christ EN matches found", christ.total > 250, `total=${christ.total}`);
check("Christ result row contains 'Christ'", bs.verses[christ.rows[0]][COL.EN].includes("Christ"));

const phrase = bs.wordSearch("love one another", "en", 1000);
check("phrase 'love one another' matches", phrase.total >= 5, `total=${phrase.total}`);

// Multi-word AND (non-consecutive): "join spirit" should match
// 1 Cor 6:17 "...joined to the Lord is one spirit."
const joinSpirit = bs.wordSearch("join spirit", "en", 100000);
const has1Cor617 = joinSpirit.rows.some((i) => {
  const r = bs.verses[i];
  return bs.bookByIdx.get(r[COL.BOOK]).en === "1 Corinthians" && r[COL.CHAP] === 6 && r[COL.VERSE] === 17;
});
check("'join spirit' (AND, non-consecutive) finds 1 Cor 6:17", has1Cor617, `total=${joinSpirit.total}`);
check("'join spirit' every result has both words", joinSpirit.rows.every((i) => {
  const t = bs.verses[i][COL.EN].toLowerCase();
  return t.includes("join") && t.includes("spirit");
}));

// Word order shouldn't matter
const spiritJoin = bs.wordSearch("spirit join", "en", 100000);
check("word order doesn't matter (same total)", spiritJoin.total === joinSpirit.total, `${spiritJoin.total} vs ${joinSpirit.total}`);

// Consecutive phrase still works as a subset of the AND results
const consec = bs.wordSearch("one spirit", "en", 100000);
check("'one spirit' AND matches", consec.total >= 5, `total=${consec.total}`);

// Exact consecutive-phrase matches are ranked before scattered matches.
const os = bs.wordSearch("one spirit", "en", 100000);
const firstHasPhrase = bs.verses[os.rows[0]][COL.EN].toLowerCase().includes("one spirit");
check("exact phrase 'one spirit' ranked first", firstHasPhrase, bs.refLabel(bs.verses[os.rows[0]], "en"));
// The last result should be a scattered (non-consecutive) match.
const lastNoPhrase = !bs.verses[os.rows[os.rows.length - 1]][COL.EN].toLowerCase().includes("one spirit");
check("scattered matches ranked after exact", lastNoPhrase);

// Chinese multi-segment AND
const cnAnd = bs.wordSearch("神 爱", "cn", 100000);
check("CN 'neng ai' AND finds verses with both", cnAnd.rows.every((i) => {
  const t = bs.verses[i][COL.CN];
  return t.includes("神") && t.includes("爱");
}) && cnAnd.total > 5, `total=${cnAnd.total}`);

// Chinese word search
const jidu = bs.wordSearch("基督", "cn", 1000);
check("基督 CN matches found", jidu.total > 100, `total=${jidu.total}`);
check("基督 result contains 基督", bs.verses[jidu.rows[0]][COL.CN].includes("基督"));

const oneChar = bs.wordSearch("爱", "cn", 1000);
check("single char 爱 matches", oneChar.total > 100, `total=${oneChar.total}`);

const threeChar = bs.wordSearch("耶和华", "cn", 100000);
check("耶和华 matches (3-char)", threeChar.total > 5000, `total=${threeChar.total}`);

// chapter context for a row
const ctx = bs.chapterRowsForRow(john11[0]);
check("chapter context for John 1:1 = full ch1", ctx.length === 51, `got ${ctx.length}`);

console.log(fail === 0 ? "\nALL SEARCH TESTS PASSED" : `\n${fail} TEST(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
