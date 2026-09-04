/**
 * The study-data contract, codified. `validateBookFile` / `validateChapterFile`
 * take a **decrypted** file object and return `{errors, warnings}`; messages
 * carry a dotted path (`en.verses.1.m[0].p`) so a failure points at one field.
 *
 * A whole language half may be missing while the EN and CN pipelines are run
 * separately — that is a warning, not an error.
 */

const LANGS = ["en", "cn"];

class Ctx {
  constructor(books, verses) {
    this.errors = [];
    this.warnings = [];
    this.books = indexBooks(books);
    this.verseText = verses ? verseIndex(verses) : null;
  }
  err(path, msg) {
    this.errors.push(`${path}: ${msg}`);
  }
  warn(path, msg) {
    this.warnings.push(`${path}: ${msg}`);
  }
  done() {
    return { errors: this.errors, warnings: this.warnings };
  }
}

function indexBooks(books) {
  const m = new Map();
  for (const b of books ?? []) m.set(b.idx, b);
  return m;
}

const verseCache = new WeakMap();
function verseIndex(verses) {
  let m = verseCache.get(verses);
  if (m) return m;
  m = new Map();
  for (const r of verses) m.set(`${r[0]}:${r[1]}:${r[2]}`, { en: r[3] ?? "", cn: r[4] ?? "" });
  verseCache.set(verses, m);
  return m;
}

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

/* ------------------------------------------------------------------ refs */

/** `Ref = [bookIdx, chapter, verse, verseEnd]`; verse 0 = whole chapter. */
function checkRef(ctx, path, ref) {
  if (!Array.isArray(ref) || ref.length !== 4 || !ref.every(isInt)) {
    ctx.err(path, `Ref must be 4 integers, got ${JSON.stringify(ref)}`);
    return;
  }
  const [b, c, v, ve] = ref;
  const book = ctx.books.get(b);
  if (!book) {
    ctx.err(path, `book ${b} is not 1..66`);
    return;
  }
  if (c < 1 || c > book.chapters.length) {
    ctx.err(path, `chapter ${c} out of range for ${book.en} (1..${book.chapters.length})`);
    return;
  }
  const last = book.chapters[c - 1];
  if (v < 0 || v > last) ctx.err(path, `verse ${v} out of range for ${book.en} ${c} (0..${last})`);
  if (ve !== 0) {
    if (ve < v) ctx.err(path, `verseEnd ${ve} is before verse ${v}`);
    else if (ve > last) ctx.err(path, `verseEnd ${ve} out of range for ${book.en} ${c} (max ${last})`);
  }
}

/** `Loc = [chapter, verse, part]`; part 0 whole, 1 first half, 2 second half. */
function checkLoc(ctx, path, loc, book) {
  if (!Array.isArray(loc) || loc.length !== 3 || !loc.every(isInt)) {
    ctx.err(path, `Loc must be 3 integers, got ${JSON.stringify(loc)}`);
    return false;
  }
  const [c, v, part] = loc;
  const meta = ctx.books.get(book);
  if (meta) {
    if (c < 1 || c > meta.chapters.length) {
      ctx.err(path, `chapter ${c} out of range (1..${meta.chapters.length})`);
      return false;
    }
    if (v < 0 || v > meta.chapters[c - 1]) {
      ctx.err(path, `verse ${v} out of range for chapter ${c} (0..${meta.chapters[c - 1]})`);
      return false;
    }
  }
  if (part !== 0 && part !== 1 && part !== 2) ctx.err(path, `part must be 0, 1 or 2 (got ${part})`);
  return true;
}

const locCmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/* ----------------------------------------------------------------- Rich */

function checkRich(ctx, path, rich, { required = false } = {}) {
  if (rich == null) {
    if (required) ctx.err(path, "missing Rich value");
    return;
  }
  if (!Array.isArray(rich)) {
    ctx.err(path, "Rich must be an array of paragraphs");
    return;
  }
  rich.forEach((para, pi) => {
    const pp = `${path}[${pi}]`;
    if (!Array.isArray(para)) {
      ctx.err(pp, "paragraph must be an array of runs");
      return;
    }
    para.forEach((run, ri) => {
      const rp = `${pp}[${ri}]`;
      if (typeof run === "string") return;
      if (!isObj(run)) {
        ctx.err(rp, "run must be a string or an object");
        return;
      }
      if ("i" in run) {
        if (typeof run.i !== "string") ctx.err(rp, "italic run `i` must be a string");
      } else if ("ref" in run) {
        checkRef(ctx, `${rp}.ref`, run.ref);
        if (typeof run.t !== "string" || !run.t) ctx.err(rp, "ref run needs a non-empty `t`");
      } else if ("note" in run) {
        if (!Array.isArray(run.note) || run.note.length !== 4 || !run.note.every(isInt)) {
          ctx.err(`${rp}.note`, "note run must be [book, chapter, verse, num]");
        } else {
          checkRef(ctx, `${rp}.note`, [run.note[0], run.note[1], run.note[2], 0]);
        }
        if (typeof run.t !== "string" || !run.t) ctx.err(rp, "note run needs a non-empty `t`");
      } else if ("sup" in run) {
        if (typeof run.sup !== "string") ctx.err(rp, "sup run must be a string");
      } else {
        ctx.err(rp, `unknown run shape ${JSON.stringify(Object.keys(run))}`);
      }
    });
  });
}

