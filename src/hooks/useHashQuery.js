import { useEffect, useRef } from "react";

/**
 * URL-hash state. `#q=<query>` is the shareable search (unchanged from the
 * vanilla app); `#c=<book>:<chapter>:<verse>` names a chapter view so a reload
 * or a browser Back lands where the reader was. The in-app back button still
 * runs off the nav stack, not the hash.
 */

/** @returns {{kind:"q", query:string} | {kind:"c", book:number, chapter:number, verse:number|null}} */
export function parseHash(hash) {
  const h = String(hash ?? "").replace(/^#/, "");
  const q = /(?:^|&)q=([^&]*)/.exec(h);
  if (q) return { kind: "q", query: safeDecode(q[1]) };
  const c = /(?:^|&)c=([^&]*)/.exec(h);
  if (c) {
    const [book, chapter, verse] = safeDecode(c[1]).split(":").map(Number);
    if (book > 0 && chapter > 0) {
      return { kind: "c", book, chapter, verse: verse > 0 ? verse : null };
    }
  }
  return { kind: "q", query: "" };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The hash this state should be reflected by ("" = no hash at all). */
export function hashFor(state) {
  if (state.view.kind === "chapter") {
    const { book, chapter, focusVerse } = state.view;
    return `#c=${book}:${chapter}:${focusVerse || 0}`;
  }
  return state.query ? `#q=${encodeURIComponent(state.query)}` : "";
}

/**
 * Two-way sync. Writing a query pushes a history entry (as the old app did);
 * chapter navigation replaces it, so paging through chapters with ←/→ does not
 * bury the search in the browser history.
 */
export function useHashQuery(state, actions) {
  const ref = useRef(state);
  ref.current = state;

  // state → hash
  useEffect(() => {
    const want = hashFor(state);
    const have = window.location.hash;
    if (want === have || (!want && !have)) return;
    if (state.view.kind === "chapter" || !want) {
      const url = window.location.pathname + window.location.search + want;
      window.history.replaceState(null, "", url);
    } else {
      window.location.hash = want;
    }
  }, [state.query, state.view]);

  // hash → state (browser back/forward, or a pasted link)
  useEffect(() => {
    const onHashChange = () => {
      const cur = ref.current;
      if (window.location.hash === hashFor(cur)) return;
      const h = parseHash(window.location.hash);
      if (h.kind === "c") {
        actions.openChapter({
          book: h.book,
          chapter: h.chapter,
          focusVerse: h.verse,
          push: false,
        });
      } else if (h.query !== cur.query) {
        actions.setInput(h.query);
        actions.search(h.query);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [actions]);
}

export default useHashQuery;
