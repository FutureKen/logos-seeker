import VerseRow from "./VerseRow.jsx";
import { tr } from "../lib/i18n.js";

/**
 * The several readings of an ambiguous digit-string reference (e.g. "heb 111"
 * → Heb 1:11 and Heb 11:1). Verse candidates render as normal rows; a
 * whole-chapter candidate renders as a "jump to chapter" row.
 */
export default function FuzzyResults({
  items,
  bookName,
  bs,
  lang,
  selected,
  onOpenChapter,
  onToggleSelect,
  onCopy,
}) {
  const t = tr(lang);
  return (
    <>
      {items.map((item) =>
        item.kind === "chapter" ? (
          <article className="verse fuzzy-chapter" key={`c${item.chapter}`}>
            <span
              className="ref"
              role="button"
              tabIndex={0}
              title={t.showChapter}
              onClick={() => onOpenChapter(item.rowIdx)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenChapter(item.rowIdx);
                }
              }}
            >
              {bookName} {item.chapter}
            </span>
            <span className="text muted">{t.wholeChapter}</span>
          </article>
        ) : (
          <VerseRow
            key={`v${item.rowIdx}`}
            row={bs.verses[item.rowIdx]}
            refLabel={bs.refLabel(bs.verses[item.rowIdx], lang)}
            lang={lang}
            selected={selected.has(item.key)}
            onOpenChapter={() => onOpenChapter(item.rowIdx)}
            onToggleSelect={() => onToggleSelect(item.key)}
            onCopy={() => onCopy(bs.verses[item.rowIdx])}
          />
        ),
      )}
    </>
  );
}
