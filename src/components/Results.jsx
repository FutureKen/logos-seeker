import { useState } from "react";
import AbbrevDialog from "./AbbrevDialog.jsx";
import { HelpIcon } from "./icons.jsx";
import VerseRow from "./VerseRow.jsx";
import FuzzyResults from "./FuzzyResults.jsx";
import MoreButton from "./MoreButton.jsx";
import { verseKey } from "../lib/format.js";
import { tr } from "../lib/i18n.js";

/** The starting hint, also shown while the verse data loads for the first time. */
function Hint({ lang }) {
  const t = tr(lang);
  const [abbrevOpen, setAbbrevOpen] = useState(false);
  return (
    <div className="hint">
      {lang === "cn" ? (
        <>
          输入经文出处（如 <code>约翰福音 1:1</code>、<code>约 1</code>）或任意字词（如{" "}
          <code>基督</code>、<code>爱</code>）。
        </>
      ) : (
        <>
          Type a reference like <code>John 1:1</code> or <code>John 1</code>, or any word
          like <code>Christ</code> or <code>love</code>.
        </>
      )}{" "}
      <button
        type="button"
        className="hint-help"
        aria-label={t.abbrevLink}
        title={t.abbrevLink}
        onClick={() => setAbbrevOpen(true)}
      >
        <HelpIcon size={15} className="hint-help-icon" />
      </button>
      <AbbrevDialog open={abbrevOpen} lang={lang} onClose={() => setAbbrevOpen(false)} />
    </div>
  );
}

/**
 * The result list for the committed query. `result` is the pure description
 * produced by `computeResult` in App.jsx; nothing here re-runs a search.
 */
export default function Results({
  result,
  bs,
  lang,
  selected,
  wordShown,
  onOpenChapter,
  onToggleSelect,
  onCopy,
  onShowMore,
}) {
  const t = tr(lang);

  // While the verse data loads (and if it fails) the starting hint stays put,
  // exactly as it did in the vanilla app; the status line carries the news.
  if (result.kind === "hint" || result.kind === "loading" || result.kind === "error") {
    return <Hint lang={lang} />;
  }

  if (result.kind === "minchars") return <p className="hint">{t.minChars}</p>;
  if (result.kind === "notfound") return <p className="empty">{t.refNotFound}</p>;
  if (result.kind === "empty") return <p className="empty">{t.noResults}</p>;

  if (result.kind === "fuzzy") {
    return (
      <FuzzyResults
        items={result.items}
        bookName={result.bookName}
        bs={bs}
        lang={lang}
        selected={selected}
        onOpenChapter={onOpenChapter}
        onToggleSelect={onToggleSelect}
        onCopy={onCopy}
      />
    );
  }

  const rows =
    result.kind === "word" ? result.rows.slice(0, wordShown) : result.rows;

  return (
    <>
      {rows.map((rowIdx) => {
        const row = bs.verses[rowIdx];
        const key = verseKey(row);
        return (
          <VerseRow
            key={key}
            row={row}
            refLabel={bs.refLabel(row, lang)}
            lang={lang}
            term={result.term ?? ""}
            selected={selected.has(key)}
            onOpenChapter={() => onOpenChapter(rowIdx)}
            onToggleSelect={() => onToggleSelect(key)}
            onCopy={() => onCopy(row)}
          />
        );
      })}
      {result.kind === "word" ? (
        <MoreButton
          remaining={result.rows.length - rows.length}
          lang={lang}
          onClick={onShowMore}
        />
      ) : null}
    </>
  );
}
