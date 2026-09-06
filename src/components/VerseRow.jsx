import CopyButton from "./CopyButton.jsx";
import { useSelectPulse } from "../hooks/useSelectPulse.js";
import { cnMissing, splitHighlight, textFor } from "../lib/format.js";
import { tr } from "../lib/i18n.js";

/**
 * One compact result row: [copy] [ref] text, on a single line. Tapping the ref
 * opens the full chapter; tapping the text toggles selection.
 */
export default function VerseRow({
  row,
  refLabel,
  lang,
  term = "",
  selected = false,
  onOpenChapter,
  onToggleSelect,
  onCopy,
}) {
  const t = tr(lang);
  const pop = useSelectPulse(selected);
  const parts = splitHighlight(textFor(row, lang), term);

  return (
    <article
      className={
        "verse" +
        (lang === "cn" ? " cn" : "") +
        (selected ? " selected" : "") +
        (pop ? " just-selected" : "")
      }
      data-verse={refLabel}
    >
      <CopyButton onCopy={onCopy} label={t.copyAria} title={t.copy} />
      <span
        className="ref"
        role="button"
        tabIndex={0}
        title={t.showChapter}
        onClick={onOpenChapter}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChapter?.();
          }
        }}
      >
        {refLabel}
      </span>
      <span className="text" onClick={onToggleSelect}>
        {parts.map((p, i) => (p.mark ? <mark key={i}>{p.s}</mark> : p.s))}
        {cnMissing(row, lang) ? <span className="alt-note"> {t.enVersification}</span> : null}
      </span>
    </article>
  );
}
