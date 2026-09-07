/**
 * Plain-text rendering of a study note, for the clipboard. Framework-free so
 * the `Rich` shapes of the data contract can be unit-tested without rendering
 * anything.
 */

/** One run of a `Rich` paragraph, stripped of its markup. */
function runToText(run) {
  if (run == null) return "";
  if (typeof run === "string") return run;
  if (run.i != null) return run.i;
  if (run.sup != null) return run.sup;
  return run.t ?? "";
}

/** A `Rich` (paragraphs of runs) as plain text, one line per paragraph. */
export function richToText(rich) {
  if (!Array.isArray(rich)) return "";
  return rich
    .map((runs) => (Array.isArray(runs) ? runs : [runs]).map(runToText).join(""))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * One note card as the reader sees it: the verse it hangs on and the marker's
 * label on the first line, then the cross-references, then the prose.
 *
 * @param {{ref?: string, label?: string, word?: string,
 *          xrefs?: {t: string, cf?: boolean}[], note?: any[],
 *          repeatOf?: string|number|null, t: object}} opts
 *   `t` is the `tr(lang)` string table of the *sheet's* language.
 */
export function noteToText({ ref, label, word, xrefs, note, repeatOf, t }) {
  const head = [ref, label, word].filter(Boolean).join("  ");
  const lines = head ? [head] : [];

  if (xrefs?.length) {
    // "cf." introduces a run of comparison references, exactly as on screen.
    lines.push(
      xrefs
        .map((it, i) => (it.cf && !xrefs[i - 1]?.cf ? `${t.cf} ${it.t}` : it.t))
        .join("; "),
    );
  }

  if (repeatOf != null) lines.push(t.sameNote(repeatOf));
  else {
    const body = richToText(note);
    if (body) lines.push(body);
  }

  return lines.join("\n");
}
