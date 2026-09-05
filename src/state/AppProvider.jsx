import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { StudyStore } from "../study/studyStore.js";
import { readLS, writeLS } from "../hooks/useLocalStorage.js";
import { SIZE, clampSize, defaultScheme, isFont, isScheme } from "../lib/style.js";
import { parseHash } from "../hooks/useHashQuery.js";

/** Keyword matches revealed per "More results" click. */
export const PAGE_SIZE = 20;

/**
 * The whole application state lives here: one reducer, one context. Views are
 * described declaratively (`view`), never as retained DOM, so the back button
 * can restore an earlier list by replaying the state that produced it.
 *
 * @typedef {{kind:"results"} | {kind:"chapter", book:number, chapter:number,
 *   focusVerse:number|null, scroll:"verse"|"top"|"none", nonce:number}} View
 */

const AppContext = createContext(null);

/**
 * The colour scheme to start from: the one the reader picked, else whatever the
 * pre-paint script in index.html already put on the page, else the default for
 * the OS setting (sepia in a light environment).
 */
function initialScheme() {
  const saved = readLS("ls-theme");
  if (isScheme(saved)) return { scheme: saved, explicit: true };
  const attr = globalThis.document?.documentElement?.getAttribute("data-theme");
  if (isScheme(attr)) return { scheme: attr, explicit: false };
  const light = globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches;
  return { scheme: defaultScheme(light), explicit: false };
}

export function initState() {
  const { scheme, explicit } = initialScheme();
  const savedFont = readLS("ls-font");
  const hash = parseHash(globalThis.location?.hash ?? "");
  const query = hash.kind === "q" ? hash.query : "";
  return {
    lang: readLS("ls-lang") === "cn" ? "cn" : "en",
    scheme,
    schemeExplicit: explicit,
    font: isFont(savedFont) ? savedFont : "system",
    fontSize: clampSize(readLS("ls-font-size") ?? SIZE.default),
    interlinear: readLS("ls-interlinear") === "1",
    /** The Notes toggle. Only meaningful once `unlocked`. */
    study: readLS("ls-study") === "1",
    unlocked: false,
    /** Raw text in the search box (may be mid-typing). */
    input: query,
    /** The committed query the results reflect. */
    query,
    /** @type {View} */
    view:
      hash.kind === "c"
        ? {
            kind: "chapter",
            book: hash.book,
            chapter: hash.chapter,
            focusVerse: hash.verse,
            scroll: "verse",
            nonce: 1,
          }
        : { kind: "results" },
    /** Stack of places the back button returns to. */
    navStack: [],
    /** Selected verses, keyed "book:chapter:verse". */
    selected: new Set(),
    wordShown: PAGE_SIZE,
    /** Scroll position to restore after the next render (back button). */
    pendingScroll: null,
    seq: 1,
  };
}

export function reducer(state, a) {
  switch (a.type) {
    case "input":
      return { ...state, input: a.input };

    case "search": {
      const query = (a.query ?? "").trim();
      // A genuinely new query drops the selection; a language toggle re-running
      // the same query keeps it.
      const selected = query === state.query ? state.selected : new Set();
      return {
        ...state,
        query,
        input: a.input ?? state.input,
        view: { kind: "results" },
        navStack: [],
        wordShown: PAGE_SIZE,
        selected,
      };
    }

    case "lang":
      if (a.lang !== "en" && a.lang !== "cn") return state;
      return { ...state, lang: a.lang };

    case "scheme":
      if (!isScheme(a.scheme)) return state;
      return { ...state, scheme: a.scheme, schemeExplicit: a.explicit !== false };

    case "font":
      if (!isFont(a.font)) return state;
      return { ...state, font: a.font };

    case "font-size":
      return { ...state, fontSize: clampSize(a.size) };

    case "interlinear":
      return { ...state, interlinear: a.value ?? !state.interlinear };

    case "study":
      return { ...state, study: !!a.value };

    case "unlocked":
      return { ...state, unlocked: !!a.value };

    case "lock":
      return { ...state, unlocked: false, study: false };

    case "chapter": {
      const view = {
        kind: "chapter",
        book: a.book,
        chapter: a.chapter,
        focusVerse: a.focusVerse ?? null,
        scroll: a.scroll ?? "verse",
        nonce: state.seq + 1,
      };
      const navStack = a.push
        ? [
            ...state.navStack,
            { view: state.view, wordShown: state.wordShown, scrollY: a.scrollY ?? 0 },
          ]
        : state.navStack;
      return { ...state, view, navStack, seq: state.seq + 1 };
    }

    case "back": {
      if (!state.navStack.length) return state;
      const navStack = state.navStack.slice();
      const entry = navStack.pop();
      // Restoring must not re-run the chapter's "land on the verse" scroll —
      // the remembered scroll position wins.
      const view =
        entry.view.kind === "chapter"
          ? { ...entry.view, scroll: "none", nonce: state.seq + 1 }
          : entry.view;
      return {
        ...state,
        view,
        navStack,
        wordShown: entry.wordShown,
        pendingScroll: entry.scrollY,
        seq: state.seq + 1,
      };
    }

    case "select": {
      const selected = new Set(state.selected);
      if (selected.has(a.key)) selected.delete(a.key);
      else selected.add(a.key);
      return { ...state, selected };
    }

    case "clear-select":
      return state.selected.size ? { ...state, selected: new Set() } : state;

    case "more":
      return { ...state, wordShown: state.wordShown + PAGE_SIZE };

    case "scrolled":
      return state.pendingScroll == null ? state : { ...state, pendingScroll: null };

    default:
      return state;
  }
}

