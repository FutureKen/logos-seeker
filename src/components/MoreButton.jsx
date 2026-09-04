import { tr } from "../lib/i18n.js";

/** Reveals the next page of keyword matches. */
export default function MoreButton({ remaining, lang, onClick }) {
  if (remaining <= 0) return null;
  return (
    <button type="button" id="more-results" className="more-btn" onClick={onClick}>
      {tr(lang).more(remaining)}
    </button>
  );
}
