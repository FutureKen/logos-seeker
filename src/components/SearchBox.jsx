import { useEffect, useRef } from "react";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

const DEBOUNCE_MS = 220;

/** Sticky search bar: input, "back to results", and the clear button. */
export default function SearchBox() {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  const inputRef = useRef(null);
  const timer = useRef(null);
  const hasBack = state.navStack.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearTimeout(timer.current);
  }, []);

  function onChange(e) {
    const value = e.target.value;
    actions.setInput(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => actions.search(value), DEBOUNCE_MS);
  }

  function onSubmit(e) {
    e.preventDefault();
    clearTimeout(timer.current);
    actions.search(state.input);
  }

  function clearSearch() {
    clearTimeout(timer.current);
    actions.setInput("");
    actions.search("");
    inputRef.current?.focus();
  }

  return (
    <form id="search-form" autoComplete="off" onSubmit={onSubmit}>
      <div className={`search-box${hasBack ? " has-back" : ""}`}>
        <input
          id="q"
          ref={inputRef}
          type="text"
          value={state.input}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === "Escape" && state.input) {
              e.preventDefault();
              clearSearch();
            }
          }}
          placeholder={t.placeholder}
          aria-label={t.searchAria}
          enterKeyHint="search"
        />
        {hasBack ? (
          <button
            id="back-to-results"
            type="button"
            className="back-btn"
            aria-label={t.back}
            title={t.back}
            onClick={actions.back}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        {state.input ? (
          <button
            id="clear"
            type="button"
            className="clear-btn"
            aria-label={t.clearAria}
            title={t.clear}
            onClick={clearSearch}
          >
            ×
          </button>
        ) : null}
      </div>
    </form>
  );
}
