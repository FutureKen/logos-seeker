/**
 * Simplified-Chinese scripture reference helpers.
 *
 * `parseCnRefList` is a small recursive-descent scanner over the reference
 * grammar the Recovery Version uses in cross-reference lists (`beaded_content`)
 * and in the linked spans inside footnotes / book intros:
 *
 *     list  := item (('，' | '、' | '；') item)*
 *     item  := '参'? book? chapter? verse? range? noteTail?
 *     book  := one of the 66 Simplified abbreviations (longest match first)
 *     chapter := Chinese numerals ('一', '四五' = 45, '一○四' = 104) ('章' | '篇')?
 *     verse := digits ('节')? ('上' | '下' | '中')?
 *     range := ('～' | '~' | '—' | '-') chapter? verse?
 *     noteTail := '与'? '注' digits
 *
 * `，` continues the current book *and* chapter (`约一1，2`), `；` resets both
 * to the caller's context, and single-chapter books (俄 门 约贰 约叁 犹) take a
 * bare verse. Anything the scanner cannot read is returned as a `{t}`-only item
 * so the builders can count and report unparsed text.
 */

const DIGITS = { 〇: 0, "○": 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export const CN_NUM_CHARS = "〇○零一二三四五六七八九十";

/**
 * Chinese numeral → number, using the Recovery Version's chapter conventions:
 * `十` behaves positionally (`十`=10, `十九`=19, `二十`=20, `五十`=50) while
 * everything else is read digit-wise (`四五`=45, `一○四`=104, `一二○`=120).
 */
export function cnNum(s) {
  const t = String(s ?? "").trim();
  if (!t) return NaN;
  const ten = t.indexOf("十");
  if (ten >= 0 && t.length <= 3) {
    const head = t.slice(0, ten);
    const tail = t.slice(ten + 1);
    const h = head === "" ? 1 : DIGITS[head];
    const l = tail === "" ? 0 : DIGITS[tail];
    if (h != null && l != null) return h * 10 + l;
  }
  let n = 0;
  for (const c of t) {
    const d = DIGITS[c];
    if (d == null) return NaN;
    n = n * 10 + d;
  }
  return n;
}

/** Canonical order, index = books.json `idx`. */
const ABBR_IN_ORDER = [
  "创", "出", "利", "民", "申", "书", "士", "得", "撒上", "撒下", "王上", "王下",
  "代上", "代下", "拉", "尼", "斯", "伯", "诗", "箴", "传", "歌", "赛", "耶",
  "哀", "结", "但", "何", "珥", "摩", "俄", "拿", "弥", "鸿", "哈", "番", "该",
  "亚", "玛", "太", "可", "路", "约", "徒", "罗", "林前", "林后", "加", "弗",
  "腓", "西", "帖前", "帖后", "提前", "提后", "多", "门", "来", "雅", "彼前",
  "彼后", "约壹", "约贰", "约叁", "犹", "启",
];

/**
 * `[abbr, bookIdx]` pairs sorted longest-abbreviation-first, so a greedy
 * scanner matches `林后` before `林`… and `约壹` before `约`.
 * @type {[string, number][]}
 */
export const CN_BOOK_ABBR = ABBR_IN_ORDER.map((a, i) => [a, i + 1]).sort(
  (x, y) => y[0].length - x[0].length || x[1] - y[1],
);

/**
 * A handful of notes slipped through with Traditional characters even in the
 * `VERSION=2` (Simplified) feed (`彼後一3`, `約參7`). These aliases keep the
 * scanner from stalling on them; `約參` must win over the `參` = "cf." marker,
 * which is why book matching runs before the cf check.
 */
const TRAD_CHARS = {
  創: "创", 書: "书", 詩: "诗", 傳: "传", 賽: "赛", 結: "结", 彌: "弥",
  鴻: "鸿", 該: "该", 亞: "亚", 瑪: "玛", 約: "约", 羅: "罗", 後: "后",
  門: "门", 來: "来", 貳: "贰", 參: "叁", 猶: "犹", 啟: "启", 歷: "历",
};

/** @type {[string, number][]} Simplified table plus the Traditional aliases. */
const ABBR_TABLE = (() => {
  const seen = new Map(CN_BOOK_ABBR);
  for (const [abbr, idx] of CN_BOOK_ABBR) {
    const trad = [...abbr].map((c) => Object.keys(TRAD_CHARS).find((t) => TRAD_CHARS[t] === c) ?? c);
    const alt = trad.join("");
    if (alt !== abbr && !seen.has(alt)) seen.set(alt, idx);
  }
  // 3 John is written 约参 as often as 约叁 in the feed.
  for (const [alt, idx] of [["约参", 64], ["約参", 64]]) if (!seen.has(alt)) seen.set(alt, idx);
  return [...seen].sort((x, y) => y[0].length - x[0].length || x[1] - y[1]);
})();

/** Every abbreviation, for stripping book names out of an outline range. */
const ABBR_RE = new RegExp(ABBR_TABLE.map(([a]) => a).join("|"), "g");

/** `１２３` → `123`; a few outline ranges use full-width digits. */
const widen = (s) => String(s ?? "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** Books whose references omit the chapter (Obadiah, Philemon, 2–3 John, Jude). */
export const CN_SINGLE_CHAPTER = new Set([31, 57, 63, 64, 65]);

function matchBook(s, i) {
  for (const [abbr, idx] of ABBR_TABLE) {
    if (s.startsWith(abbr, i)) return { idx, len: abbr.length };
  }
  return null;
}

const NUM_RE = new RegExp(`^[${CN_NUM_CHARS}]+`);
/** `12`, `12上`, `12节下`, `12末` — the part mark may sit on either side of 节. */
const VERSE_RE = /^(\d+)\s*(?:[节節篇]\s*)?([上下中末])?/;
const DASH_RE = /[～~—－–‐-]/;

/** Punctuation and connectives that separate references but carry no meaning. */
const SEPARATORS = "，、,；;　 \t\r\n（）()〔〕[]「」《》。．·:：与及和或即與至等以并並";
/**
 * Tails that follow a reference without being part of it: `三段` / `末段`
 * (paragraph N of the note), `标题` (a psalm superscription), `本章` (which
 * just means the chapter already in scope) and a bare `注` with no number
 * (`赛十四12～15与注`).
 */
const TAIL_RE = new RegExp(`^(?:[${CN_NUM_CHARS}]+段|末段|标题|標題|本章|本篇|注(?![0-9])|註(?![0-9]))`);

/**
 * Try to read one reference starting at `i`.
 * @returns {{len:number, book:number|null, chapter:number|null, r:number[]}|null}
 */
function readRef(s, i, state) {
  let j = i;
  let book = state.book;
  let chapter = state.chapter;

  const b = matchBook(s, j);
  if (b) {
    book = b.idx;
    chapter = null;
    j += b.len;
  }

  let sawChapter = false;
  const cn = NUM_RE.exec(s.slice(j));
  if (cn) {
    const n = cnNum(cn[0]);
    if (!Number.isFinite(n) || n < 1) return null;
    chapter = n;
    sawChapter = true;
    j += cn[0].length;
    if (s[j] === "章" || s[j] === "篇") j++;
  }

  let verse = null;
  const v = VERSE_RE.exec(s.slice(j));
  if (v) {
    verse = Number(v[1]);
    j += v[0].length;
  }

  let end = 0;
  let crossChapter = false;
  if (j < s.length && DASH_RE.test(s[j])) {
    let k = j + 1;
    let endChapter = null;
    const ecn = NUM_RE.exec(s.slice(k));
    if (ecn) {
      const n = cnNum(ecn[0]);
      if (Number.isFinite(n) && n >= 1) {
        endChapter = n;
        k += ecn[0].length;
        if (s[k] === "章" || s[k] === "篇") k++;
      }
    }
    const ev = VERSE_RE.exec(s.slice(k));
    if (ev) k += ev[0].length;
    if (endChapter != null || ev) {
      if (endChapter != null) crossChapter = true;
      else end = Number(ev[1]);
      j = k;
    }
  }

  if (verse == null) {
    // A chapter with no verse is a whole-chapter reference (`创一～二`, and the
    // bare `三七` inside `二八1～三五10，三七，三九～四九`). Numerals that are not
    // chapters at all (`三段`, `末段`) never reach here — the caller strips
    // those tails first.
    if (!sawChapter || book == null) return null;
    return { len: j - i, book, chapter, r: [book, chapter, 0, 0] };
  }

  if (chapter == null) {
    if (book != null && CN_SINGLE_CHAPTER.has(book)) chapter = 1;
    else {
      // A bare number with no chapter in scope is a whole-chapter reference.
      chapter = verse;
      verse = 0;
      end = 0;
    }
  }
  if (book == null) return null;
  return { len: j - i, book, chapter, r: [book, chapter, verse, crossChapter ? 0 : end] };
}

/**
 * Parse a Chinese reference list such as `赛四五7，林后四6，参约一4，5`.
 *
 * @param {string} text
 * @param {{book?: number, chapter?: number, cf?: boolean}} [ctx] defaults for
 *   references that omit the book/chapter (the containing verse).
 * @returns {{r?: [number, number, number, number], t: string, cf?: boolean, note?: number}[]}
 *   `r` present = a scripture reference; `note` present = a reference to note
 *   `note` on `r` (`罗一20与注1`); neither = unparsed text.
 */
export function parseCnRefList(text, ctx = {}) {
  const s = String(text ?? "");
  const out = [];
  let book = ctx.book ?? null;
  let chapter = ctx.chapter ?? null;
  let cf = ctx.cf ?? false;
  let last = null;
  let junk = -1;
  let i = 0;

  const flush = (end) => {
    if (junk < 0) return;
    const t = s.slice(junk, end).trim();
    if (t) out.push({ t });
    junk = -1;
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === "；" || ch === ";") {
      flush(i);
      cf = ctx.cf ?? false;
      book = ctx.book ?? null;
      chapter = ctx.chapter ?? null;
      last = null;
      i++;
      continue;
    }
    if (ch === "见" || ch === "見" || ch === "另" || SEPARATORS.includes(ch)) {
      flush(i);
      i++;
      continue;
    }

    // `与注1` / `注2` — a pointer at another note on the last reference.
    const nt = /^[注註]\s*(\d+)/.exec(s.slice(i));
    if (nt) {
      flush(i);
      if (last?.r) {
        out.push({
          r: [last.r[0], last.r[1], last.r[2], 0],
          t: nt[0],
          cf,
          note: Number(nt[1]),
        });
      }
      i += nt[0].length;
      continue;
    }
    const tail = TAIL_RE.exec(s.slice(i));
    if (tail) {
      flush(i);
      i += tail[0].length;
      continue;
    }

    const ref = readRef(s, i, { book, chapter });
    if (ref) {
      flush(i);
      book = ref.book;
      chapter = ref.chapter;
      const item = { r: ref.r, t: s.slice(i, i + ref.len), cf };
      out.push(item);
      last = item;
      i += ref.len;
      continue;
    }

    // After book matching, so `約參7` reads as 3 John rather than "cf. John".
    if (ch === "参" || ch === "參") {
      flush(i);
      cf = true;
      i++;
      continue;
    }

    if (junk < 0) junk = i;
    i++;
  }
  flush(s.length);
  return out;
}

/**
 * Parse the range tail of an outline label: `一1～二25`, `一2下～5`, `一2上`,
 * `一～二`, and the chapter-less form the deeper levels use (`24～25`, `26`),
 * where the chapter comes from the entry's `related_chapters`.
 *
 * @returns {{start: [number|null, number, number], end: [number|null, number, number]}|null}
 *   `Loc = [chapter, verse, part]` (part 0 whole, 1 上, 2 下); a null chapter
 *   means "the one the caller already knows".
 */
export function parseCnRange(text) {
  const s = widen(String(text ?? "").trim());
  if (!s) return null;
  const part = (c) => (c === "上" ? 1 : c === "下" ? 2 : 0);

  /** One `[book] [chapter] [verse][上下]` endpoint. */
  const point = (str, i) => {
    let j = i;
    let bookIdx = null;
    const b = matchBook(str, j);
    if (b) {
      bookIdx = b.idx;
      j += b.len;
    }
    const cn = NUM_RE.exec(str.slice(j));
    let chapter = null;
    if (cn) {
      const n = cnNum(cn[0]);
      if (!Number.isFinite(n)) return null;
      chapter = n;
      j += cn[0].length;
    }
    const v = /^\s*(\d+)\s*([上下])?/.exec(str.slice(j));
    let verse = 0;
    let p = 0;
    if (v) {
      verse = Number(v[1]);
      p = part(v[2]);
      j += v[0].length;
    }
    if (chapter == null && !v) return null;
    return { len: j - i, book: bookIdx, loc: [chapter, verse, p] };
  };

  // `二五19～21，27～28，二六1～二七4` — start of the first span, end of the last.
  let first = null;
  let last = null;
  let endBook = null;
  for (const span of s.split(/[，,、]/)) {
    const t = span.trim();
    if (!t) continue;
    const a = point(t, 0);
    if (!a) return first ? { start: first.loc, end: last.loc, endBook } : null;
    if (!first) first = a;
    let end = a;
    let rest = t.slice(a.len).trim();
    if (rest && DASH_RE.test(rest[0])) {
      const b = point(rest.slice(1).trim(), 0);
      if (b) {
        end = { ...b, loc: [b.loc[0] ?? a.loc[0], b.loc[1], b.loc[2]] };
      }
    }
    last = end;
    endBook = end.book ?? endBook;
  }
  if (!first) return null;
  return { start: first.loc, end: last.loc, startBook: first.book ?? null, endBook };
}

/**
 * Split an `outline_content` value (`壹　神的创造　一1～二25`) into its label,
 * title and range. Segments are separated by the ideographic space; the range
 * is the last segment when it parses as one and a title still remains.
 * Continuation headings are wrapped in full-width parentheses
 * (`（二　以撒的经历─续）`) and carry neither label nor range.
 */
export function parseOutlineContent(content) {
  const raw = String(content ?? "").trim();
  if (raw.startsWith("（") && raw.endsWith("）")) return { label: "", title: raw, range: null };

  const body = raw
    .split(/[　\t]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!body.length) return { label: "", title: "", range: null };

  let range = null;
  if (body.length > 1) {
    const candidate = body[body.length - 1];
    // A range segment is numerals, digits, 上/下, dashes and separators only —
    // optionally prefixed by a book abbreviation (`王上一1～二11`).
    const bare = candidate.replace(ABBR_RE, "");
    if (/^[〇○零一二三四五六七八九十０-９\d][〇○零一二三四五六七八九十０-９\d\s上下～~—－–，,、-]*$/.test(bare)) {
      const parsed = parseCnRange(candidate);
      if (parsed) {
        range = parsed;
        body.pop();
      }
    }
  }
  const label = body.length > 1 ? body.shift() : "";
  return { label, title: body.join("　"), range };
}
