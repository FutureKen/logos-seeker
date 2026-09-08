import { useEffect, useRef, useState } from "react";

/**
 * The browser's Back button, lent to the app's own return arrows.
 *
 * Back cannot be intercepted; the only way to be asked about it is to have an
 * entry of one's own on the history stack. So while there is anywhere to
 * return to — a note the reader followed a `{note}` link from, or the chapter
 * they left by a reference — one guard entry sits at the top of the stack, at
 * the very same URL as the page it guards. Pressing Back pops it, we hear the
 * `popstate`, and we take one step back inside the app instead of leaving it;
 * if there is still further to go, the effect below lays the guard again.
 *
 * The reverse matters just as much: when the reader returns by the in-app arrow
 * the guard has nothing left to protect, so we quietly take it off the stack
 * again (`selfPop`), rather than leaving an entry behind that would swallow a
 * later Back press doing nothing.
 *
 * Two things are deliberately left rough. A guard buried under a later push (a
 * search run from a chapter reached by a reference) is abandoned where it lies
 * rather than chased; and two Back presses in the same frame can outrun the
 * re-push and leave the app, which is the reader asking to leave anyway.
 *
 * @param {boolean} canReturn   is there a step for Back to take?
 * @param {() => void} onReturn take exactly one step back.
 */
export function useBackGuard(canReturn, onReturn) {
  const [guarded, setGuarded] = useState(false);
  const selfPop = useRef(false);
  const ret = useRef(onReturn);
  ret.current = onReturn;

  useEffect(() => {
    if (typeof window === "undefined" || !window.history) return;
    if (canReturn && !guarded) {
      setGuarded(true);
      window.history.pushState({ lsGuard: true }, "", window.location.href);
    } else if (!canReturn && guarded) {
      setGuarded(false);
      // Only if it is still ours to take: anything pushed on top of it (a new
      // search) has made the entry someone else's problem.
      if (window.history.state?.lsGuard) {
        selfPop.current = true;
        window.history.back();
      }
    }
  }, [canReturn, guarded]);

  useEffect(() => {
    function onPop() {
      const wasGuard = guarded;
      setGuarded(false);
      if (selfPop.current) {
        selfPop.current = false;
        return;
      }
      // Not our entry: a genuine history move, which the hash sync answers.
      if (!wasGuard) return;
      ret.current?.();
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [guarded]);
}

export default useBackGuard;