/* ------------------------------------------------------------ book.json */

/**
 * @param {object} obj decrypted `{book}/book.json`
 * @param {{books: object[]}} deps
 */
export function validateBookFile(obj, { books } = {}) {
  const ctx = new Ctx(books);
  if (!isObj(obj)) {
    ctx.err("$", "file must be an object");
    return ctx.done();
  }
  if (!isInt(obj.book) || !ctx.books.has(obj.book)) ctx.err("book", `unknown book ${obj.book}`);
  const bookIdx = obj.book;

  let present = 0;
  for (const lang of LANGS) {
    const half = obj[lang];
    if (half == null) {
      ctx.warn(lang, "language half is absent (pipeline not run yet?)");
      continue;
    }
    present++;
    if (!isObj(half)) {
      ctx.err(lang, "language half must be an object");
      continue;
    }
    if (half.info != null) {
      if (!isObj(half.info)) ctx.err(`${lang}.info`, "info must be an object or null");
      else {
        for (const f of ["author", "written", "place", "period", "subject"]) {
          if (half.info[f] == null) ctx.warn(`${lang}.info.${f}`, "field missing");
          else checkRich(ctx, `${lang}.info.${f}`, half.info[f]);
        }
      }
    }
    const outline = half.outline;
    if (outline == null) {
      ctx.warn(`${lang}.outline`, "outline missing");
      continue;
    }
    if (!Array.isArray(outline)) {
      ctx.err(`${lang}.outline`, "outline must be an array");
      continue;
    }
    outline.forEach((e, i) => {
      const p = `${lang}.outline[${i}]`;
      if (!isObj(e)) {
        ctx.err(p, "outline entry must be an object");
        return;
      }
      if (!isInt(e.level) || e.level < 1 || e.level > 6) ctx.err(`${p}.level`, `level must be 1..6 (got ${e.level})`);
      if (typeof e.title !== "string" || !e.title) ctx.err(`${p}.title`, "title must be a non-empty string");
      if (e.label != null && typeof e.label !== "string") ctx.err(`${p}.label`, "label must be a string");
      const okStart = checkLoc(ctx, `${p}.start`, e.start, bookIdx);
      const okEnd = checkLoc(ctx, `${p}.end`, e.end, bookIdx);
      if (okStart && okEnd && locCmp(e.start, e.end) > 0) {
        ctx.err(p, `start ${JSON.stringify(e.start)} is after end ${JSON.stringify(e.end)}`);
      }
      if (e.pos != null) {
        if (!isInt(e.pos) || e.pos < 0) ctx.err(`${p}.pos`, "pos must be a non-negative integer or null");
        else if (okStart && e.start[2] !== 2) ctx.warn(`${p}.pos`, "pos is only meaningful when start.part === 2");
      }
    });
  }
  if (!present) ctx.err("$", "neither `en` nor `cn` half is present");
  return ctx.done();
}

/* --------------------------------------------------------- {chapter}.json */

/**
 * @param {object} obj decrypted `{book}/{chapter}.json`
 * @param {{books: object[], verses: any[][]}} deps
 */
export function validateChapterFile(obj, { books, verses } = {}) {
  const ctx = new Ctx(books, verses);
  if (!isObj(obj)) {
    ctx.err("$", "file must be an object");
    return ctx.done();
  }
  const book = ctx.books.get(obj.book);
  if (!book) ctx.err("book", `unknown book ${obj.book}`);
  const nVerses = book && isInt(obj.chapter) ? book.chapters[obj.chapter - 1] : null;
  if (book && (!isInt(obj.chapter) || obj.chapter < 1 || obj.chapter > book.chapters.length)) {
    ctx.err("chapter", `chapter ${obj.chapter} out of range for ${book.en}`);
  }

  let present = 0;
  for (const lang of LANGS) {
    const half = obj[lang];
    if (half == null) {
      ctx.warn(lang, "language half is absent (pipeline not run yet?)");
      continue;
    }
    present++;
    if (!isObj(half) || !isObj(half.verses)) {
      ctx.err(`${lang}.verses`, "language half must be `{verses: {…}}`");
      continue;
    }
    for (const [vk, v] of Object.entries(half.verses)) {
      const p = `${lang}.verses.${vk}`;
      const vn = Number(vk);
      if (!isInt(vn) || vn < 0) {
        ctx.err(p, "verse key must be an integer");
        continue;
      }
      if (nVerses != null && vn > nVerses) ctx.err(p, `verse ${vn} beyond chapter length ${nVerses}`);
      if (!isObj(v)) {
        ctx.err(p, "verse entry must be an object");
        continue;
      }
      const text = ctx.verseText?.get(`${obj.book}:${obj.chapter}:${vn}`)?.[lang];
      checkVerse(ctx, p, v, text, lang);
    }
  }
  if (!present) ctx.err("$", "neither `en` nor `cn` half is present");
  return ctx.done();
}

