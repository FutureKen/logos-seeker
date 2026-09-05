import { refAttr } from "../study/refText.js";

/**
 * Renders `Rich` — the paragraph/run tree the data pipeline produces for notes,
 * book-info fields and outline titles.
 *
 * Runs (see the data contract):
 *   `"text"`                     plain text
 *   `{ i }`                      italic
 *   `{ ref, t }`                 a scripture link  → `.ref-link` button
 *   `{ note: [b,c,v,num], t }`   a link to another note → `.note-link` button
 *   `{ sup }`                    a superscript marker inside note prose
 */
export default function RichText({ rich, onGoto, onNote, className = "" }) {
  const paragraphs = Array.isArray(rich) ? rich : [];
  if (!paragraphs.length) return null;
  return (
    <>
      {paragraphs.map((runs, pi) => (
        <p className={`rt-p ${className}`.trim()} key={pi}>
          {(Array.isArray(runs) ? runs : [runs]).map((run, ri) => (
            <Run key={ri} run={run} onGoto={onGoto} onNote={onNote} />
          ))}
        </p>
      ))}
    </>
  );
}

function Run({ run, onGoto, onNote }) {
  if (run == null) return null;
  if (typeof run === "string") return run;
  if (run.i != null) return <em>{run.i}</em>;
  if (run.sup != null) return <sup className="rt-sup">{run.sup}</sup>;
  if (run.ref != null) {
    return (
      <button
        type="button"
        className="ref-link"
        data-ref={refAttr(run.ref)}
        onClick={(e) => {
          e.stopPropagation();
          onGoto?.(run.ref);
        }}
      >
        {run.t ?? ""}
      </button>
    );
  }
  if (run.note != null) {
    return (
      <button
        type="button"
        className="note-link"
        onClick={(e) => {
          e.stopPropagation();
          onNote?.(run.note);
        }}
      >
        {run.t ?? ""}
      </button>
    );
  }
  return run.t ?? null;
}
