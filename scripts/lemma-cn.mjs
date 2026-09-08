#!/usr/bin/env node
/**
 * Recover the anchor word ("词组") each Chinese marker is about, and write it to
 * `scripts/data/cn-lemma/{book}.json` for `build-study-cn.mjs` to attach as `w`.
 *
 *   node scripts/lemma-cn.mjs [--book N | --all] [--chapter N] [--model …]
 *                             [--base-url http://127.0.0.1:1234/v1]
 *                             [--concurrency 4] [--study <dir>] [--force]
 *
 * Any OpenAI-compatible server will do (LM Studio, Ollama, …). The task is a
 * boundary decision, not a puzzle, so the request asks for no reasoning — a
 * model left to think spends its whole budget there and answers nothing.
 *
 * Marker positions come from the same `buildChapter` the builder uses, run over
 * the raw `scripts/.cache/rcv-tw` cache, so a word is always keyed by exactly
 * the position the app will render it at. The English anchor word for the same
 * note is the strongest hint the model gets: `--study` points at a built half,
 * by default the plaintext one from `build-study-en.mjs --plain`, which needs
 * no password (pass `--password` to read the encrypted `public/data/study`).
 *
 * Position alone settles a one-character candidate; the rest go to the model,
 * one request per verse, and every answer must come back a prefix of the
 * candidate (`verifyLemma`) or it is retried once and then sent to `review.json`
 * for a human. A last pass grows any word that stopped inside a name — "耶和"
 * is only ever the front of 耶和华, and the corpus says so without being asked.
 * Results are written per chapter, so a run can be interrupted and resumed:
 * keys already on disk are skipped unless `--force`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildChapter } from "./build-study-cn.mjs";
import { decryptJson } from "./lib/studyCrypto.mjs";
import { getStudyKey, passwordFromArgs } from "./lib/studyKey.mjs";
import {
  SYSTEM_PROMPT,
  applyAnswer,
  buildPrompt,
  candidateSpan,
  countFollowers,
  parseAnswer,
  stickyExtension,
} from "./lib/lemma.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts/.cache/rcv-tw");
const OUT = path.join(ROOT, "scripts/data/cn-lemma");

export function parseArgs(argv) {
  const o = {
    book: null,
    all: false,
    chapter: null,
    baseUrl: process.env.LEMMA_BASE_URL || "http://127.0.0.1:1234/v1",
    model: process.env.LEMMA_MODEL || null,
    apiKey: process.env.LEMMA_API_KEY || "lm-studio",
    concurrency: 4,
    timeout: 120000,
    cache: CACHE,
    out: OUT,
    study: process.env.LEMMA_EN || "scripts/.cache/study-en-plain",
    force: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (n) => (a.includes("=") ? a.slice(n) : argv[++i]);
    if (a === "--all") o.all = true;
    else if (a === "--force") o.force = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a.startsWith("--book")) o.book = Number(val(7));
    else if (a.startsWith("--chapter")) o.chapter = Number(val(10));
    else if (a.startsWith("--base-url")) o.baseUrl = String(val(11)).replace(/\/+$/, "");
    else if (a.startsWith("--model")) o.model = val(8);
    else if (a.startsWith("--api-key")) o.apiKey = val(10);
    else if (a.startsWith("--concurrency")) o.concurrency = Number(val(14));
    else if (a.startsWith("--timeout")) o.timeout = Number(val(10));
    else if (a.startsWith("--cache")) o.cache = val(8);
    else if (a.startsWith("--out")) o.out = val(6);
    else if (a.startsWith("--study")) o.study = val(8);
  }
  o.password = passwordFromArgs(argv);
  return o;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** `{"1:1:0": "起初"}`, sorted so a re-run produces a stable diff. */
function writeTable(file, table) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const keys = Object.keys(table).sort((a, b) => {
    const [ac, av, ap] = a.split(":").map(Number);
    const [bc, bv, bp] = b.split(":").map(Number);
    return ac - bc || av - bv || ap - bp;
  });
  const out = {};
  for (const k of keys) out[k] = table[k];
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

