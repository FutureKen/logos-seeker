import { useEffect, useRef } from "react";
import { useBooks } from "../hooks/useBooks.js";
import { tr } from "../lib/i18n.js";

/** The Old Testament is books 1–39; everything above that is the New. */
const OT_END = 39;

/**
 * Every abbreviation the search box accepts, English and Chinese, straight from
 * the alias table the parser itself uses — so what this lists is exactly what
 * will be understood.
 */
export default function AbbrevDialog({ open, lang, onClose }) {
  const t = tr(lang);
  const { books, status } = useBooks(open);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [open]);

  const list = books ?? [];
  const ot = list.filter((b) => b.idx <= OT_END);
  const nt = list.filter((b) => b.idx > OT_END);

  return (
    <dialog
      ref={dialogRef}
      className="abbrev-dialog"
      aria-label={t.abbrevTitle}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
    >
      <div className="ab-head">
        <span className="ab-title">{t.abbrevTitle}</span>
        <button
          type="button"
          className="clear-btn help-close"
          aria-label={t.close}
          title={t.close}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="ab-body" ref={bodyRef}>
        <p className="ab-intro">{t.abbrevIntro}</p>
        {status === "loading" && !list.length ? <p className="bm-status">{t.loading}</p> : null}
        {status === "error" ? <p className="bm-status">{t.booksFailed}</p> : null}
        {ot.length ? <Section title={t.oldTestament} books={ot} /> : null}
        {nt.length ? <Section title={t.newTestament} books={nt} /> : null}
      </div>
    </dialog>
  );
}

function Section({ title, books }) {
  return (
    <section className="ab-section">
      <h3 className="bm-section-title">{title}</h3>
      <div className="ab-table">
        {books.map((b) => (
          <div className="ab-row" key={b.idx}>
            <div className="ab-name">
              <span className="ab-en">{b.en}</span>
              <span className="ab-cn">{b.cn}</span>
            </div>
            <div className="ab-aliases">
              <Aliases items={b.enAlias} />
              <Aliases items={b.cnAlias} cn />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Aliases({ items, cn = false }) {
  if (!items?.length) return null;
  return (
    <div className={cn ? "ab-alias-line cn" : "ab-alias-line"}>
      {items.map((a) => (
        <code className="ab-alias" key={a}>
          {a}
        </code>
      ))}
    </div>
  );
}
