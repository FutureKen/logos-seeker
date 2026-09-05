import { useEffect, useState } from "react";
import { getBible } from "./useBible.js";

/**
 * The 66-book table on its own.
 *
 * The book menu only needs names and chapter counts, so it fetches the 13 KB
 * `books.json` rather than waiting for `BibleSearch` to pull the 7.5 MB verse
 * file. Once the verses *are* loaded the menu reads them from the search index
 * instead, so the list is never fetched twice.
 */
let cache = null;
let inFlight = null;

/** Test seam: forget the fetched table so each test file starts clean. */
export function resetBooks() {
  cache = null;
  inFlight = null;
}

function loadBooks(basePath) {
  const bs = getBible();
  if (bs.books) return Promise.resolve(bs.books);
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = fetch(`${basePath}data/books.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`books.json: HTTP ${res.status}`);
        return res.json();
      })
      .then((books) => {
        cache = books;
        inFlight = null;
        return books;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
  }
  return inFlight;
}

/**
 * @param {boolean} enabled fetch only once the menu is actually opened
 * @returns {{books: object[]|null, status: "idle"|"loading"|"ready"|"error"}}
 */
export function useBooks(enabled = true) {
  const [state, setState] = useState(() => {
    const ready = getBible().books || cache;
    return ready
      ? { books: ready, status: "ready" }
      : { books: null, status: "idle" };
  });

  useEffect(() => {
    if (!enabled || state.status === "ready") return;
    let cancelled = false;
    setState({ books: null, status: "loading" });
    loadBooks(import.meta.env.BASE_URL).then(
      (books) => !cancelled && setState({ books, status: "ready" }),
      () => !cancelled && setState({ books: null, status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, state.status]);

  return state;
}

export default useBooks;
