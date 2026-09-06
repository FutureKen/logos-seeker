import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import CopyButton from "./CopyButton.jsx";
import VerseText from "./VerseText.jsx";
import OutlineHeading from "./OutlineHeading.jsx";
import BookInfoCard from "./BookInfoCard.jsx";
import RefTooltip from "./RefTooltip.jsx";
import { useSelectPulse } from "../hooks/useSelectPulse.js";
import { pickHalf } from "../hooks/useStudyChapter.js";
import { isMidVerse, outlineForChapter } from "../hooks/useStudyBook.js";
import { COL } from "../search.js";
import { textFor, verseKey } from "../lib/format.js";
import { tr } from "../lib/i18n.js";

/** Scroll `el` to just below the sticky search bar. */
function scrollBelowSearchBar(el) {
  const form = document.getElementById("search-form");
  const offset = (form ? form.offsetHeight : 0) + 8;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

/**
 * One language line of an interlinear verse (text only, no reference). With
 * study on, each line carries the markers of *its own* language half.
 */
function InterlinearLine({ row, which, book, apparatus, heads, study, onMarker }) {
  const cn = which === "cn";
  const text = cn ? row[COL.CN] : row[COL.EN];
  if (cn && !text) {
    return (
      <span className="il-line cn">
        <span className="il-text">
          <span className="alt-note">{row[COL.EN]} (EN)</span>
        </span>
      </span>
    );
  }
  return (
    <span className={cn ? "il-line cn" : "il-line"}>
      <span className="il-text">
        <VerseText
          text={text}
          book={book}
          verseNo={row[COL.VERSE]}
          showNumber={false}
          apparatus={apparatus}
          heads={heads}
          study={study}
          onMarker={onMarker}
        />
      </span>
    </span>
  );
}

function ChapterVerse({
  row,
  lang,
  interlinear,
  selected,
  focused,
  onToggleSelect,
  onCopy,
  study = false,
  apparatus = null,
  heads = null,
  ilStudy = null,
  onMarker,
  onVerseNumber,
}) {
  const t = tr(lang);
  const pop = useSelectPulse(selected);
  const vn = row[COL.VERSE];
  const book = row[COL.BOOK];
  const cls =
    "verse chapter-verse" +
    (interlinear ? " interlinear" : lang === "cn" ? " cn" : "") +
    (selected ? " selected" : "") +
    (focused ? " focused" : "") +
    (pop ? " just-selected" : "");
  const hasApparatus =
    study &&
    !!(
      apparatus?.m?.length ||
      ilStudy?.en?.apparatus?.m?.length ||
      ilStudy?.cn?.apparatus?.m?.length
    );

  return (
    <article className={cls} data-verse-no={vn}>
      <CopyButton onCopy={onCopy} label={t.copyAria} title={t.copy} />
      {interlinear ? (
        <span className="text il-stack" onClick={onToggleSelect}>
          {hasApparatus && onVerseNumber ? (
            <button
              type="button"
              className="vnum vnum-btn"
              onClick={(e) => {
                e.stopPropagation();
                // The interlinear number opens the sheet on the English half,
                // which is the line it sits against.
                onVerseNumber(ilStudy?.en?.apparatus ? "en" : "cn");
              }}
            >
              {vn}
            </button>
          ) : (
            <span className="vnum">{vn}</span>
          )}
          <span className="il-lines">
            <InterlinearLine
              row={row}
              which="en"
              book={book}
              study={study}
              apparatus={ilStudy?.en?.apparatus}
              heads={ilStudy?.en?.heads}
              onMarker={(i) => onMarker?.(i, ilStudy?.en?.half ?? "en")}
            />
            <InterlinearLine
              row={row}
              which="cn"
              book={book}
              study={study}
              apparatus={ilStudy?.cn?.apparatus}
              heads={ilStudy?.cn?.heads}
              onMarker={(i) => onMarker?.(i, ilStudy?.cn?.half ?? "cn")}
            />
          </span>
        </span>
      ) : (
        <span className="text" onClick={onToggleSelect}>
          <VerseText
            text={textFor(row, lang)}
            book={book}
            verseNo={vn}
            apparatus={apparatus}
            heads={heads}
            study={study}
            onMarker={onMarker}
            onVerseNumber={onVerseNumber}
          />
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
  onGoto,
  study = false,
  studyState = "off",
  chapterStudy = null,
  bookStudy = null,
  onOpenSheet,
}) {
  const t = tr(lang);
  const rootRef = useRef(null);
  const [focused, setFocused] = useState(null);
  const focusTimer = useRef(null);

  /* ---------------------------- study apparatus ---------------------------- */
  // Either half may still be missing while the two pipelines run at different
  // speeds, so fall back to the language that *is* there and mark it.
  const ch = useMemo(
    () => (study ? pickHalf(chapterStudy, lang) : { lang: null, half: null, fallback: false }),
    [study, chapterStudy, lang],
  );
  const bk = useMemo(
    () => (study ? pickHalf(bookStudy, lang) : { lang: null, half: null, fallback: false }),
    [study, bookStudy, lang],
  );

  // Outline entries anchored in this chapter, grouped by verse. Interlinear
  // needs one grouping per language, because the split positions differ.
  const outline = useMemo(
    () => (bk.lang ? outlineForChapter(bookStudy, chapter, bk.lang) : new Map()),
    [bookStudy, chapter, bk.lang],
  );
  const outlineEn = useMemo(
    () => (study && interlinear ? outlineForChapter(bookStudy, chapter, "en") : new Map()),
    [study, interlinear, bookStudy, chapter],
  );
  const outlineCn = useMemo(
    () => (study && interlinear ? outlineForChapter(bookStudy, chapter, "cn") : new Map()),
    [study, interlinear, bookStudy, chapter],
  );

  const openSheet = (req) =>
    onOpenSheet?.({ book, chapter, lang: ch.lang ?? bk.lang ?? lang, ...req });

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
      {study ? <RefTooltip containerRef={rootRef} lang={ch.lang ?? lang} /> : null}
      <div className="chapter-title">
        <span>
          {bookName} {chapter}
          {study && (ch.fallback || bk.fallback) ? (
            <span className="alt-note"> {t.altApparatus(ch.lang || bk.lang)}</span>
          ) : null}
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
          {study ? (
            <>
              <button
                type="button"
                id="outline-btn"
                className="il-toggle study-btn"
                onClick={() => openSheet({ kind: "outline" })}
              >
                {t.outline}
              </button>
              <button
                type="button"
                id="book-info-btn"
                className="il-toggle study-btn"
                onClick={() => openSheet({ kind: "book" })}
              >
                {t.bookInfo}
              </button>
            </>
          ) : null}
        </span>
      </div>
      {study && studyState === "loading" ? (
        <div className="study-status">{t.studyLoading}</div>
      ) : null}
      {study && studyState === "error" ? (
        <div className="study-status">{t.studyError}</div>
      ) : null}
      {study && chapter === 1 && bk.half?.info ? (
        <BookInfoCard
          info={bk.half.info}
          lang={bk.lang}
          onGoto={onGoto}
          onNote={(note) =>
            openSheet({
              kind: "verse",
              book: note[0],
              chapter: note[1],
              verse: note[2],
              focus: { note: note[3] },
            })
          }
        />
      ) : null}
      {study ? (outline.get(0) ?? []).map((e, i) => (
        <OutlineHeading key={`c0-${i}`} entry={e} book={book} />
      )) : null}
      {verses.map((row) => {
        const key = verseKey(row);
        const vn = row[COL.VERSE];
        const apparatus = study ? ch.half?.verses?.[String(vn)] ?? null : null;
        const entries = study ? outline.get(vn) ?? [] : [];
        const blocks = entries.filter((e) => !isMidVerse(e));
        const heads = entries.filter(isMidVerse);
        const ilStudy =
          study && interlinear
            ? {
                en: {
                  apparatus: chapterStudy?.en?.verses?.[String(vn)] ?? null,
                  heads: (outlineEn.get(vn) ?? []).filter(isMidVerse),
                },
                cn: {
                  apparatus: chapterStudy?.cn?.verses?.[String(vn)] ?? null,
                  heads: (outlineCn.get(vn) ?? []).filter(isMidVerse),
                },
              }
            : null;
        return (
          <Fragment key={key}>
            {blocks.map((e, i) => (
              <OutlineHeading key={`b${i}`} entry={e} book={book} />
            ))}
            <ChapterVerse
              row={row}
              lang={lang}
              interlinear={interlinear}
              selected={selected.has(key)}
              focused={focused === vn}
              onToggleSelect={() => onToggleSelect(key)}
              onCopy={() => onCopy(row)}
              study={study}
              apparatus={apparatus}
              heads={heads}
              ilStudy={ilStudy}
              onMarker={(i, half) =>
                openSheet({ kind: "verse", verse: vn, focus: { marker: i }, lang: half ?? ch.lang ?? lang })
              }
              onVerseNumber={(half) =>
                openSheet({ kind: "verse", verse: vn, lang: half ?? ch.lang ?? lang })
              }
            />
          </Fragment>
        );
      })}
    </div>
  );
}
