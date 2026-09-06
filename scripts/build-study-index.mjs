#!/usr/bin/env node
/**
 * Write the study manifest `<dir>/index.json`.
 *
 *   node scripts/build-study-index.mjs [--dir public/data/study]
 *                                      [--password … | env STUDY_PASSWORD]
 *
 * The `kdf` salt and the `verify` blob are kept exactly as they are — every
 * file in the directory is encrypted against them — and only the statistics and
 * the `version` are rewritten. `version` is `YYYY-MM-DD.N`: the counter resets
 * each day and increments when the same day is rebuilt, which is what the
 * service worker uses as the study cache name.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptJson } from "./lib/studyCrypto.mjs";
import { getStudyKey, passwordFromArgs, readIndex, writeIndex } from "./lib/studyKey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const o = { dir: "public/data/study", password: null, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") o.dir = argv[++i];
    else if (a === "--date") o.date = argv[++i];
    else if (a.startsWith("--dir=")) o.dir = a.slice(6);
    else if (a.startsWith("--date=")) o.date = a.slice(7);
  }
  o.password = passwordFromArgs(argv);
  return o;
}

/** `2026-09-04` → `2026-09-04.1`, or `.N+1` when today already has a build. */
export function nextVersion(previous, today) {
  const prefix = `${today}.`;
  if (typeof previous === "string" && previous.startsWith(prefix)) {
    const n = Number(previous.slice(prefix.length));
    if (Number.isInteger(n) && n > 0) return `${prefix}${n + 1}`;
  }
  return `${prefix}1`;
}

/** Notes, cross-references and unaligned markers in one language half. */
export function countHalf(half) {
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

export async function buildIndex(o) {
  const dir = path.resolve(ROOT, o.dir);
  const previous = readIndex(dir)?.version;
  // Creates `index.json` with a fresh salt when the directory is brand new.
  const { key, index: existing } = await getStudyKey(dir, o.password);

  const books = {};
  let totalBytes = 0;

  const dirs = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
        .map((d) => Number(d.name))
        .sort((a, b) => a - b)
    : [];

  for (const book of dirs) {
    const bdir = path.join(dir, String(book));
    const row = {
      chapters: 0,
      bytes: 0,
      notes: { en: 0, cn: 0 },
      xrefs: { en: 0, cn: 0 },
      unaligned: { en: 0, cn: 0 },
    };
    for (const name of fs.readdirSync(bdir).sort()) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(bdir, name);
      row.bytes += fs.statSync(file).size;
      if (name === "book.json") continue;
      row.chapters++;
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const obj = typeof raw?.ct === "string" ? await decryptJson(raw, key) : raw;
      for (const lang of ["en", "cn"]) {
        if (!obj?.[lang]) continue;
        const c = countHalf(obj[lang]);
        row.notes[lang] += c.notes;
        row.xrefs[lang] += c.xrefs;
        row.unaligned[lang] += c.unaligned;
      }
    }
    totalBytes += row.bytes;
    books[String(book)] = row;
  }

  const today = o.date ?? new Date().toISOString().slice(0, 10);
  const index = {
    schema: 1,
    version: nextVersion(previous, today),
    layout: "chapter",
    kdf: existing.kdf,
    verify: existing.verify,
    books,
    totalBytes,
  };
  writeIndex(dir, index);
  return index;
}

if (process.argv[1]?.endsWith("build-study-index.mjs")) {
  const o = parseArgs(process.argv.slice(2));
  const index = await buildIndex(o);
  const n = Object.keys(index.books).length;
  const mb = (index.totalBytes / 1024 / 1024).toFixed(1);
  console.log(`index.json: version ${index.version}, ${n} book(s), ${mb} MB`);
}
