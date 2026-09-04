import { useEffect, useState } from "react";
import { BibleSearch } from "../search.js";

/**
 * One `BibleSearch` for the whole app. Module scope (not a ref) so React's
 * StrictMode double-mount, and any future remount, reuse the same loaded index
 * instead of fetching the 7.5 MB verse file twice.
 */
let instance = null;

export function getBible() {
  if (!instance) instance = new BibleSearch();
  return instance;
}

/** Test seam: drop the singleton so each test file starts clean. */
export function resetBible() {
  instance = null;
}

/**
 * Load the verse data lazily — exactly like the old app, which only fetched on
 * the first search — and report progress to the caller.
 * @param {boolean} enabled start loading (i.e. the user has searched)
 * @returns {{bs: BibleSearch, ready: boolean, error: Error|null}}
 */
export function useBible(enabled = true) {
  const bs = getBible();
  const [state, setState] = useState(() => ({
    ready: bs.verses != null,
    error: null,
  }));

  useEffect(() => {
    if (!enabled || bs.verses) {
      if (bs.verses && !state.ready) setState({ ready: true, error: null });
      return;
    }
    let cancelled = false;
    bs.load(import.meta.env.BASE_URL).then(
      () => !cancelled && setState({ ready: true, error: null }),
      (error) => !cancelled && setState({ ready: false, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, bs, state.ready]);

  return { bs, ready: state.ready, error: state.error };
}

export default useBible;
