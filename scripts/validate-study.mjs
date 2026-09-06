#!/usr/bin/env node
/**
 * Validate the study data against the contract in `scripts/lib/schema.mjs`.
 *
 *   node scripts/validate-study.mjs [--dir public/data/study] [--book N]
 *                                   [--password … | env STUDY_PASSWORD]
 *                                   [--fixtures] [--diff <otherDir>]
 *
 * Files are decrypted with the key derived from the manifest's `kdf` block; a
 * file that has no `ct` field is treated as plaintext, which is what
 * `--fixtures` (decrypted fixtures under `scripts/fixtures/study`) relies on.
 * Exits 1 when any file has errors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey, decryptJson } from "./lib/studyCrypto.mjs";
import { validateBookFile, validateChapterFile } from "./lib/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const o = { dir: "public/data/study", book: null, password: null, fixtures: false, diff: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixtures") o.fixtures = true;
    else if (a === "--book") o.book = Number(argv[++i]);
    else if (a === "--dir") o.dir = argv[++i];
    else if (a === "--password") o.password = argv[++i];
    else if (a === "--diff") o.diff = argv[++i];
    else if (a.startsWith("--book=")) o.book = Number(a.slice(7));
    else if (a.startsWith("--dir=")) o.dir = a.slice(6);
    else if (a.startsWith("--password=")) o.password = a.slice(11);
    else if (a.startsWith("--diff=")) o.diff = a.slice(7);
  }
  if (o.fixtures && o.dir === "public/data/study") o.dir = "scripts/fixtures/study";
  return o;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Decrypt when the file is a `{v,iv,ct}` blob, otherwise pass it through. */
async function loadFile(file, key) {
  const raw = readJson(file);
  if (raw && typeof raw.ct === "string") {
    if (!key) throw new Error(`${file} is encrypted — pass --password or set STUDY_PASSWORD`);
    return decryptJson(raw, key);
  }
  return raw;
}

function bookDirs(dir, only) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => Number(d.name))
    .filter((n) => only == null || n === only)
    .sort((a, b) => a - b);
}

function countApparatus(half) {
  let notes = 0;
  let xrefs = 0;
  let unaligned = 0;
  for (const v of Object.values(half?.verses ?? {})) {
    notes += Object.keys(v.n ?? {}).length;
    for (const list of Object.values(v.x ?? {})) xrefs += list.length;
    for (const mk of v.m ?? []) if (mk.p == null) unaligned++;
  }
  return { notes, xrefs, unaligned };
}

/**
 * Run the validation and return a machine-readable result. Importable so tests
 * do not have to spawn a process.
 */
export async function runValidation(opts = {}) {
  const o = { dir: "scripts/fixtures/study", book: null, password: null, ...opts };
  const dir = path.resolve(ROOT, o.dir);
  const books = readJson(path.join(ROOT, "public/data/books.json"));
  const verses = readJson(path.join(ROOT, "public/data/verses.json"));

  let index = null;
  const indexPath = path.join(dir, "index.json");
  if (fs.existsSync(indexPath)) index = readJson(indexPath);

  let key = null;
  const password = o.password ?? process.env.STUDY_PASSWORD ?? null;
  if (password && index?.kdf?.salt) {
    key = await deriveKey(password, index.kdf.salt, index.kdf.iter ?? 200000);
  }

  const rows = [];
  const errors = [];
  const warnings = [];

  for (const book of bookDirs(dir, o.book)) {
    const bdir = path.join(dir, String(book));
    const row = {
      book,
      files: 0,
      notes: { en: 0, cn: 0 },
      xrefs: { en: 0, cn: 0 },
      unaligned: { en: 0, cn: 0 },
      errors: 0,
      warnings: 0,
    };
    const files = fs.readdirSync(bdir).filter((f) => f.endsWith(".json")).sort(sortFiles);

    for (const name of files) {
      const file = path.join(bdir, name);
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      let obj;
      try {
        obj = await loadFile(file, key);
      } catch (e) {
        errors.push(`${rel}: ${e.message}`);
        row.errors++;
        continue;
      }
      row.files++;
      const res =
        name === "book.json"
          ? validateBookFile(obj, { books })
          : validateChapterFile(obj, { books, verses });
      for (const m of res.errors) errors.push(`${rel} ${m}`);
      for (const m of res.warnings) warnings.push(`${rel} ${m}`);
      row.errors += res.errors.length;
      row.warnings += res.warnings.length;

      if (name !== "book.json") {
        for (const lang of ["en", "cn"]) {
          if (!obj?.[lang]) continue;
          const c = countApparatus(obj[lang]);
          row.notes[lang] += c.notes;
          row.xrefs[lang] += c.xrefs;
          row.unaligned[lang] += c.unaligned;
        }
      }
    }
    rows.push(row);
  }

  return { dir, rows, errors, warnings, ok: errors.length === 0 };
}

