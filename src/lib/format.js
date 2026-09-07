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

/** Two clicks this close together are one gesture, from a mouse or a thumb. */
const TAP_GAP_MS = 350;
/** How long one copy stays done, so the two routes below cannot double up. */
const COPY_GUARD_MS = 500;

/** When each element was last tapped, and last copied from. */
const lastTap = new WeakMap();
const lastCopy = new WeakMap();

function copyOnce(el, onCopy) {
  const now = Date.now();
  if (now - (lastCopy.get(el) ?? 0) < COPY_GUARD_MS) return;
  lastCopy.set(el, now);
  // Undo the word the browser selected under the second click.
  globalThis.getSelection?.()?.removeAllRanges();
  onCopy?.();
}

/**
 * Tap to select, tap twice to copy.
 *
 * `dblclick` alone is not enough: a touch screen with double-tap zoom out of
 * the way stops waiting for a second tap and reports two unrelated clicks, and
 * no `dblclick` at all. So the pair is counted here from the clicks every
 * platform does send — the browser has already decided a drag or a scroll is
 * not a click — and `dblclick` is kept for the mouse, the guard above making it
 * harmless when both arrive for the same gesture.
 *
 * The count lives against the element rather than in this closure, which the
 * caller rebuilds on every render.
 *
 * @param onToggle the single-tap action, if the element has one
 * @returns props to spread onto the element
 */
export function tapToCopy(onToggle, onCopy) {
  return {
    onClick(e) {
      const el = e.currentTarget;
      const now = Date.now();
      const second = now - (lastTap.get(el) ?? 0) < TAP_GAP_MS;
      lastTap.set(el, second ? 0 : now);
      // The first tap selects the row and the second puts it back, so a copy
      // leaves it exactly as it was found.
      onToggle?.();
      if (second) copyOnce(el, onCopy);
    },
    onDoubleClick(e) {
      e.preventDefault();
      copyOnce(e.currentTarget, onCopy);
    },
  };
}
