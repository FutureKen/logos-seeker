import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";
import { useBooks } from "../hooks/useBooks.js";
import { tr } from "../lib/i18n.js";

/** The Old Testament is books 1–39; everything above that is the New. */
const OT_END = 39;

/**
 * The book menu: every book of the Bible as a compact grid, then that book's
 * chapters as a grid of numbers — two taps from anywhere to any chapter,
 * without typing a reference. There is no filter box here: the main search bar
 * already takes a book name or an abbreviation in either language.
 *
 * A native `<dialog>`, so it is a centred panel on the desktop and a bottom
 * sheet on a phone, and Esc closes it for free.
 */
export default function BookMenu({ open, onClose }) {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  const { books, status } = useBooks(open);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const [picked, setPicked] = useState(null); // book idx, or null while listing books

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

  // Every opening starts at the book list — the menu is a navigation aid, not a
  // place that remembers state.
  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);

  // Scroll back to the top when switching between the two steps.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [picked]);

  const list = useMemo(() => books ?? [], [books]);
  const book = picked != null ? list.find((b) => b.idx === picked) : null;
  const name = (b) => (state.lang === "cn" ? b.cn || b.en : b.en);

  function choose(b) {
    // A one-chapter book (Obadiah, Jude, …) has nothing to choose from.
    if (b.chapters.length === 1) return go(b.idx, 1);
    setPicked(b.idx);
  }

  function go(bookIdx, chapter) {
    onClose?.();
    actions.openChapter({
      book: bookIdx,
      chapter,
      focusVerse: null,
      scroll: "top",
      push: true,
    });
  }

  const ot = list.filter((b) => b.idx <= OT_END);
  const nt = list.filter((b) => b.idx > OT_END);

  return (
    <dialog
      ref={dialogRef}
      className="book-menu"
      aria-label={t.menuTitle}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
    >
      <div className="bm-head">
        {book ? (
          <button type="button" className="bm-back" onClick={() => setPicked(null)}>
            ← {t.allBooks}
          </button>
        ) : (
          <span className="bm-title">{t.menuTitle}</span>
        )}
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

      <div className="bm-body" ref={bodyRef}>
        {status === "loading" && !list.length ? <p className="bm-status">{t.loading}</p> : null}
        {status === "error" ? <p className="bm-status">{t.booksFailed}</p> : null}

        {book ? (
          <>
            <h3 className="bm-section-title bm-book-name">{name(book)}</h3>
            <div className="bm-grid bm-chapters">
              {book.chapters.map((_, i) => (
                <button
                  type="button"
                  className="bm-chapter"
                  key={i}
                  onClick={() => go(book.idx, i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {ot.length ? (
              <Section title={t.oldTestament} books={ot} name={name} t={t} onPick={choose} />
            ) : null}
            {nt.length ? (
              <Section title={t.newTestament} books={nt} name={name} t={t} onPick={choose} />
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}

function Section({ title, books, name, t, onPick }) {
  return (
    <section className="bm-section">
      <h3 className="bm-section-title">{title}</h3>
      <div className="bm-grid">
        {books.map((b) => (
          <button type="button" className="bm-book" key={b.idx} onClick={() => onPick(b)}>
            <span className="bm-book-title">{name(b)}</span>
            <span className="bm-book-ch">{t.chapterCount(b.chapters.length)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