/** note/xref key → English anchor word, from the built English half. */
export function enHints(enVerse) {
  const m = new Map();
  for (const mk of enVerse?.m ?? []) {
    if (!mk.w) continue;
    if (mk.n != null && !m.has(`n:${mk.n}`)) m.set(`n:${mk.n}`, mk.w);
    if (mk.x != null && !m.has(`x:${mk.x}`)) m.set(`x:${mk.x}`, mk.w);
  }
  return m;
}

/* --------------------------------------------------------------- the model */

/**
 * Ways to ask a server not to think, most effective first. A reasoning model
 * left to think spends its whole budget on it and returns an empty `content`,
 * which is both slow and useless here — the task is a lookup, not a puzzle.
 * The first form the server accepts is remembered for the rest of the run.
 */
const NO_THINK = [
  { reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false } },
  { reasoning_effort: "none" },
  { chat_template_kwargs: { enable_thinking: false } },
  {},
];
let noThink = 0;

/** An answer this long is almost always the whole candidate kept out of doubt. */
const LONG_WORD = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(o, messages) {
  let lastError = null;
  // A local server cold-loading a model 500s until it is ready, so a failed
  // request is usually worth waiting out rather than sending a verse to review.
  for (let tries = 0; tries < 4; tries++) {
    if (tries) await sleep(2000 * tries);
    for (let attempt = noThink; attempt < NO_THINK.length; attempt++) {
      let res;
      try {
        res = await fetch(`${o.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${o.apiKey}` },
          body: JSON.stringify({
            model: o.model,
            messages,
            temperature: 0,
            // The reply is a small JSON object — the busiest verse in the canon
            // has 14 markers. A server splits its context between concurrent
            // slots and reserves this much of one for the answer, so asking for
            // more room than the answer needs costs parallelism, not nothing.
            max_tokens: 512,
            stream: false,
            ...NO_THINK[attempt],
          }),
          signal: AbortSignal.timeout(o.timeout),
        });
      } catch (e) {
        lastError = new Error(`request failed: ${e.message}`);
        break;
      }
      if (res.status === 400 && attempt < NO_THINK.length - 1) {
        noThink = attempt + 1;
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
        break;
      }
      noThink = attempt;
      const msg = (await res.json()).choices?.[0]?.message ?? {};
      // A server that thought anyway may still have left the JSON in the summary.
      return msg.content || msg.reasoning_content || "";
    }
  }
  throw lastError ?? new Error("no accepted request shape");
}

/**
 * Resolve one verse's undecided positions. Returns the items with `w` set where
 * an answer verified, and the raw answer kept for the review file.
 */
export async function resolveVerse(o, text, items, call = ask) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildPrompt(text, items) },
  ];
  let reply = await call(o, messages);
  let result = applyAnswer(items, parseAnswer(reply));

  const bad = result.filter((r) => !r.w);
  if (bad.length) {
    // One retry, told exactly what was wrong — a small model usually fixes it.
    const detail = bad
      .map((r) => {
        const i = result.indexOf(r) + 1;
        return r.answer
          ? `第 ${i} 项「${r.answer}」不是候选「${r.candidate}」的开头`
          : `第 ${i} 项缺少答案，候选是「${r.candidate}」`;
      })
      .join("；");
    messages.push({ role: "assistant", content: reply });
    messages.push({
      role: "user",
      content: `${detail}。请重新输出完整 JSON，每个值都必须是对应候选片段的开头，不要改字。`,
    });
    reply = await call(o, messages);
    const retry = applyAnswer(items, parseAnswer(reply));
    result = result.map((r, i) => (r.w ? r : retry[i].w ? retry[i] : r));
  }

  // An unsure model keeps the whole candidate, which is how a note about "put"
  // ends up labelled 将那人安置在伊甸园. Those are worth one focused question:
  // the answer is only taken if it verifies and is genuinely shorter.
  const longIdx = result.map((r, i) => (r.w && [...r.w].length >= LONG_WORD ? i : -1)).filter((i) => i >= 0);
  if (longIdx.length) {
    const askAgain = longIdx.map((i) => items[i]);
    const said = longIdx.map((i, n) => `第 ${n + 1} 项上次答「${result[i].w}」`).join("；");
    const tighten = await call(o, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPrompt(text, askAgain) },
      {
        role: "user",
        content:
          `${said}，都太长了——注解解释的是一个词，不是整个短语（通常一到四个字）。` +
          `请只保留真正被注解的那个词，仍必须是对应候选片段的开头。`,
      },
    ]);
    const shorter = applyAnswer(askAgain, parseAnswer(tighten));
    longIdx.forEach((i, n) => {
      const s = shorter[n];
      if (s.w && [...s.w].length < [...result[i].w].length) result[i] = { ...result[i], w: s.w };
    });
  }
  return result;
}

