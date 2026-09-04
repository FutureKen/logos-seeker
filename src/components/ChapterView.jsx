import { useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton.jsx";
import { useSelectPulse } from "../hooks/useSelectPulse.js";
import { COL } from "../search.js";
import { textFor, verseKey } from "../lib/format.js";
import { tr } from "../lib/i18n.js";

/**
 * ===========================================================================
 *  STUDY SLOT — subtask D replaces `PlainVerseText` with `VerseText.jsx`
 * ===========================================================================
 * The plain renderer used until the study apparatus lands. It takes the subset
 * of `<VerseText>`'s props that a text-only render needs (see
 * `src/components/contracts.md`), so swapping the import through is a one-line
 * change in `ChapterVerse` below.
 */
function PlainVerseText({ text, verseNo, showNumber = true }) {
  return (
    <>
      {showNumber ? <span className="vnum">{verseNo}</span> : null}
      {text}
    </>
  );
}

/** Scroll `el` to just below the sticky search bar. */
function scrollBelowSearchBar(el) {
  const form = document.getElementById("search-form");
  const offset = (form ? form.offsetHeight : 0) + 8;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

/** One language line of an interlinear verse (text only, no reference). */
function InterlinearLine({ row, which }) {
  if (which === "cn") {
    return (
      <span className="il-line cn">
        <span className="il-text">
          {row[COL.CN] ? (
            row[COL.CN]
          ) : (
            <span className="alt-note">{row[COL.EN]} (EN)</span>
          )}
        </span>
      </span>
    );
  }
  return (
    <span className="il-line">
      <span className="il-text">{row[COL.EN]}</span>
    </span>
  );
}

function ChapterVerse({ row, lang, interlinear, selected, focused, onToggleSelect, onCopy }) {
  const t = tr(lang);
  const pop = useSelectPulse(selected);
  const vn = row[COL.VERSE];
  const cls =
    "verse chapter-verse" +
    (interlinear ? " interlinear" : lang === "cn" ? " cn" : "") +
    (selected ? " selected" : "") +
    (focused ? " focused" : "") +
    (pop ? " just-selected" : "");

  return (
    <article className={cls} data-verse-no={vn}>
      <CopyButton onCopy={onCopy} label={t.copyAria} title={t.copy} />
      {interlinear ? (
        <span className="text il-stack" onClick={onToggleSelect}>
          <span className="vnum">{vn}</span>
          <span className="il-lines">
            <InterlinearLine row={row} which="en" />
            <InterlinearLine row={row} which="cn" />
          </span>
        </span>
      ) : (
        <span className="text" onClick={onToggleSelect}>
          {/* STUDY SLOT: <VerseText …/> goes here (subtask D). */}
          <PlainVerseText text={textFor(row, lang)} lang={lang} verseNo={vn} study={false} />
        </span>
      )}
    </article>
  );
}

/**
 * The full-chapter reading view: title, prev/next, the Interlinear toggle and
 * every verse of the chapter.
 *
 * See `src/components/contracts.md` for the props contract shared with D.
 */
export default function ChapterView({
  book,
  chapter,
  bookName,
  verses,
  lang,
  interlinear = false,
  focusVerse = null,
  scroll = "verse",
  scrollKey = 0,
  selected,
  onToggleSelect,
  onCopy,
  canPrev = false,
  canNext = false,
  onPrev,
  onNext,
  onToggleInterlinear,
}) {
  const t = tr(lang);
  const rootRef = useRef(null);
  const [focused, setFocused] = useState(null);
  const focusTimer = useRef(null);

  // Land on the verse that was tapped (verse 1 and "no focus" start at the
  // chapter heading instead); prev/next go to the top; a restored view and the
  // interlinear re-render do not move at all.
  useEffect(() => {
    setFocused(null);
    if (scroll === "none") return;
    if (scroll === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const firstVerse = verses[0]?.[COL.VERSE];
    const target =
      focusVerse != null && focusVerse !== firstVerse
        ? rootRef.current?.querySelector(`[data-verse-no="${focusVerse}"]`)
        : null;
    if (target) {
      scrollBelowSearchBar(target);
      setFocused(focusVerse);
      clearTimeout(focusTimer.current);
      focusTimer.current = setTimeout(() => setFocused(null), 2000);
    } else {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter, scrollKey]);

  useEffect(() => () => clearTimeout(focusTimer.current), []);

  // ←/→ jump between chapters, but not while the search box has the cursor and
  // not when a modifier is held (Alt+← is the browser's own Back).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.key === "ArrowLeft") {
        if (canPrev) onPrev?.();
      } else if (canNext) onNext?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canPrev, canNext, onPrev, onNext]);

  return (
    <div className="chapter-block" ref={rootRef}>
      <div className="chapter-title">
        <span>
          {bookName} {chapter}
        </span>
        <span className="chapter-tools">
          <button
            type="button"
            id="prev-chapter"
            className="nav-btn"
            aria-label={t.prevChapter}
            title={t.prevChapter}
            disabled={!canPrev}
            onClick={onPrev}
          >
            &#8592;
          </button>
          <button
            type="button"
            id="next-chapter"
            className="nav-btn"
            aria-label={t.nextChapter}
            title={t.nextChapter}
            disabled={!canNext}
            onClick={onNext}
          >
            &#8594;
          </button>
          <button
            type="button"
            id="interlinear-toggle"
            className={`il-toggle${interlinear ? " active" : ""}`}
            aria-pressed={interlinear}
            onClick={onToggleInterlinear}
          >
            {t.interlinear}
          </button>
        </span>
      </div>
      {verses.map((row) => {
        const key = verseKey(row);
        return (
          <ChapterVerse
            key={key}
            row={row}
            lang={lang}
            interlinear={interlinear}
            selected={selected.has(key)}
            focused={focused === row[COL.VERSE]}
            onToggleSelect={() => onToggleSelect(key)}
            onCopy={() => onCopy(row)}
          />
        );
      })}
    </div>
  );
}