export function AppProvider({ children, initial }) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => ({
    ...initState(),
    ...i,
  }));

  // One StudyStore for the app's lifetime; the unlock gate hands it the key.
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = new StudyStore(import.meta.env.BASE_URL);
  const store = storeRef.current;

  const actions = useMemo(
    () => ({
      setInput: (input) => dispatch({ type: "input", input }),
      search: (query, extra) => dispatch({ type: "search", query, ...extra }),
      setLang: (lang) => dispatch({ type: "lang", lang }),
      setScheme: (scheme, explicit = true) => dispatch({ type: "scheme", scheme, explicit }),
      setFont: (font) => dispatch({ type: "font", font }),
      setFontSize: (size) => dispatch({ type: "font-size", size }),
      setInterlinear: (value) => dispatch({ type: "interlinear", value }),
      toggleInterlinear: () => dispatch({ type: "interlinear" }),
      setStudy: (value) => dispatch({ type: "study", value }),
      setUnlocked: (value) => dispatch({ type: "unlocked", value }),
      lock: () => dispatch({ type: "lock" }),
      openChapter: (opts) =>
        dispatch({ type: "chapter", scrollY: window.scrollY, ...opts }),
      back: () => dispatch({ type: "back" }),
      toggleSelect: (key) => dispatch({ type: "select", key }),
      clearSelection: () => dispatch({ type: "clear-select" }),
      showMore: () => dispatch({ type: "more" }),
      scrolled: () => dispatch({ type: "scrolled" }),
    }),
    [],
  );

  /* --------------------------- persistence --------------------------- */

  useEffect(() => {
    writeLS("ls-lang", state.lang);
    document.documentElement.lang = state.lang === "cn" ? "zh" : "en";
  }, [state.lang]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", state.scheme);
    // Keep the browser/status-bar colour on the scheme the page is painted in.
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(root).getPropertyValue("--color-bg").trim();
    if (meta && bg) meta.setAttribute("content", bg);
    // Only an explicit choice is remembered, so an unset preference keeps
    // following the OS.
    if (state.schemeExplicit) writeLS("ls-theme", state.scheme);
  }, [state.scheme, state.schemeExplicit]);

  useEffect(() => {
    document.documentElement.setAttribute("data-font", state.font);
    writeLS("ls-font", state.font);
  }, [state.font]);

  useEffect(() => {
    document.documentElement.style.setProperty("--reading-size", `${state.fontSize}px`);
    writeLS("ls-font-size", String(state.fontSize));
  }, [state.fontSize]);

  useEffect(() => {
    writeLS("ls-interlinear", state.interlinear ? "1" : "0");
  }, [state.interlinear]);

  useEffect(() => {
    writeLS("ls-study", state.study ? "1" : "0");
  }, [state.study]);

  // Follow the OS setting while the reader has not picked a scheme explicitly.
  useEffect(() => {
    if (state.schemeExplicit) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq?.addEventListener) return;
    const onChange = (e) =>
      dispatch({ type: "scheme", scheme: defaultScheme(e.matches), explicit: false });
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [state.schemeExplicit]);

  const value = useMemo(
    () => ({ state, dispatch, actions, store }),
    [state, actions, store],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** @returns {{state: any, dispatch: Function, actions: any, store: StudyStore}} */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export default AppProvider;