/** Run `fn` over `jobs` with at most `n` in flight. */
async function pool(jobs, n, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, jobs.length)) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      await fn(jobs[i], i);
    }
  });
  await Promise.all(workers);
}

/**
 * The positions of one verse that still need a word, with their candidate and
 * the English hint for the same note. Positions already in `table` are skipped.
 */
export function verseJobs(apparatus, text, hints, { chapter, verse, table, force }) {
  const byPos = new Map();
  for (const mk of apparatus.m ?? []) {
    if (mk.p == null) continue;
    let e = byPos.get(mk.p);
    if (!e) byPos.set(mk.p, (e = { p: mk.p, labels: [], en: null }));
    e.labels.push(mk.l);
    if (!e.en) e.en = hints.get(`n:${mk.n}`) ?? hints.get(`x:${mk.x}`) ?? null;
  }
  const ps = [...byPos.keys()].sort((a, b) => a - b);
  const auto = [];
  const pending = [];
  const noCandidate = [];
  let skipped = 0;
  for (let i = 0; i < ps.length; i++) {
    const e = byPos.get(ps[i]);
    const key = `${chapter}:${verse}:${e.p}`;
    if (!force && table[key] != null) {
      skipped++;
      continue;
    }
    const candidate = candidateSpan(text, e.p, ps[i + 1] ?? null);
    const item = { p: e.p, candidate, en: e.en, l: e.labels.join(",") };
    if (!candidate) noCandidate.push(item);
    else if ([...candidate].length === 1) auto.push(item);
    else pending.push(item);
  }
  return { auto, pending, noCandidate, skipped };
}

/**
 * Grow any word that stops inside a name. The model is told to take the whole
 * word and mostly does, but "耶和" for 耶和华 is the kind of break a reader
 * notices immediately, and the corpus settles it without asking anyone: the
 * candidate for a key is recomputed from the verse text and the next marker
 * position, both of which the table itself already carries.
 *
 * @returns {{key: string, from: string, to: string}[]} the words that grew
 */
export function repairTable(table, textFor, corpus, { passes = 3 } = {}) {
  // Positions per verse, so a candidate can be bounded by the next marker.
  const byVerse = new Map();
  for (const key of Object.keys(table)) {
    const [c, v, p] = key.split(":").map(Number);
    const vk = `${c}:${v}`;
    if (!byVerse.has(vk)) byVerse.set(vk, []);
    byVerse.get(vk).push(p);
  }
  for (const ps of byVerse.values()) ps.sort((a, b) => a - b);

  const changed = new Map();
  for (let pass = 0; pass < passes; pass++) {
    const stats = countFollowers(corpus, new Set(Object.values(table)));
    let moved = 0;
    for (const [vk, ps] of byVerse) {
      const [c, v] = vk.split(":").map(Number);
      const text = textFor(c, v);
      if (!text) continue;
      for (let i = 0; i < ps.length; i++) {
        const key = `${vk}:${ps[i]}`;
        const word = table[key];
        if (!word) continue;
        const candidate = candidateSpan(text, ps[i], ps[i + 1] ?? null);
        const grown = stickyExtension(word, candidate, stats);
        if (grown === word) continue;
        if (!changed.has(key)) changed.set(key, word);
        table[key] = grown;
        moved++;
      }
    }
    if (!moved) break;
  }
  return [...changed].map(([key, from]) => ({ key, from, to: table[key] }));
}

