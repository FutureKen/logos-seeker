import { useEffect, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/** Far enough down that the button never flickers in and out while reading. */
const SHOW_AFTER = 320;

/**
 * Back to the top of a long chapter or result list.
 *
 * It sits over the text rather than beside it, so it stays mostly transparent
 * until the pointer is on it, and it is only there once the page has actually
 * been scrolled.
 */
export default function ScrollTop() {
  const { state } = useApp();
  const t = tr(state.lang);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // A scroll listener fires at most once a frame, and React re-renders only
    // when the boolean actually flips, so no throttling of our own is needed —
    // and none that depends on animation frames, which a background tab stops
    // delivering.
    const read = () => setShown(window.scrollY > SHOW_AFTER);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  if (!shown) return null;

  return (
    <button
      type="button"
      id="scroll-top"
      className="scroll-top"
      aria-label={t.scrollTop}
      title={t.scrollTop}
      onClick={() => {
        const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M12 19V6m0 0-6 6m6-6 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
