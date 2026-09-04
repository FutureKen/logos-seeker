import { useEffect, useRef, useState } from "react";

/** The copy glyph shared by every verse row. */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * Copy button with the transient "copied" state (a green outline for ~0.9 s).
 * `onCopy` may be async; it decides whether to copy this verse or the whole
 * selection.
 */
export default function CopyButton({ onCopy, label, title }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handle(e) {
    e.stopPropagation();
    await onCopy?.();
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 900);
  }

  return (
    <button
      type="button"
      className={`copy-btn${copied ? " copied" : ""}`}
      onClick={handle}
      aria-label={label}
      title={title}
    >
      <CopyIcon />
    </button>
  );
}