/* -------------------------------------------------------------------- main */

export async function run(o, log = console.log) {
  const books = readJson(path.join(ROOT, "public/data/books.json"));
  const verses = readJson(path.join(ROOT, "public/data/verses.json"));
  const cnText = new Map();
  const corpus = [];
  for (const r of verses) {
    cnText.set(`${r[0]}:${r[1]}:${r[2]}`, r[4] ?? "");
    if (r[4]) corpus.push(r[4]);
  }

  const byIdx = new Map(books.map((b) => [b.idx, b]));
  const refOk = ([b, c, v, ve]) => {
    const meta = byIdx.get(b);
    if (!meta || c < 1 || c > meta.chapters.length) return false;
    const last = meta.chapters[c - 1];
    return v >= 0 && v <= last && (ve === 0 || (ve >= v && ve <= last));
  };

  const cacheDir = path.resolve(ROOT, o.cache);
  const outDir = path.resolve(ROOT, o.out);
  const studyDir = path.resolve(ROOT, o.study);

  // The English half is optional: without a password we simply have no hints.
  let key = null;
  if (o.password) {
    try {
      key = (await getStudyKey(studyDir, o.password)).key;
    } catch (e) {
      log(`! English hints unavailable: ${e.message}`);
    }
  }

  const wanted = books.filter((b) => {
    if (o.book) return b.idx === o.book;
    return fs.existsSync(path.join(cacheDir, String(b.idx), "book.json"));
  });
  if (!wanted.length) throw new Error(`no cached data for ${o.book ? `book ${o.book}` : "any book"}`);

  const totals = { auto: 0, model: 0, review: 0, skipped: 0, requests: 0, repaired: 0 };
  const review = [];
  let warnedEncrypted = false;
  const started = Date.now();

  for (const meta of wanted) {
    const file = path.join(outDir, `${meta.idx}.json`);
    const table = fs.existsSync(file) ? readJson(file) : {};

    for (let chapter = 1; chapter <= meta.chapters.length; chapter++) {
      if (o.chapter && chapter !== o.chapter) continue;
      const rawFile = path.join(cacheDir, String(meta.idx), `${chapter}.json`);
      if (!fs.existsSync(rawFile)) continue;

      const verseText = new Map();
      for (let v = 0; v <= meta.chapters[chapter - 1]; v++) {
        const t = cnText.get(`${meta.idx}:${chapter}:${v}`);
        if (t != null) verseText.set(v, t);
      }
      const { verses: built } = buildChapter(readJson(rawFile), verseText, {
        refOk,
        maxVerse: meta.chapters[chapter - 1],
      });

      // The English half of this chapter, when we can read it. A plaintext
      // build (`build-study-en.mjs --plain`) needs no password at all.
      let en = null;
      const sf = path.join(studyDir, String(meta.idx), `${chapter}.json`);
      if (fs.existsSync(sf)) {
        try {
          const raw = readJson(sf);
          const encrypted = typeof raw?.ct === "string";
          if (!encrypted) en = raw?.en?.verses ?? null;
          else if (key) en = (await decryptJson(raw, key))?.en?.verses ?? null;
          else if (!warnedEncrypted) {
            warnedEncrypted = true;
            log(`! ${path.relative(ROOT, studyDir)} is encrypted and no password was given — no English hints`);
          }
        } catch {
          en = null;
        }
      }

      const jobs = [];
      const stats = { auto: 0, model: 0, review: 0 };
      let touched = false;

      for (const [vk, ap] of Object.entries(built)) {
        const vn = Number(vk);
        const text = verseText.get(vn) ?? "";
        const { auto, pending, noCandidate, skipped } = verseJobs(ap, text, enHints(en?.[vk]), {
          chapter,
          verse: vn,
          table,
          force: o.force,
        });
        totals.skipped += skipped;
        for (const it of auto) {
          table[`${chapter}:${vn}:${it.p}`] = it.candidate;
          touched = true;
          stats.auto++;
        }
        for (const it of noCandidate) {
          const key = `${chapter}:${vn}:${it.p}`;
          review.push({
            key: `${meta.idx}:${key}`,
            text,
            ...it,
            current: table[key] ?? null,
            reason: "no candidate",
          });
          stats.review++;
        }
        if (pending.length) jobs.push({ vn, text, items: pending });
      }

      if (jobs.length && !o.dryRun) {
        if (!o.model) throw new Error("no --model given (set LEMMA_MODEL or pass --model)");
        await pool(jobs, o.concurrency, async (job) => {
          totals.requests++;
          let res;
          try {
            res = await resolveVerse(o, job.text, job.items);
          } catch (e) {
            res = job.items.map((it) => ({ ...it, w: null, answer: null, error: e.message }));
          }
          for (const r of res) {
            const item = job.items.find((it) => it.p === r.p);
            if (r.w) {
              table[`${chapter}:${job.vn}:${r.p}`] = r.w;
              touched = true;
              stats.model++;
            } else {
              // A failed re-ask never throws away a word an earlier run got
              // right, so record which of these leave a marker actually bare.
              const key = `${chapter}:${job.vn}:${r.p}`;
              review.push({
                key: `${meta.idx}:${key}`,
                text: job.text,
                p: r.p,
                l: item?.l ?? null,
                candidate: r.candidate,
                en: item?.en ?? null,
                answer: r.answer ?? null,
                current: table[key] ?? null,
                reason: r.error ? `request failed: ${r.error}` : "answer did not verify",
              });
              stats.review++;
            }
          }
        });
      } else if (jobs.length) {
        for (const job of jobs) stats.review += job.items.length;
      }

      totals.auto += stats.auto;
      totals.model += stats.model;
      totals.review += stats.review;
      if (touched) writeTable(file, table);
      log(
        `  ${meta.idx}/${chapter}: ${stats.auto} auto, ${stats.model} model, ` +
          `${stats.review} review${en ? "" : " (no en hints)"}`,
      );
    }

    const grown = repairTable(table, (c, v) => cnText.get(`${meta.idx}:${c}:${v}`), corpus);
    if (grown.length) {
      writeTable(file, table);
      totals.repaired += grown.length;
      const shown = grown.slice(0, 5).map((g) => `${g.from}→${g.to}`).join(", ");
      log(`  book ${meta.idx}: grew ${grown.length} word(s) out of a name — ${shown}${grown.length > 5 ? ", …" : ""}`);
    }
  }

  totals.bare = review.filter((r) => r.current == null).length;
  const reviewFile = path.join(outDir, "review.json");
  if (review.length) {
    fs.mkdirSync(outDir, { recursive: true });
    // Bare markers first: those are the ones left with no word at all.
    review.sort((a, b) => (a.current == null ? 0 : 1) - (b.current == null ? 0 : 1));
    fs.writeFileSync(reviewFile, JSON.stringify(review, null, 2) + "\n");
  } else if (fs.existsSync(reviewFile)) {
    // Never leave the last run's queue behind to be read as this run's.
    fs.rmSync(reviewFile);
  }
  totals.seconds = Math.round((Date.now() - started) / 1000);
  return { totals, review, outDir };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.all && !o.book) {
    console.error("usage: node scripts/lemma-cn.mjs [--book N | --all] [--chapter N] [--model …]");
    process.exit(2);
  }
  const { totals, review, outDir } = await run(o);
  const decided = totals.auto + totals.model;
  const seen = decided + totals.review;
  const pct = seen ? ((decided / seen) * 100).toFixed(1) : "0";
  console.log(
    `\n${decided} word(s) resolved (${totals.auto} by position, ${totals.model} by model), ` +
      `${totals.review} for review (${totals.bare} with no word at all), ` +
      `${totals.skipped} already on disk — ${pct}% automatic\n` +
      `${totals.repaired} word(s) grown out of a name\n` +
      `${totals.requests} request(s) in ${totals.seconds}s → ${path.relative(ROOT, outDir)}`,
  );
  if (review.length) console.log(`review: ${path.relative(ROOT, outDir)}/review.json`);
}

if (process.argv[1]?.endsWith("lemma-cn.mjs")) await main();