function checkVerse(ctx, path, v, text, lang) {
  const notes = isObj(v.n) ? v.n : v.n == null ? {} : null;
  const xrefs = isObj(v.x) ? v.x : v.x == null ? {} : null;
  if (notes === null) ctx.err(`${path}.n`, "`n` must be an object");
  if (xrefs === null) ctx.err(`${path}.x`, "`x` must be an object");

  for (const [k, rich] of Object.entries(notes ?? {})) {
    checkRich(ctx, `${path}.n.${k}`, rich, { required: true });
  }
  for (const [k, list] of Object.entries(xrefs ?? {})) {
    const xp = `${path}.x.${k}`;
    if (!Array.isArray(list) || !list.length) {
      ctx.err(xp, "cross-reference group must be a non-empty array");
      continue;
    }
    list.forEach((item, i) => {
      if (!isObj(item)) {
        ctx.err(`${xp}[${i}]`, "cross-reference must be an object");
        return;
      }
      checkRef(ctx, `${xp}[${i}].r`, item.r);
      if (typeof item.t !== "string" || !item.t) ctx.err(`${xp}[${i}].t`, "needs a non-empty display text");
      if (item.cf != null && typeof item.cf !== "boolean") ctx.err(`${xp}[${i}].cf`, "cf must be a boolean");
    });
  }

  const m = v.m;
  if (m == null) {
    if (Object.keys(notes ?? {}).length || Object.keys(xrefs ?? {}).length) {
      ctx.err(`${path}.m`, "verse has notes/xrefs but no markers");
    }
    return;
  }
  if (!Array.isArray(m)) {
    ctx.err(`${path}.m`, "`m` must be an array");
    return;
  }

  const byLabel = new Map();
  let lastPos = -Infinity;
  let sawNull = false;
  m.forEach((mk, i) => {
    const mp = `${path}.m[${i}]`;
    if (!isObj(mk)) {
      ctx.err(mp, "marker must be an object");
      return;
    }
    if (typeof mk.l !== "string" || !mk.l) ctx.err(`${mp}.l`, "label must be a non-empty string");

    if (mk.p == null) {
      sawNull = true;
    } else if (!isInt(mk.p) || mk.p < 0) {
      ctx.err(`${mp}.p`, `position must be a non-negative integer or null (got ${JSON.stringify(mk.p)})`);
    } else {
      if (sawNull) ctx.err(`${mp}.p`, "markers with a position must come before null positions");
      if (mk.p < lastPos) ctx.err(`${mp}.p`, `markers must be sorted by position (${mk.p} after ${lastPos})`);
      lastPos = mk.p;
      if (text == null) {
        ctx.warn(`${mp}.p`, "no verses.json text available to bound-check the position");
      } else if (mk.p > text.length) {
        ctx.err(`${mp}.p`, `position ${mk.p} is past the end of the verse text (length ${text.length})`);
      }
    }

    if (mk.n != null) {
      const key = String(mk.n);
      if (!(notes && key in notes)) ctx.err(`${mp}.n`, `no note "${key}" in \`n\``);
    }
    if (mk.x != null) {
      const key = String(mk.x);
      if (!(xrefs && key in xrefs)) ctx.err(`${mp}.x`, `no cross-reference "${key}" in \`x\``);
    }
    if (mk.n == null && mk.x == null) ctx.err(mp, "marker has neither `n` nor `x`");
    if (mk.w != null) {
      if (typeof mk.w !== "string") ctx.err(`${mp}.w`, "anchor word must be a string");
      else if (lang === "cn") ctx.warn(`${mp}.w`, "`w` is English-only; Chinese slices at `p` instead");
    }

    // Labels are unique per verse, except for repeat markers — a second
    // occurrence of the same note with no cross-reference of its own.
    const prev = byLabel.get(mk.l);
    if (prev) {
      const repeat = String(prev.n) === String(mk.n) && String(prev.x) === String(mk.x);
      if (!repeat) ctx.err(`${mp}.l`, `duplicate label "${mk.l}" for a different note/xref`);
    } else {
      byLabel.set(mk.l, mk);
    }
  });

  for (const key of Object.keys(notes ?? {})) {
    if (!m.some((mk) => String(mk?.n) === key)) ctx.warn(`${path}.n.${key}`, "note is never referenced by a marker");
  }
  for (const key of Object.keys(xrefs ?? {})) {
    if (!m.some((mk) => String(mk?.x) === key)) {
      ctx.warn(`${path}.x.${key}`, "cross-reference is never referenced by a marker");
    }
  }
}
