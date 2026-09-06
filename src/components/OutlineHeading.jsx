/**
 * One Recovery Version outline heading.
 *
 * Two shapes:
 *  - block (default): sits above the verse its range starts at, inside the
 *    chapter body;
 *  - inline (`inline`): sits *inside* a verse, at the split point of a verse
 *    whose second half opens a new section (Gen 1:2b) — so it must be an
 *    inline-level element with `display:block`, not a `<div>` inside a `<span>`.
 *
 * The size follows `level` (l1 largest … l6 smallest) and the colour is the
 * gold `--color-otl` token, which is what makes the outline read as a distinct
 * layer above the verse text.
 */
export default function OutlineHeading({
  entry,
  book,
  inline = false,
  onGoto,
  className = "",
}) {
  if (!entry) return null;
  const Tag = inline ? "span" : "div";
  const cls = [
    "otl",
    `otl-l${entry.level || 1}`,
    inline ? "otl-inline" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {entry.label ? <span className="otl-label">{entry.label}</span> : null}
      <span className="otl-title">{entry.title}</span>
    </>
  );

  if (!onGoto) return <Tag className={cls}>{body}</Tag>;
  return (
    <Tag className={cls}>
      <button
        type="button"
        className="otl-btn"
        onClick={(e) => {
          e.stopPropagation();
          const [c, v] = entry.start ?? [];
          if (c) onGoto([book, c, v || 1, 0]);
        }}
      >
        {body}
      </button>
    </Tag>
  );
}
