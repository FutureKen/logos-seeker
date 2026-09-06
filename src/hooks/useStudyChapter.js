import { useEffect, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";

/**
 * Load one chapter's study apparatus through the shared `StudyStore`.
 *
 * The chapter text is always rendered immediately; this hook only decides
 * whether the apparatus can be layered on top of it yet, so it never suspends
 * and never throws. `data` is the decrypted `{chapter}.json` (both language
 * halves), or `null`.
 *
 * @param {number|null} book books.json idx
 * @param {number|null} chapter
 * @param {boolean} enabled `state.unlocked && state.study` — when false nothing
 *   is fetched at all, which is what keeps the locked app byte-for-byte the old
 *   text-only app.
 * @returns {{status: "off"|"loading"|"ready"|"error", data: object|null}}
 */
export function useStudyChapter(book, chapter, enabled = true) {
  const { store } = useApp();
  const on = !!enabled && book != null && chapter != null;
  const key = on ? `${book}:${chapter}` : "off";
  const [state, setState] = useState({ key: null, status: "off", data: null });

  useEffect(() => {
    if (!on) {
      setState({ key, status: "off", data: null });
      return;
    }
    const cached = store.chapter(book, chapter);
    if (cached) {
      setState({ key, status: "ready", data: cached });
      return;
    }
    let cancelled = false;
    setState({ key, status: "loading", data: null });
    store.ensureChapter(book, chapter).then(
      (data) => !cancelled && setState({ key, status: "ready", data }),
      () => !cancelled && setState({ key, status: "error", data: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [on, key, book, chapter, store]);

  // While the effect for a *new* chapter has not run yet, never hand back the
  // previous chapter's notes: fall back to the cache (instant on a revisit) or
  // to "loading".
  if (state.key !== key) {
    const cached = on ? store.chapter(book, chapter) : null;
    if (cached) return { status: "ready", data: cached };
    return { status: on ? "loading" : "off", data: null };
  }
  return { status: state.status, data: state.data };
}

/**
 * Which language half of a study file to render.
 *
 * The two halves are built by two independent pipelines, so a file may hold
 * only one of them for a while. Rather than hiding the apparatus, fall back to
 * the other language and let the UI mark it — the same way the verse list
 * already shows "(EN versification)" where a Chinese verse is missing.
 *
 * @param {object|null} file decrypted `book.json` / `{chapter}.json`
 * @param {"en"|"cn"} lang the display language
 * @returns {{lang: "en"|"cn"|null, half: object|null, fallback: boolean}}
 */
export function pickHalf(file, lang) {
  const other = lang === "cn" ? "en" : "cn";
  if (file?.[lang]) return { lang, half: file[lang], fallback: false };
  if (file?.[other]) return { lang: other, half: file[other], fallback: true };
  return { lang: null, half: null, fallback: false };
}

export default useStudyChapter;
