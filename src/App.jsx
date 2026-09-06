import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AppProvider, { useApp } from "./state/AppProvider.jsx";
import { useBible } from "./hooks/useBible.js";
import { useHashQuery } from "./hooks/useHashQuery.js";
import { readLS, writeLS } from "./hooks/useLocalStorage.js";
import { useStudyChapter } from "./hooks/useStudyChapter.js";
import { useStudyBook } from "./hooks/useStudyBook.js";
import { checkVerify, importKey } from "./study/studyCrypto.js";
import { COL } from "./search.js";
import { tr } from "./lib/i18n.js";
import { textFor, verseToText, writeClipboard } from "./lib/format.js";
import TopBar from "./components/TopBar.jsx";
import SearchBox from "./components/SearchBox.jsx";
import StatusLine from "./components/StatusLine.jsx";
import Results from "./components/Results.jsx";
import ChapterView from "./components/ChapterView.jsx";
import StudySheet from "./components/StudySheet.jsx";
import DeselectButton from "./components/DeselectButton.jsx";
import Footer from "./components/Footer.jsx";

/**
 * Turn the committed query into a description of what to show. Pure: the same
 * query always yields the same result, which is what lets the back button
 * restore a list by replaying state rather than caching markup.
 */
export function computeResult(bs, ready, query) {
  if (!query) return { kind: "hint" };
  if (!ready) return { kind: "loading" };

  const parsed = bs.parse(query);

  if (parsed.type === "ref" && parsed.fuzzy) {
    const items = [];
    for (const c of parsed.candidates) {
      if (c.verse == null) {
        // whole-chapter option → a jump row pointing at verse 1 of that chapter
        const i = bs.refMap.get(`${c.bookIdx}:${c.chapter}:1`);
        if (i != null) items.push({ kind: "chapter", rowIdx: i, chapter: c.chapter });
      } else {
        const i = bs.refMap.get(`${c.bookIdx}:${c.chapter}:${c.verse}`);
        if (i != null) {
          items.push({
            kind: "verse",
            rowIdx: i,
            key: `${c.bookIdx}:${c.chapter}:${c.verse}`,
          });
        }
      }
    }
    if (!items.length) return { kind: "notfound" };
    return { kind: "fuzzy", items, bookIdx: parsed.bookIdx };
  }

  if (parsed.type === "ref") {
    const rows = bs.lookupReference(parsed);
    if (!rows.length) return { kind: "notfound" };
    if (parsed.verse == null) return { kind: "chapter", row: rows[0] };
    return { kind: "ref", rows, total: rows.length };
  }

  // English queries need at least 2 characters; Chinese has no minimum.
  if (parsed.lang === "en" && parsed.term.replace(/\s+/g, "").length < 2) {
    return { kind: "minchars" };
  }
  // The word search follows the language of the query, not the toggle, and the
  // full match list is requested so the UI can page through it locally.
  const { rows } = bs.wordSearch(parsed.term, parsed.lang, Infinity);
  if (!rows.length) return { kind: "empty" };
  return { kind: "word", rows, term: parsed.term, lang: parsed.lang };
}

function statusFor(result, state, t, error) {
  if (error) return t.loadFailed;
  switch (result.kind) {
    case "loading":
      return t.loadingData;
    case "ref":
      return t.results(result.total);
    case "word":
      return t.showing(Math.min(state.wordShown, result.rows.length), result.rows.length);
    case "fuzzy":
      return t.possible(result.items.length);
    default:
      return "";
  }
}

function bookName(bs, bookIdx, lang) {
  const b = bs.bookByIdx?.get(bookIdx);
  if (!b) return "";
  return lang === "cn" ? b.cn || b.en : b.en;
}

