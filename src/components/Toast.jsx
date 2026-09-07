import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";

const ToastContext = createContext(null);

/** How long a message stays up. */
const TOAST_MS = 1600;

const noop = () => {};

/**
 * `showToast(text)` — a no-op outside a provider, so a component that only
 * confirms an action can still be rendered on its own.
 */
export function useToast() {
  return useContext(ToastContext) ?? noop;
}

/**
 * The transient confirmation strip at the foot of the page ("Verse copied").
 * One at a time: a new message replaces whatever is up and restarts the clock.
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const seq = useRef(0);

  const show = useCallback((text) => {
    if (!text) return;
    seq.current += 1;
    setToast({ text, id: seq.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <Toast key={toast.id} text={toast.text} /> : null}
    </ToastContext.Provider>
  );
}

function Toast({ text }) {
  const { state } = useApp();
  const ref = useRef(null);

  // The study sheet is a modal <dialog>, which paints in the top layer above
  // everything else on the page — so copying a footnote would confirm itself
  // out of sight. A popover joins that same layer, which puts the message back
  // on top. Where the browser has no popover the element still renders; it is
  // only the sheet that would then cover it.
  useEffect(() => {
    const el = ref.current;
    if (typeof el?.showPopover !== "function") return;
    el.setAttribute("popover", "manual");
    try {
      el.showPopover();
    } catch {
      el.removeAttribute("popover");
    }
  }, []);

  return (
    <div
      ref={ref}
      // Clear of the selection bar, which shares this corner of the screen.
      className={`toast${state.selected.size >= 2 ? " lifted" : ""}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

export default ToastProvider;
