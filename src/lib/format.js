/**
 * Pure text helpers shared by the verse components: match highlighting,
 * clipboard formatting and the "b:c:v" selection key. Framework-free so they
 * can be unit-tested without rendering anything.
 */

import { COL } from "../search.js";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split `text` into `{ s, mark }` segments so the caller can wrap the marked
 * ones in `<mark>`. Mirrors the old `highlight()`: every whitespace-separated
 * part is matched independently (AND search semantics), longest first, so an
 * exact full-phrase match wins over its individual words.
 * @returns {{s: string, mark: boolean}[]}
 */
export function splitHighlight(text, term) {
  const whole = [{ s: text, mark: false }];
  if (!term || !term.trim() || !text) return whole;

  const parts = term.trim().split(/\s+/).filter(Boolean);
  const all = parts.length > 1 ? [term.trim(), ...parts] : parts;
  const uniq = [...new Set(all)].sort((a, b) => b.length - a.length);
  if (!uniq.length) return whole;

  let re;
  try {
    re = new RegExp(uniq.map(escapeRegExp).join("|"), "gi");
  } catch {
    return whole;
  }

  const out = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ s: text.slice(last, m.index), mark: false });
    out.push({ s: m[0], mark: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ s: text.slice(last), mark: false });
  return out.length ? out : whole;
}

/** The verse text for the current display language (falls back to English). */
export function textFor(row, lang) {
  if (lang === "cn") return row[COL.CN] || row[COL.EN];
  return row[COL.EN];
}

/** True when this row has no Chinese text (rare versification gaps). */
export function cnMissing(row, lang) {
  return lang === "cn" && !row[COL.CN];
}

/** Stable identity of a verse row: "book:chapter:verse". */
export function verseKey(row) {
  return `${row[COL.BOOK]}:${row[COL.CHAP]}:${row[COL.VERSE]}`;
}

/**
 * Format a single verse as "Reference  text". In interlinear chapter view both
 * languages are included (English line, then Chinese).
 */
export function verseToText(bs, row, lang, interlinear = false) {
  const book = bs.bookByIdx.get(row[COL.BOOK]);
  if (interlinear) {
    const en = book.en;
    const cn = book.cn || en;
    const cv = `${row[COL.CHAP]}:${row[COL.VERSE]}`;
    const cnText = row[COL.CN] || row[COL.EN];
    return `${en} ${cv}  ${row[COL.EN]}\n${cn} ${cv}  ${cnText}`;
  }
  return `${bs.refLabel(row, lang)}  ${textFor(row, lang)}`;
}

/** Clipboard write with a textarea fallback for non-secure contexts. */
export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* ignore */
    }
    document.body.removeChild(ta);
  } catch {
    /* ignore */
  }
}