function sortFiles(a, b) {
  if (a === "book.json") return -1;
  if (b === "book.json") return 1;
  return Number(a.replace(".json", "")) - Number(b.replace(".json", ""));
}

/** Compare decrypted content between two directories (idempotence check). */
export async function runDiff(dirA, dirB, opts = {}) {
  const a = path.resolve(ROOT, dirA);
  const b = path.resolve(ROOT, dirB);
  const diffs = [];
  const keyFor = async (dir) => {
    const ip = path.join(dir, "index.json");
    const password = opts.password ?? process.env.STUDY_PASSWORD ?? null;
    if (!password || !fs.existsSync(ip)) return null;
    const idx = readJson(ip);
    if (!idx?.kdf?.salt) return null;
    return deriveKey(password, idx.kdf.salt, idx.kdf.iter ?? 200000);
  };
  const [ka, kb] = [await keyFor(a), await keyFor(b)];

  const walk = (dir) => {
    const out = [];
    for (const book of bookDirs(dir, null)) {
      for (const f of fs.readdirSync(path.join(dir, String(book)))) {
        if (f.endsWith(".json")) out.push(`${book}/${f}`);
      }
    }
    return out.sort();
  };
  const listA = walk(a);
  const listB = new Set(walk(b));
  for (const rel of listA) {
    if (!listB.has(rel)) {
      diffs.push(`${rel}: missing in ${dirB}`);
      continue;
    }
    listB.delete(rel);
    const [oa, ob] = [await loadFile(path.join(a, rel), ka), await loadFile(path.join(b, rel), kb)];
    if (JSON.stringify(oa) !== JSON.stringify(ob)) diffs.push(`${rel}: decrypted content differs`);
  }
  for (const rel of listB) diffs.push(`${rel}: missing in ${dirA}`);
  return { diffs, ok: diffs.length === 0 };
}

function printTable(result) {
  const head = ["book", "files", "notes en/cn", "xrefs en/cn", "unaligned en/cn", "err", "warn"];
  const lines = result.rows.map((r) => [
    String(r.book),
    String(r.files),
    `${r.notes.en}/${r.notes.cn}`,
    `${r.xrefs.en}/${r.xrefs.cn}`,
    `${r.unaligned.en}/${r.unaligned.cn}`,
    String(r.errors),
    String(r.warnings),
  ]);
  const w = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells) => cells.map((c, i) => c.padEnd(w[i])).join("  ");
  console.log(fmt(head));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const l of lines) console.log(fmt(l));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("validate-study.mjs")) {
  const o = parseArgs(process.argv.slice(2));
  const result = await runValidation(o);
  if (!result.rows.length) console.log(`No study data found in ${result.dir}`);
  else printTable(result);
  for (const w of result.warnings) console.warn(`warn  ${w}`);
  for (const e of result.errors) console.error(`ERROR ${e}`);
  console.log(
    `\n${result.errors.length} error(s), ${result.warnings.length} warning(s) in ${result.dir}`,
  );

  let ok = result.ok;
  if (o.diff) {
    const d = await runDiff(o.dir, o.diff, o);
    for (const line of d.diffs) console.error(`DIFF  ${line}`);
    console.log(`${d.diffs.length} difference(s) vs ${o.diff}`);
    ok = ok && d.ok;
  }
  process.exit(ok ? 0 : 1);
}
