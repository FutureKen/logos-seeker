import { COL } from "../search.js";
import { textFor } from "../lib/format.js";

/**
 * The first few verses behind a `Ref`, for the hover preview on a reference
 * link. Framework-free so it can be unit-tested against a stub index.
 *
 * A reference can name one verse (`John 1:1`), a range (`John 1:1-5`) or a
 * whole chapter (`verse 0` — `John 1`). Only the opening verses are worth a
 * tooltip, so the rest are reported as `more` and the caller shows an ellipsis.
 *
 * @param {{verses: any[], refMap: Map<string, number>}} bs a loaded BibleSearch
 * @param {[number, number, number, number]} ref
 * @param {"en"|"cn"} lang
 * @param {{maxVerses?: number, maxChars?: number}} [opts]
 * @returns {{lines: {no: number, text: string}[], more: boolean}|null}
 */
export function refPreview(bs, ref, lang = "en", opts = {}) {
  const { maxVerses = 3, maxChars = 300 } = opts;
  if (!bs?.verses || !bs?.refMap || !Array.isArray(ref)) return null;

  const [book, chapter, verse, verseEnd] = ref;
  if (!book || !chapter) return null;

  // A Psalm superscription is filed as verse 0, so a whole-chapter reference
  // starts there when the chapter has one.
  const start = verse || (bs.refMap.get(`${book}:${chapter}:0`) != null ? 0 : 1);
  const last = verse
    ? verseEnd && verseEnd > verse
      ? verseEnd
      : verse
    : Infinity;

  const lines = [];
  let chars = 0;
  let more = false;
  for (let n = start; n <= last; n++) {
    const i = bs.refMap.get(`${book}:${chapter}:${n}`);
    if (i == null) {
      if (lines.length) break; // ran off the end of the chapter
      if (n > start + 1) break; // nothing here at all
      continue;
    }
    if (lines.length >= maxVerses || chars >= maxChars) {
      more = true;
      break;
    }
    const row = bs.verses[i];
    const text = textFor(row, lang);
    lines.push({ no: row[COL.VERSE], text });
    chars += text.length;
  }

  if (!lines.length) return null;
  return { lines, more };
}

/** `"43:1:1:2"` → `[43, 1, 1, 2]`; anything malformed → `null`. */
export function parseRefAttr(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(":").map((n) => Number(n));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [b, c, v, ve = 0] = parts;
  return [b, c, v, ve];
}

/** `[43, 1, 1, 2]` → `"43:1:1:2"`, the value the tooltip reads back. */
export function refAttr(ref) {
  if (!Array.isArray(ref)) return undefined;
  const [b, c, v, ve] = ref;
  return `${b}:${c}:${v || 0}:${ve || 0}`;
}
