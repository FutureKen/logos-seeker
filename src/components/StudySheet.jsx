import { useEffect, useRef, useState } from "react";
import { useStudyChapter, pickHalf } from "../hooks/useStudyChapter.js";
import { useStudyBook } from "../hooks/useStudyBook.js";
import { formatRef } from "../study/refFormat.js";
import { tr } from "../lib/i18n.js";
import RichText from "./RichText.jsx";
import RefTooltip from "./RefTooltip.jsx";
import { refAttr } from "../study/refText.js";
import VerseText from "./VerseText.jsx";
import BookInfoCard from "./BookInfoCard.jsx";

/**
 * The study sheet: a native `<dialog>` that is a centred panel on the desktop
 * and a bottom sheet on a phone (see `.study-sheet` in styles.css).
 *
 * Three tabs over the same book: the notes and cross-references of one verse,
 * the book outline, and the book's introductory info. It reads its own data
 * from the shared `StudyStore` (via the study hooks) rather than taking it as
 * props, because a `{note}` link inside a note may point at a *different*
 * chapter, which then has to be fetched.
 *
 * See `src/components/contracts.md`.
 */
export default function StudySheet({
  open,
  request,
  lang,
  bookByIdx,
  getVerseText,
  onClose,
  onGoto,
  onNavState,
}) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const [req, setReq] = useState(request ?? null);
  const [tab, setTab] = useState(request?.kind ?? "verse");
  const [sheetLang, setSheetLang] = useState(request?.lang ?? lang);
  const t = tr(lang);
  const ts = tr(sheetLang);

  // A new request re-points the sheet, selects the matching tab and resets the
  // sheet language: `request.lang` is the half the tapped marker belongs to,
  // which is not always the display language (an interlinear line, or a chapter
  // whose half in the display language has not been built yet).
  useEffect(() => {
    if (!request) return;
    setReq(request);
    setTab(request.kind);
    setSheetLang(request.lang ?? lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // The sheet moves under the reader's feet — another note, another tab,
  // the other language — so it reports where it stands. Following a reference
  // out of here remembers that, and coming back puts it up again unchanged.
  useEffect(() => {
    if (!open || !req) return;
    onNavState?.({ req, tab, lang: sheetLang });
  }, [open, req, tab, sheetLang, onNavState]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  const hasVerse = req?.verse != null;
  const chapter = useStudyChapter(
    req?.book ?? null,
    req?.chapter ?? null,
    open && hasVerse,
  );
  const bookRes = useStudyBook(req?.book ?? null, open);

  const ch = pickHalf(chapter.data, sheetLang);
  const bk = pickHalf(bookRes.data, sheetLang);

  const apparatus = hasVerse
    ? ch.half?.verses?.[String(req.verse)] ?? null
    : null;
  const verseText = hasVerse
    ? getVerseText?.(req.book, req.chapter, req.verse, ch.lang ?? sheetLang) ?? ""
    : "";

  const focus = focusIndex(apparatus, req?.focus);

  // Land on the card the marker points at (or the top of the list otherwise).
  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;
    const card = body.querySelector(".note-card.focused");
    if (card) card.scrollIntoView({ block: "start" });
    else body.scrollTop = 0;
  }, [open, tab, req, chapter.status, bookRes.status, sheetLang]);

  function goto(ref) {
    onClose?.();
    onGoto?.(ref);
  }

  /** A `{note}` run: show that note, fetching its chapter if need be. */
  function openNote(note) {
    if (!Array.isArray(note)) return;
    const [b, c, v, num] = note;
    setReq({ kind: "verse", book: b, chapter: c, verse: v, focus: { note: num } });
    setTab("verse");
  }

  const bookName = bookByIdx?.get?.(req?.book);
  const bookLabel = bookName ? (sheetLang === "cn" ? bookName.cn || bookName.en : bookName.en) : "";
  const title =
    req == null
      ? ts.studySheet
      : tab === "book"
        ? bookLabel
        : tab === "outline"
          ? `${bookLabel} ${req.chapter ?? ""}`.trim()
          : hasVerse
            ? formatRef([req.book, req.chapter, req.verse, 0], sheetLang, bookByIdx)
            : bookLabel;

  const fallbackLang =
    (tab === "verse" && ch.fallback && ch.lang) || (tab !== "verse" && bk.fallback && bk.lang);

  return (
    <dialog
      ref={dialogRef}
      className="study-sheet"
      aria-label={ts.studySheet}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
    >
      <div className="sheet-head">
        <div className="sheet-head-top">
          <span className="sheet-title">
            {title}
            {fallbackLang ? (
              <span className="alt-note sheet-alt"> {ts.altApparatus(fallbackLang)}</span>
            ) : null}
          </span>
          <span className="sheet-head-tools">
            <span className="sheet-lang" role="group" aria-label={t.langGroup}>
              <button
                type="button"
                className={sheetLang === "en" ? "active" : ""}
                aria-pressed={sheetLang === "en"}
                onClick={() => setSheetLang("en")}
              >
                EN
              </button>
              <button
                type="button"
                className={sheetLang === "cn" ? "active" : ""}
                aria-pressed={sheetLang === "cn"}
                onClick={() => setSheetLang("cn")}
              >
                中
              </button>
            </span>
            <button
              type="button"
              className="clear-btn help-close"
              aria-label={ts.close}
              title={ts.close}
              onClick={onClose}
            >
              ×
            </button>
          </span>
        </div>
        <div className="sheet-tabs" role="tablist">
          <Tab id="verse" tab={tab} setTab={setTab} disabled={!hasVerse}>
            {ts.tabVerse}
          </Tab>
          <Tab id="outline" tab={tab} setTab={setTab}>
            {ts.tabOutline}
          </Tab>
          <Tab id="book" tab={tab} setTab={setTab}>
            {ts.tabBook}
          </Tab>
        </div>
      </div>

      <div className="sheet-body" ref={bodyRef}>
        {tab === "verse" ? (
          <VerseTab
            req={req}
            apparatus={apparatus}
            text={verseText}
            halfLang={ch.lang ?? sheetLang}
            status={chapter.status}
            focus={focus}
            ts={ts}
            onMarker={(i) => setReq((r) => ({ ...r, focus: { marker: i } }))}
            onGoto={goto}
            onNote={openNote}
          />
        ) : null}
        {tab === "outline" ? (
          <OutlineTab
            outline={bk.half?.outline}
            book={req?.book}
            chapter={req?.chapter}
            status={bookRes.status}
            ts={ts}
            onGoto={goto}
          />
        ) : null}
        {tab === "book" ? (
          <BookTab
            info={bk.half?.info}
            lang={sheetLang}
            status={bookRes.status}
            ts={ts}
            onGoto={goto}
            onNote={openNote}
          />
        ) : null}
      </div>
      {/* Inside the dialog: a tooltip elsewhere would paint under the modal. */}
      <RefTooltip containerRef={bodyRef} lang={sheetLang} />
    </dialog>
  );
}

function Tab({ id, tab, setTab, disabled, children }) {
  return (
    <button
      type="button"
      role="tab"
      className={`sheet-tab${tab === id ? " active" : ""}`}
      aria-selected={tab === id}
      disabled={disabled}
      onClick={() => setTab(id)}
    >
      {children}
    </button>
  );
}

/** Which card a request points at: an explicit marker, a note number, a letter. */
function focusIndex(apparatus, focus) {
  const m = apparatus?.m;
  if (!Array.isArray(m) || !focus) return -1;
  if (focus.marker != null) return focus.marker;
  if (focus.note != null) {
    return m.findIndex((mk) => mk.n != null && String(mk.n) === String(focus.note));
  }
  if (focus.xref != null) return m.findIndex((mk) => mk.x === focus.xref);
  return -1;
}

/* ------------------------------- Verse tab ------------------------------- */

function VerseTab({ req, apparatus, text, halfLang, status, focus, ts, onMarker, onGoto, onNote }) {
  if (status === "loading") return <p className="sheet-status">{ts.studyLoading}</p>;
  if (status === "error") return <p className="sheet-status">{ts.studyError}</p>;

  const markers = apparatus?.m ?? [];
  return (
    <>
      <div className={`sheet-verse${halfLang === "cn" ? " cn" : ""}`}>
        <VerseText
          text={text}
          verseNo={req?.verse}
          showNumber={false}
          apparatus={apparatus}
          study
          onMarker={onMarker}
        />
      </div>
      {markers.length ? (
        markers.map((mk, i) => (
          <NoteCard
            key={i}
            marker={mk}
            index={i}
            markers={markers}
            apparatus={apparatus}
            text={text}
            halfLang={halfLang}
            focused={i === focus}
            ts={ts}
            onGoto={onGoto}
            onNote={onNote}
          />
        ))
      ) : (
        <p className="sheet-status">{ts.noVerseNotes}</p>
      )}
    </>
  );
}

/** The anchor word a marker sits on: English carries it, Chinese slices it. */
function anchorWord(marker, text, halfLang) {
  if (halfLang !== "cn") return marker.w ?? "";
  if (marker.p == null) return "";
  return String(text ?? "").slice(marker.p, marker.p + 2);
}

function NoteCard({
  marker,
  index,
  markers,
  apparatus,
  text,
  halfLang,
  focused,
  ts,
  onGoto,
  onNote,
}) {
  const xrefs = marker.x != null ? apparatus?.x?.[marker.x] : null;
  const note = marker.n != null ? apparatus?.n?.[String(marker.n)] : null;
  // A repeat marker points back at a note already printed above, so print the
  // prose once and cross-reference it the second time.
  const first =
    marker.n == null
      ? index
      : markers.findIndex((mk) => mk.n != null && String(mk.n) === String(marker.n));
  const repeat = marker.n != null && first < index;
  const word = anchorWord(marker, text, halfLang);

  return (
    <div className={`note-card${focused ? " focused" : ""}`} data-card={index}>
      <div className="nc-head">
        <span className="nc-label">{marker.l}</span>
        {word ? <span className="nc-word">{word}</span> : null}
      </div>
      {xrefs?.length ? <XrefChips items={xrefs} ts={ts} onGoto={onGoto} /> : null}
      {repeat ? (
        <p className="nc-repeat">{ts.sameNote(marker.n)}</p>
      ) : note ? (
        <RichText rich={note} onGoto={onGoto} onNote={onNote} className="nc-note" />
      ) : null}
    </div>
  );
}

/**
 * Cross-reference chips. "cf." (参) introduces a *run* of comparison
 * references, so it is printed once in front of the run, not on every chip.
 */
function XrefChips({ items, ts, onGoto }) {
  return (
    <div className="xrefs">
      {items.map((it, i) => (
        <span className="xref-item" key={i}>
          {it.cf && !items[i - 1]?.cf ? <span className="cf-prefix">{ts.cf}</span> : null}
          <button
            type="button"
            className="xref-chip"
            data-ref={refAttr(it.r)}
            onClick={(e) => {
              e.stopPropagation();
              onGoto?.(it.r);
            }}
          >
            {it.t}
          </button>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ Outline tab ------------------------------ */

function OutlineTab({ outline, book, chapter, status, ts, onGoto }) {
  if (status === "loading") return <p className="sheet-status">{ts.studyLoading}</p>;
  if (!outline?.length) {
    return <p className="sheet-status">{status === "error" ? ts.studyError : ts.noOutline}</p>;
  }
  return (
    <div className="outline-list">
      {outline.map((e, i) => {
        const current = e.start?.[0] === chapter;
        return (
          <div
            key={i}
            className={`otl-item otl-l${e.level || 1}${current ? " current" : ""}`}
            style={{ paddingLeft: `${((e.level || 1) - 1) * 14}px` }}
          >
            <button
              type="button"
              className="otl-btn"
              onClick={() => onGoto?.([book, e.start?.[0] ?? 1, e.start?.[1] || 1, 0])}
            >
              {e.label ? <span className="otl-label">{e.label}</span> : null}
              <span className="otl-title">{e.title}</span>
              <span className="otl-range">
                {e.start?.[0]}:{e.start?.[1] || 1}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------- Book tab -------------------------------- */

function BookTab({ info, lang, status, ts, onGoto, onNote }) {
  if (status === "loading") return <p className="sheet-status">{ts.studyLoading}</p>;
  if (!info) {
    return <p className="sheet-status">{status === "error" ? ts.studyError : ts.noBookInfo}</p>;
  }
  return <BookInfoCard info={info} lang={lang} onGoto={onGoto} onNote={onNote} />;
}
