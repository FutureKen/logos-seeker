/**
 * Text normalization + offset mapping between a source text (the EPUB / API
 * text the markers were measured against) and the destination text (the exact
 * `verses.json` string the app renders).
 *
 * The two are usually identical after normalization; when they are not
 * (verses.json is a newer revision of the English text) a character-level LCS
 * diff maps each offset, and offsets that land inside a changed span are
 * reported as `null` so the caller can fall back to a verse-level marker group.
 */

/**
 * EPUB English → verses.json English: drop poetry line marks, curly quotes →
 * straight, collapse whitespace.
 */
export function normalizeEn(s) {
  return String(s ?? "")
    .replace(/ /g, " ")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+\/\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chinese: whitespace (incl. the ideographic space) carries no information. */
export function normalizeCn(s) {
  return String(s ?? "").replace(/[\s　﻿]+/g, "");
}

/**
 * Character-level LCS alignment. Returns an array of length `src.length` where
 * `map[i]` is the index in `dst` that `src[i]` aligns to, or -1 when the
 * character has no counterpart.
 */
function lcsMap(src, dst) {
  const n = src.length;
  const m = dst.length;
  const map = new Int32Array(n).fill(-1);
  if (!n || !m) return map;

  // O(n*m) DP is fine for verse-sized strings (a few hundred chars).
  const width = m + 1;
  const dp = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        src[i] === dst[j]
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (src[i] === dst[j]) {
      map[i] = j;
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return map;
}

/**
 * Map string offsets from `src` into `dst`.
 *
 * @param {string} src
 * @param {string} dst
 * @param {(number|null)[]} offsets indices into `src` (a marker is inserted
 *   *before* the character at that index)
 * @returns {{pos: number|null, how: 'exact'|'diff'|'snap'|'none'}[]}
 */
export function mapOffsets(src, dst, offsets) {
  const list = Array.from(offsets ?? []);
  const a = String(src ?? "");
  const b = String(dst ?? "");

  if (a === b) {
    return list.map((o) =>
      o == null || o < 0 || o > b.length ? { pos: null, how: "none" } : { pos: o, how: "exact" },
    );
  }

  const map = lcsMap(a, b);
  return list.map((o) => {
    if (o == null || o < 0 || o > a.length) return { pos: null, how: "none" };
    if (o === a.length) return { pos: b.length, how: "diff" };
    if (map[o] >= 0) return { pos: map[o], how: "diff" };

    // Unanchored: aim at the next anchored character and accept the position
    // only when the three characters that follow still match there.
    let k = o + 1;
    while (k < a.length && map[k] < 0) k++;
    const anchored = k < a.length;
    const cand = anchored ? map[k] : b.length;
    if (cand < 0) return { pos: null, how: "none" };
    const from = anchored ? k : o;
    const probe = a.slice(from, from + 3);
    if (probe.length && b.slice(cand, cand + probe.length) === probe) {
      return { pos: cand, how: "snap" };
    }
    return { pos: null, how: "none" };
  });
}
