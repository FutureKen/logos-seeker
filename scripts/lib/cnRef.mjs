/**
 * Simplified-Chinese scripture reference helpers.
 *
 * `parseCnRefList` here is deliberately a **stub** that covers the common
 * grammar only (`参? 书? 章 节 (上|下)? (～ 节)?`, `，` continues the chapter,
 * `；` resets). Subtask B hardens it against the full corpus.
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

/** Books whose references omit the chapter (Obadiah, Philemon, 2–3 John, Jude). */
export const CN_SINGLE_CHAPTER = new Set([31, 57, 63, 64, 65]);

function matchBook(s, i) {
  for (const [abbr, idx] of CN_BOOK_ABBR) {
    if (s.startsWith(abbr, i)) return { idx, len: abbr.length };
  }
  return null;
}

/**
 * Parse a Chinese reference list such as `赛四五7，林后四6，参约一4，5`.
 *
 * @param {string} text
 * @param {{book?: number, chapter?: number, cf?: boolean}} [ctx] defaults for
 *   references that omit the book/chapter (the containing verse).
 * @returns {{r: [number|null, number, number, number], t: string, cf?: boolean}[]}
 */
export function parseCnRefList(text, ctx = {}) {
  const s = String(text ?? "");
  const out = [];
  let book = ctx.book ?? null;
  let chapter = ctx.chapter ?? null;
  let cf = ctx.cf ?? false;
  let anchor = null;
  let i = 0;

  const numRe = new RegExp(`^[${CN_NUM_CHARS}]+`);
  const verseRe = /^(\d+)([上下])?(?:\s*[～~—－-]\s*(\d+)([上下])?)?/;

  while (i < s.length) {
    const ch = s[i];

    if (ch === "参") {
      cf = true;
      i++;
      continue;
    }
    if (ch === "；" || ch === ";") {
      cf = false;
      book = ctx.book ?? null;
      chapter = ctx.chapter ?? null;
      anchor = null;
      i++;
      continue;
    }
    if (ch === "，" || ch === "、" || ch === "," || /\s/.test(ch)) {
      // `，` continues the current book + chapter.
      i++;
      continue;
    }

    const b = matchBook(s, i);
    if (b) {
      if (anchor == null) anchor = i;
      book = b.idx;
      chapter = null;
      i += b.len;
      continue;
    }

    const cn = numRe.exec(s.slice(i));
    if (cn) {
      if (anchor == null) anchor = i;
      chapter = cnNum(cn[0]);
      i += cn[0].length;
      continue;
    }

    const v = verseRe.exec(s.slice(i));
    if (v) {
      if (anchor == null) anchor = i;
      let c = chapter;
      let verse = Number(v[1]);
      let end = v[3] ? Number(v[3]) : 0;
      if (c == null) {
        if (book != null && CN_SINGLE_CHAPTER.has(book)) {
          c = 1;
        } else {
          // A bare number with no chapter is a whole-chapter reference.
          c = verse;
          verse = 0;
          end = 0;
        }
      }
      i += v[0].length;
      out.push({ r: [book, c, verse, end], t: s.slice(anchor, i), cf });
      anchor = null;
      continue;
    }

    i++; // unknown punctuation / prose
  }
  return out;
}