function Shell() {
  const { state, actions, store } = useApp();
  const t = tr(state.lang);
  const inChapterView = state.view.kind === "chapter";
  const { bs, ready, error } = useBible(state.query !== "" || inChapterView);

  useHashQuery(state, actions);

  /* ----------------------- the study gate on startup ----------------------- */
  useEffect(() => {
    const stored = readLS("ls-study-key");
    if (!stored) return;
    let cancelled = false;
    (async () => {
      let key;
      try {
        key = await importKey(stored);
      } catch {
        writeLS("ls-study-key", null);
        return;
      }
      let ok = true;
      try {
        const index = await store.loadIndex();
        ok = await checkVerify(index?.verify, key);
      } catch {
        // Offline (or no manifest published yet): trust the stored key rather
        // than locking a reader out of data already on the device.
        ok = true;
      }
      if (cancelled) return;
      if (!ok) {
        writeLS("ls-study-key", null);
        return;
      }
      store.setKey(key);
      actions.setUnlocked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [store, actions]);

  /* ------------------------------- results ------------------------------- */
  const result = useMemo(
    () => (error ? { kind: "error" } : computeResult(bs, ready, state.query)),
    [bs, ready, state.query, error],
  );

  // A Chinese query always searches Chinese text (and vice versa), so follow it
  // with the display language rather than showing text the reader did not ask for.
  useEffect(() => {
    if (result.kind === "word" && result.lang !== state.lang) actions.setLang(result.lang);
  }, [result, state.lang, actions]);

  /* ------------------------------- chapter ------------------------------- */
  // Either an explicitly opened chapter, or a whole-chapter query ("John 1"),
  // which the vanilla app also rendered as a chapter instead of a list.
  const chapterRef = useMemo(() => {
    if (inChapterView) {
      const v = state.view;
      return {
        book: v.book,
        chapter: v.chapter,
        focusVerse: v.focusVerse,
        scroll: v.scroll,
        scrollKey: v.nonce,
      };
    }
    if (result.kind === "chapter") {
      const row = bs.verses[result.row];
      return {
        book: row[COL.BOOK],
        chapter: row[COL.CHAP],
        focusVerse: null,
        scroll: "verse",
        scrollKey: state.query,
      };
    }
    return null;
  }, [inChapterView, state.view, state.query, result, bs]);

  const chapterData = useMemo(() => {
    if (!chapterRef || !ready) return null;
    const idxs = bs.lookupReference({
      bookIdx: chapterRef.book,
      chapter: chapterRef.chapter,
      verse: null,
    });
    if (!idxs.length) return null;
    return {
      rows: idxs.map((i) => bs.verses[i]),
      prevRow: bs.siblingChapterRow(idxs[0], -1),
      nextRow: bs.siblingChapterRow(idxs[0], 1),
    };
  }, [bs, ready, chapterRef]);

  /* -------------------------- the study apparatus -------------------------- */
  // Nothing here fetches until the data is unlocked *and* the Notes toggle is
  // on, so the locked app is exactly the text-only app.
  const studyOn = state.unlocked && state.study && chapterRef != null;
  const chapterStudy = useStudyChapter(
    chapterRef?.book ?? null,
    chapterRef?.chapter ?? null,
    studyOn,
  );
  const bookStudy = useStudyBook(chapterRef?.book ?? null, studyOn);
  const [sheet, setSheet] = useState({ open: false, request: null });
  // The sheet's own live state (which note, which tab, which language), kept in
  // a ref so following a reference can put it on the nav stack.
  const sheetState = useRef(null);

  const studyState = !studyOn
    ? "off"
    : chapterStudy.status === "error"
      ? "error"
      : chapterStudy.status === "loading" || bookStudy.status === "loading"
        ? "loading"
        : chapterStudy.status;

  // The sheet shows the verse itself above its notes, and a `{note}` link can
  // point at any chapter, so it needs a way to look up verse text on demand.
  const getVerseText = useCallback(
    (b, c, v, l) => {
      const i = bs.refMap?.get(`${b}:${c}:${v}`);
      if (i == null) return "";
      return textFor(bs.verses[i], l);
    },
    [bs],
  );

  /**
   * A reference link (note, cross-reference, outline entry, book info): close
   * the sheet, remember where we are, and land on the target verse. A
   * chapter-only reference lands at the top of the chapter, i.e. on verse 1.
   */
  const goto = useCallback(
    (ref) => {
      if (!Array.isArray(ref)) return;
      const openSheet = sheet.open ? sheetState.current : null;
      setSheet((s) => (s.open ? { ...s, open: false } : s));
      const [b, c, v] = ref;
      let focusVerse = v || null;
      if (bs.refMap) {
        if (focusVerse != null && bs.refMap.get(`${b}:${c}:${v}`) == null) focusVerse = null;
        if (
          focusVerse == null &&
          bs.refMap.get(`${b}:${c}:1`) == null &&
          bs.refMap.get(`${b}:${c}:0`) == null
        ) {
          return; // no such chapter — better to stay put than to blank the view
        }
      }
      actions.openChapter({
        book: b,
        chapter: c,
        focusVerse,
        scroll: "verse",
        push: true,
        sheet: openSheet,
      });
    },
    [bs, actions, sheet.open],
  );

  // Going back reopens the sheet that was up when the reader followed a
  // reference away, on the same note, tab and language.
  const pendingSheet = state.pendingSheet;
  useEffect(() => {
    if (!pendingSheet) return;
    if (pendingSheet.close || !pendingSheet.req) {
      setSheet((s) => (s.open ? { ...s, open: false } : s));
      return;
    }
    setSheet({
      open: true,
      request: { ...pendingSheet.req, kind: pendingSheet.tab, lang: pendingSheet.lang },
    });
  }, [pendingSheet]);

  const goSibling = useCallback(
    (rowIdx) => {
      if (rowIdx == null) return;
      const row = bs.verses[rowIdx];
      actions.openChapter({
        book: row[COL.BOOK],
        chapter: row[COL.CHAP],
        focusVerse: null,
        scroll: "top",
        push: false,
      });
    },
    [bs, actions],
  );

  const openChapterForRow = useCallback(
    (rowIdx) => {
      const row = bs.verses[rowIdx];
      actions.openChapter({
        book: row[COL.BOOK],
        chapter: row[COL.CHAP],
        focusVerse: row[COL.VERSE],
        scroll: "verse",
        push: true,
      });
    },
    [bs, actions],
  );

  /* -------------------------------- copy -------------------------------- */
  const copy = useCallback(
    async (row) => {
      const il = state.interlinear && chapterRef != null;
      let text;
      if (state.selected.size > 0) {
        const idxs = [...state.selected]
          .map((k) => bs.refMap.get(k))
          .filter((i) => i != null)
          .sort((a, b) => a - b);
        text = idxs.map((i) => verseToText(bs, bs.verses[i], state.lang, il)).join("\n");
      } else {
        text = verseToText(bs, row, state.lang, il);
      }
      await writeClipboard(text);
    },
    [bs, state.selected, state.lang, state.interlinear, chapterRef],
  );

  /* --------------------- scroll restore (back button) --------------------- */
  useLayoutEffect(() => {
    if (state.pendingScroll == null) return;
    // Instant, not smooth: going back should feel like returning, not travelling.
    window.scrollTo({ top: state.pendingScroll });
    actions.scrolled();
  }, [state.pendingScroll, actions]);

  const status = chapterRef ? "" : statusFor(result, state, t, error);

  return (
    <>
      <TopBar />
      <main>
        <SearchBox />
        <StatusLine text={status} />
        <div id="results" className="results">
          {chapterRef && chapterData ? (
            <ChapterView
              book={chapterRef.book}
              chapter={chapterRef.chapter}
              bookName={bookName(bs, chapterRef.book, state.lang)}
              verses={chapterData.rows}
              lang={state.lang}
              interlinear={state.interlinear}
              focusVerse={chapterRef.focusVerse}
              scroll={chapterRef.scroll}
              scrollKey={chapterRef.scrollKey}
              selected={state.selected}
              onToggleSelect={actions.toggleSelect}
              onCopy={copy}
              canPrev={chapterData.prevRow != null}
              canNext={chapterData.nextRow != null}
              onPrev={() => goSibling(chapterData.prevRow)}
              onNext={() => goSibling(chapterData.nextRow)}
              onToggleInterlinear={actions.toggleInterlinear}
              onGoto={goto}
              study={studyOn}
              studyState={studyState}
              chapterStudy={chapterStudy.data}
              bookStudy={bookStudy.data}
              onOpenSheet={(request) => setSheet({ open: true, request })}
            />
          ) : (
            <Results
              result={
                result.kind === "fuzzy"
                  ? { ...result, bookName: bookName(bs, result.bookIdx, state.lang) }
                  : result
              }
              bs={bs}
              lang={state.lang}
              selected={state.selected}
              wordShown={state.wordShown}
              onOpenChapter={openChapterForRow}
              onToggleSelect={actions.toggleSelect}
              onCopy={copy}
              onShowMore={actions.showMore}
            />
          )}
        </div>
      </main>
      {state.unlocked && state.study ? (
        <StudySheet
          open={sheet.open}
          request={sheet.request}
          lang={state.lang}
          bookByIdx={bs.bookByIdx}
          getVerseText={getVerseText}
          onClose={() => setSheet((s) => ({ ...s, open: false }))}
          onGoto={goto}
          onNavState={(st) => {
            sheetState.current = st;
          }}
        />
      ) : null}
      <DeselectButton />
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
