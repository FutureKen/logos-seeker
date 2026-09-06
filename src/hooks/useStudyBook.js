import { useEffect, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";

/**
 * Load one book's outline + info (`book.json`) through the shared `StudyStore`.
 * Same contract as {@link useStudyChapter}: never suspends, never throws.
 *
 * @param {number|null} book books.json idx
 * @param {boolean} enabled `state.unlocked && state.study`
 * @returns {{status: "off"|"loading"|"ready"|"error", data: object|null}}
 */
export function useStudyBook(book, enabled = true) {
  const { store } = useApp();
  const on = !!enabled && book != null;
  const key = on ? String(book) : "off";
  const [state, setState] = useState({ key: null, status: "off", data: null });

  useEffect(() => {
    if (!on) {
      setState({ key, status: "off", data: null });
      return;
    }
    const cached = store.book(book);
    if (cached) {
      setState({ key, status: "ready", data: cached });
      return;
    }
    let cancelled = false;
    setState({ key, status: "loading", data: null });
    store.ensureBook(book).then(
      (data) => !cancelled && setState({ key, status: "ready", data }),
      () => !cancelled && setState({ key, status: "error", data: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [on, key, book, store]);

  if (state.key !== key) {
    const cached = on ? store.book(book) : null;
    if (cached) return { status: "ready", data: cached };
    return { status: on ? "loading" : "off", data: null };
  }
  return { status: state.status, data: state.data };
}

/**
 * The outline entries that start inside `chapter`, grouped by the verse they
 * are anchored to (verse 0 = a heading standing above the whole chapter).
 * Mirrors `StudyStore.outlineForChapter`, but reads the already-loaded book
 * object so components can work from props alone.
 *
 * @param {object|null} bookData decrypted `book.json`
 * @param {number} chapter
 * @param {"en"|"cn"} lang
 * @returns {Map<number, object[]>}
 */
export function outlineForChapter(bookData, chapter, lang = "en") {
  const out = new Map();
  const entries = bookData?.[lang]?.outline ?? [];
  for (const e of entries) {
    if (!Array.isArray(e.start) || e.start[0] !== chapter) continue;
    const v = e.start[1] ?? 0;
    if (!out.has(v)) out.set(v, []);
    out.get(v).push(e);
  }
  return out;
}

/**
 * An outline entry is rendered *inside* the verse text only when it starts in
 * the second half of a verse and the split point is known.
 */
export function isMidVerse(entry) {
  return entry?.start?.[2] === 2 && entry.pos != null;
}

export default useStudyBook;
