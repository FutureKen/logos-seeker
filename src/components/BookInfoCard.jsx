import RichText from "./RichText.jsx";
import { tr } from "../lib/i18n.js";

/**
 * The book's introductory block (author, when/where it was written, the period
 * it covers, its recipients and its subject), shown above the first verse of
 * chapter 1 and in the study sheet's Book tab — the same header
 * recoveryversion.com.tw puts at the top of a book.
 *
 * Fields absent from the source (Old Testament books have no "Recipients", a
 * few have no "Time Period Covered") are simply skipped.
 */
const FIELDS = [
  ["author", "infoAuthor"],
  ["written", "infoWritten"],
  ["place", "infoPlace"],
  ["period", "infoPeriod"],
  ["recipients", "infoRecipients"],
  ["subject", "infoSubject"],
];

export default function BookInfoCard({ info, lang, onGoto, onNote, title = null }) {
  const t = tr(lang);
  const rows = FIELDS.filter(([k]) => Array.isArray(info?.[k]) && info[k].length);
  if (!rows.length) return null;
  return (
    <div className="book-info">
      {title ? <div className="book-info-title">{title}</div> : null}
      {rows.map(([key, label]) => (
        <div className={`bi-row bi-${key}`} key={key}>
          <span className="bi-label">{t[label]}</span>
          <span className="bi-val">
            <RichText rich={info[key]} onGoto={onGoto} onNote={onNote} />
          </span>
        </div>
      ))}
    </div>
  );
}
