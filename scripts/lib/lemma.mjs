/**
 * Anchor words ("词组") for the Chinese apparatus.
 *
 * The Chinese site records only where a marker sits (`note_loc` / `loc`), never
 * which words it is about, so a marker's word has to be recovered. Position
 * alone gets us a *candidate*: the run of text from the marker up to the next
 * marker or the next punctuation mark. The word is always a prefix of that
 * candidate — the only open question is where it ends, which is what the model
 * in `scripts/lemma-cn.mjs` answers.
 *
 * Everything here is pure so the rules can be tested without a model, and so
 * every answer a model gives can be checked before it is written to disk.
 */

/** Characters a Chinese anchor word can never span or end on. */
export const STOP = /[，。；：？！、·…—－‧“”‘’＂'"（）()《》〈〉「」『』〔〕【】\s]/u;

/**
 * The text a marker at `p` could be about: from `p` up to the next marker or
 * the first punctuation, whichever comes first. `""` when the marker sits on
 * punctuation or past the end — those go to review rather than guessing.
 */
export function candidateSpan(text, p, nextP = null) {
  const s = String(text ?? "");
  if (!Number.isInteger(p) || p < 0 || p >= s.length) return "";
  const limit = nextP != null && nextP > p ? Math.min(nextP, s.length) : s.length;
  let end = p;
  while (end < limit && !STOP.test(s[end])) end++;
  return s.slice(p, end);
}

/**
 * Every position in a verse with its candidate, in position order. Markers that
 * share a position share one candidate — the sheet shows one word per position.
 */
export function verseCandidates(text, positions) {
  const ps = [...new Set(positions.filter((p) => Number.isInteger(p)))].sort((a, b) => a - b);
  return ps.map((p, i) => ({ p, candidate: candidateSpan(text, p, ps[i + 1] ?? null) }));
}

/**
 * A model's answer is only accepted when it is a non-empty prefix of the
 * candidate that does not end on punctuation — so a hallucinated word, a
 * paraphrase or a stray character can never reach the data.
 */
export function verifyLemma(candidate, answer) {
  if (typeof answer !== "string") return false;
  const a = answer.trim();
  if (!a || !candidate) return false;
  if (!candidate.startsWith(a)) return false;
  return !STOP.test(a[a.length - 1]);
}

/**
 * One request per verse. Items are `{p, candidate, en?, l?}`; the English word
 * (from the EPUB half, when a study file was readable) is the strongest signal
 * the model gets, so it is included whenever we have it.
 */
export function buildPrompt(text, items) {
  const lines = items.map(
    (it, i) =>
      `${i + 1}. 候选：「${it.candidate}」` +
      (it.en ? `　英文：「${it.en}」` : "") +
      (it.l ? `　标记：${it.l}` : ""),
  );
  return [
    `经文：${text}`,
    "",
    "下面每一项对应经文中的一个注解标记。「候选」是从标记位置起、到下一个标记或标点为止的片段，",
    "注解真正解释的词组就在这个片段的开头，但片段末尾常常多带了无关的字。",
    "请为每一项定出这个词组到哪里为止。",
    "",
    ...lines,
    "",
    `只输出 JSON，键是上面的编号，值是词组，例如 {"1":"起初"}。`,
    "规则：",
    "- 值必须是对应候选片段的开头（前缀），一个字都不能改、不能加、不能调换。",
    "- 给了英文时，取与该英文意思对应的中文词组。",
    "- 要取完整的词：候选「渊面」取「渊面」不取「渊」，候选「黑暗」取「黑暗」不取「黑」。",
    "- 也不要多取：候选「样式造」取「样式」，候选「管理海里的鱼」取「管理」。",
    "- 值不能以标点结尾，也不能为空。",
    "- 不要输出解释或其他文字。",
  ].join("\n");
}

export const SYSTEM_PROMPT =
  "你是中文圣经注解的编辑助手。你只输出 JSON，不作解释。";

/**
 * Pull the JSON object out of a model reply: thinking blocks, code fences and
 * chatter around it are all common and none of them are worth a retry.
 */
export function parseAnswer(reply) {
  let s = String(reply ?? "");
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/<\/?think>/gi, "");
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1];
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- sticky characters */

/**
 * How often each `words` entry is followed by each character, across `texts`.
 * One pass over the corpus for the whole set, so this stays cheap however many
 * words are checked.
 *
 * @returns {Map<string, {total: number, next: Map<string, number>}>}
 */
export function countFollowers(texts, words) {
  const stats = new Map();
  const lengths = new Set();
  for (const w of words) {
    if (!w) continue;
    stats.set(w, { total: 0, next: new Map() });
    lengths.add(w.length);
  }
  if (!stats.size) return stats;
  const lens = [...lengths].sort((a, b) => a - b);
  for (const text of texts) {
    for (let i = 0; i < text.length; i++) {
      for (const len of lens) {
        if (i + len > text.length) break;
        const st = stats.get(text.slice(i, i + len));
        if (!st) continue;
        st.total++;
        const c = text[i + len] ?? "";
        st.next.set(c, (st.next.get(c) ?? 0) + 1);
      }
    }
  }
  return stats;
}

/**
 * Grow `word` while the corpus says the next character of `candidate` is really
 * part of it — "耶和" is followed by "华" in every occurrence there is, so it is
 * a fragment of a name rather than a word.
 *
 * The bar is deliberately high, because the same shape appears for a reason
 * that must not move: a rare phrase can be followed by the same character every
 * time it occurs without being a fragment of anything. So only a short word
 * with real corpus behind it qualifies — a truncated name is 耶和, 以色, 撒母,
 * 亚伯拉, never four characters of ordinary prose.
 */
export function stickyExtension(
  word,
  candidate,
  stats,
  { threshold = 0.98, minTotal = 12, maxWord = 3 } = {},
) {
  let w = word;
  while (w && w.length <= maxWord && w.length < candidate.length) {
    const st = stats.get(w);
    if (!st || st.total < minTotal) break;
    const c = candidate[w.length];
    if (!c || STOP.test(c)) break;
    if ((st.next.get(c) ?? 0) / st.total < threshold) break;
    w += c;
  }
  return w;
}

/**
 * Apply a parsed answer to the items of one verse.
 *
 * @returns {{p: number, w: string|null, candidate: string, answer: string|null}[]}
 */
export function applyAnswer(items, answer) {
  return items.map((it, i) => {
    // The prompt numbers the items, but a model that keys its reply by position
    // instead is answering the same question — take whichever key verifies, so
    // the two numbering schemes can never be confused for one another.
    const candidates = [answer?.[String(i + 1)], answer?.[String(it.p)]]
      .map((v) => (typeof v === "string" ? v.trim() : null))
      .filter(Boolean);
    const w = candidates.find((a) => verifyLemma(it.candidate, a)) ?? null;
    return { p: it.p, candidate: it.candidate, answer: candidates[0] ?? null, w };
  });
}
