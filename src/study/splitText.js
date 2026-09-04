/**
 * Turn a verse string plus its markers and mid-verse outline headings into a
 * flat, render-ready segment list. Pure, so it is unit-tested directly.
 *
 * Segment shapes:
 *   `{ t: "…" }`                        a run of verse text
 *   `{ m, l, x, floating? }`            a superscript marker (`m` = index into
 *                                       the `markers` array, `x` = true when
 *                                       the marker carries a cross-reference)
 *   `{ h }`                             an outline heading entry
 *
 * Markers with `p == null` are unaligned; they are emitted first, flagged
 * `floating: true`, so the UI can group them right after the verse number.
 */

/**
 * @param {string} text the exact verses.json string for this verse
 * @param {{l: string, p: number|null, n?: number|string, x?: string}[]} markers
 * @param {{pos: number|null}[]} [heads] outline entries anchored in this verse
 */
export function splitText(text, markers = [], heads = []) {
  const s = String(text ?? "");
  const out = [];

  markers.forEach((mk, i) => {
    if (mk && mk.p == null) out.push({ m: i, l: mk.l, x: mk.x != null, floating: true });
  });

  const events = [];
  markers.forEach((mk, i) => {
    if (!mk || mk.p == null) return;
    const p = Math.max(0, Math.min(s.length, mk.p));
    events.push({ p, order: 1, seg: { m: i, l: mk.l, x: mk.x != null } });
  });
  (heads ?? []).forEach((h) => {
    const p = h?.pos == null ? 0 : Math.max(0, Math.min(s.length, h.pos));
    events.push({ p, order: 0, seg: { h } });
  });
  // Stable: headings precede markers at the same position, and both keep their
  // original relative order otherwise.
  events.forEach((e, i) => (e.i = i));
  events.sort((a, b) => a.p - b.p || a.order - b.order || a.i - b.i);

  let cursor = 0;
  for (const e of events) {
    if (e.p > cursor) out.push({ t: s.slice(cursor, e.p) });
    out.push(e.seg);
    cursor = Math.max(cursor, e.p);
  }
  if (cursor < s.length) out.push({ t: s.slice(cursor) });
  return out;
}
