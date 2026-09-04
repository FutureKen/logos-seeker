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

function initialTheme() {
  const saved = readLS("ls-theme");
  if (saved === "light" || saved === "dark") return { theme: saved, explicit: true };
  const attr = globalThis.document?.documentElement?.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return { theme: attr, explicit: false };
  const light = globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches;
  return { theme: light ? "light" : "dark", explicit: false };
}

export function initState() {
  const { theme, explicit } = initialTheme();
  const hash = parseHash(globalThis.location?.hash ?? "");
  const query = hash.kind === "q" ? hash.query : "";
  return {
    lang: readLS("ls-lang") === "cn" ? "cn" : "en",
    theme,
    themeExplicit: explicit,
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

    case "theme":
      return { ...state, theme: a.theme, themeExplicit: a.explicit !== false };

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
      setTheme: (theme, explicit = true) => dispatch({ type: "theme", theme, explicit }),
      toggleTheme: () =>
        dispatch({
          type: "theme",
          theme:
            document.documentElement.getAttribute("data-theme") === "light"
              ? "dark"
              : "light",
          explicit: true,
        }),
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
    document.documentElement.setAttribute("data-theme", state.theme);
    // Only an explicit choice is remembered, so an unset preference keeps
    // following the OS.
    if (state.themeExplicit) writeLS("ls-theme", state.theme);
  }, [state.theme, state.themeExplicit]);

  useEffect(() => {
    writeLS("ls-interlinear", state.interlinear ? "1" : "0");
  }, [state.interlinear]);

  useEffect(() => {
    writeLS("ls-study", state.study ? "1" : "0");
  }, [state.study]);

  // Follow the OS theme while the user has not picked one explicitly.
  useEffect(() => {
    if (state.themeExplicit) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq?.addEventListener) return;
    const onChange = (e) =>
      dispatch({ type: "theme", theme: e.matches ? "light" : "dark", explicit: false });
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [state.themeExplicit]);

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
