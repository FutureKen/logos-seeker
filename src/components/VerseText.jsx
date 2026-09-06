import { splitText } from "../study/splitText.js";
import OutlineHeading from "./OutlineHeading.jsx";

/**
 * A marker label is "digits + letters": the digits are the footnote number, the
 * letters the cross-reference letter (either half may be missing). They are
 * coloured differently, so the label is split rather than styled as one blob.
 */
function labelParts(label) {
  const m = /^(\d*)([^\d]*)$/.exec(String(label ?? ""));
  if (!m) return [{ s: String(label ?? ""), x: false }];
  const out = [];
  if (m[1]) out.push({ s: m[1], x: false });
  if (m[2]) out.push({ s: m[2], x: true });
  return out.length ? out : [{ s: String(label ?? ""), x: false }];
}

/**
 * A superscript marker. Deliberately `aria-hidden` and not focusable: the
 * accessible way into the same content is the verse number button, and a
 * selection dragged across the verse must copy the plain text, which is what
 * `user-select: none` (see `.mk` in styles.css) gives us.
 */
function Marker({ seg, onMarker }) {
  return (
    <sup
      className={`mk${seg.floating ? " mk-float" : ""}`}
      aria-hidden="true"
      data-marker={seg.m}
      onClick={(e) => {
        e.stopPropagation();
        onMarker?.(seg.m);
      }}
    >
      {labelParts(seg.l).map((p, i) => (
        <span className={p.x ? "mk-x" : "mk-n"} key={i}>
          {p.s}
        </span>
      ))}
    </sup>
  );
}

/**
 * One verse line: the verse number, the verse text, and — when study mode is on
 * and this verse has apparatus — the superscript markers and any mid-verse
 * outline heading, woven in at the positions `splitText` computes.
 *
 * See `src/components/contracts.md`.
 */
export default function VerseText({
  text,
  verseNo,
  showNumber = true,
  apparatus = null,
  heads = null,
  study = false,
  onMarker,
  onVerseNumber,
  book,
}) {
  const markers = study ? apparatus?.m ?? [] : [];
  const midHeads = study ? heads ?? [] : [];
  const hasApparatus = markers.length > 0;

  const number = !showNumber ? null : hasApparatus && onVerseNumber ? (
    <button
      type="button"
      className="vnum vnum-btn"
      onClick={(e) => {
        e.stopPropagation();
        onVerseNumber();
      }}
    >
      {verseNo}
    </button>
  ) : (
    <span className="vnum">{verseNo}</span>
  );

  if (!hasApparatus && !midHeads.length) {
    return (
      <>
        {number}
        {text}
      </>
    );
  }

  const segments = splitText(text, markers, midHeads);
  return (
    <>
      {number}
      {segments.map((seg, i) => {
        if (seg.t != null) return seg.t;
        if (seg.h) {
          return (
            <OutlineHeading key={`h${i}`} entry={seg.h} book={book} inline />
          );
        }
        return <Marker key={`m${i}`} seg={seg} onMarker={onMarker} />;
      })}
    </>
  );
}
