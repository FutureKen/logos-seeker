/**
 * app.js — UI controller for Logos Seeker.
 * Wires the omni search bar, EN/CN toggle, result rendering (with match
 * highlighting and chapter expansion), and shareable URL-hash state.
 */

import { BibleSearch, COL } from "./search.js";
import { hasCJK } from "./parseQuery.js";

const bs = new BibleSearch();
let lang = localStorage.getItem("ls-lang") === "cn" ? "cn" : "en";
let lastQuery = ""; // remember the active query for re-render on toggle

const $q = document.getElementById("q");
const $form = document.getElementById("search-form");
const $clear = document.getElementById("clear");
const $status = document.getElementById("status");
const $results = document.getElementById("results");
const $toggle = document.querySelector(".lang-toggle");
const $themeToggle = document.getElementById("theme-toggle");

const PAGE_SIZE = 20; // keyword matches shown per page

// Holds the active keyword-search result set so "More results" can page through
// it without re-running the search.
let wordResults = { rows: [], term: "", shown: 0 };

/* ----------------------------- helpers ----------------------------- */

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight matches of `term` inside `text` (case-insensitive). For multi-word
 * queries, each word/segment is highlighted independently (any order/position),
 * matching the AND search semantics. Longer parts are tried first so an exact
 * full-phrase match wins over its individual words.
 */
function highlight(text, term) {
  const safe = escapeHtml(text);
  if (!term || !term.trim()) return safe;

  // Split into parts: whitespace-separated tokens, plus the full phrase so a
  // consecutive match is highlighted as one span when present.
  const parts = term.trim().split(/\s+/).filter(Boolean);
  const all = parts.length > 1 ? [term.trim(), ...parts] : parts;
  // Longest first so "one spirit" is matched before "one"/"spirit".
  const uniq = [...new Set(all)].sort((a, b) => b.length - a.length);

  try {
    const re = new RegExp(uniq.map((p) => escapeRegExp(escapeHtml(p))).join("|"), "gi");
    return safe.replace(re, (m) => `<mark>${m}</mark>`);
  } catch {
    return safe;
  }
}

function textFor(row) {
  if (lang === "cn") return row[COL.CN] || row[COL.EN];
  return row[COL.EN];
}

/** True when this row has no Chinese text (rare versification gaps). */
function cnMissing(row) {
  return lang === "cn" && !row[COL.CN];
}

function setStatus(msg) {
  $status.textContent = msg || "";
}

/* ----------------------------- rendering ----------------------------- */

// SVG copy glyph (shared by every row's copy button).
const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
  '<rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

// Set of currently selected verse row indices. Cleared on each new search.
const selected = new Set();

// Interlinear mode interleaves EN + CN per verse; only used in chapter view.
let interlinear = localStorage.getItem("ls-interlinear") === "1";
// Row index of the chapter currently shown (so the interlinear toggle can
// re-render it); null when not in chapter view.
let currentChapterRow = null;

const $deselect = document.getElementById("deselect-all");

function selClass(rowIdx) {
  return selected.has(rowIdx) ? " selected" : "";
}

/**
 * One compact verse row: [copy] [ref] text — on a single line.
 * The ref is clickable to switch to the full-chapter view.
 */
function verseRow(rowIdx, term) {
  const row = bs.verses[rowIdx];
  const ref = bs.refLabel(row, lang);
  const body = highlight(textFor(row), term);
  const note = cnMissing(row)
    ? ` <span class="alt-note">${lang === "cn" ? "（英文分节）" : "(EN versification)"}</span>`
    : "";
  return `
    <article class="verse ${lang === "cn" ? "cn" : ""}${selClass(rowIdx)}" data-idx="${rowIdx}">
      <button class="copy-btn" data-copy="${rowIdx}" aria-label="${
        lang === "cn" ? "复制经文" : "Copy verse"
      }" title="${lang === "cn" ? "复制" : "Copy"}">${COPY_ICON}</button>
      <span class="ref" data-row="${rowIdx}" title="${
        lang === "cn" ? "查看整章" : "Show full chapter"
      }">${escapeHtml(ref)}</span>
      <span class="text" data-select="${rowIdx}">${body}${note}</span>
    </article>`;
}

/** Render reference results (verse or range) — small, shown all at once. */
function renderResults(rowIdxs, total, term) {
  currentChapterRow = null; // not in chapter view
  wordResults = { rows: [], term: "", shown: 0 };
  if (!rowIdxs.length) {
    $results.innerHTML = `<p class="empty">${
      lang === "cn" ? "未找到结果。" : "No results found."
    }</p>`;
    return;
  }
  $results.innerHTML = rowIdxs.map((i) => verseRow(i, term)).join("");
  setStatus(
    lang === "cn" ? `共 ${total} 处匹配` : `${total} ${total === 1 ? "result" : "results"}`
  );
}

/**
 * Render keyword-search results in pages of PAGE_SIZE, with a "More results"
 * button to reveal the next page. `rows` is the full match list.
 */
function renderWordResults(rows, term) {
  currentChapterRow = null; // not in chapter view
  if (!rows.length) {
    wordResults = { rows: [], term: "", shown: 0 };
    $results.innerHTML = `<p class="empty">${
      lang === "cn" ? "未找到结果。" : "No results found."
    }</p>`;
    setStatus("");
    return;
  }
  wordResults = { rows, term, shown: 0 };
  $results.innerHTML = "";
  showMoreWordResults();
}

/** Append the next page of keyword results (and refresh the More button). */
function showMoreWordResults() {
  const { rows, term, shown } = wordResults;
  const next = rows.slice(shown, shown + PAGE_SIZE);
  const frag = next.map((i) => verseRow(i, term)).join("");

  const existingBtn = document.getElementById("more-results");
  if (existingBtn) existingBtn.remove();
  $results.insertAdjacentHTML("beforeend", frag);
  wordResults.shown = shown + next.length;

  const total = rows.length;
  const remaining = total - wordResults.shown;
  if (remaining > 0) {
    const label =
      lang === "cn"
        ? `更多结果（还有 ${remaining}）`
        : `More results (${remaining} more)`;
    $results.insertAdjacentHTML(
      "beforeend",
      `<button type="button" id="more-results" class="more-btn">${label}</button>`
    );
  }
  setStatus(
    lang === "cn"
      ? `显示 ${wordResults.shown} / 共 ${total} 处匹配`
      : `Showing ${wordResults.shown} of ${total} ${total === 1 ? "match" : "matches"}`
  );
  syncSelectionUI();
}

/** A single language line inside an interlinear verse (text only, no ref). */
function interlinearLine(row, which) {
  const langCode = which; // "en" | "cn"
  const txt =
    langCode === "cn"
      ? row[COL.CN]
        ? escapeHtml(row[COL.CN])
        : `<span class="alt-note">${escapeHtml(row[COL.EN])} (EN)</span>`
      : escapeHtml(row[COL.EN]);
  return `<div class="il-line ${langCode === "cn" ? "cn" : ""}">
    <span class="il-text">${txt}</span>
  </div>`;
}

function renderChapter(rowIdx, { scroll = true } = {}) {
  const rows = bs.chapterRowsForRow(rowIdx);
  if (!rows.length) return;
  currentChapterRow = rowIdx;
  const first = bs.verses[rows[0]];
  const book = bs.bookByIdx.get(first[COL.BOOK]);
  const title = `${lang === "cn" ? book.cn || book.en : book.en} ${first[COL.CHAP]}`;

  const verses = rows
    .map((i) => {
      const r = bs.verses[i];
      const vn = r[COL.VERSE];
      if (interlinear) {
        return `<article class="verse chapter-verse interlinear${selClass(i)}" data-idx="${i}">
          <button class="copy-btn" data-copy="${i}" aria-label="Copy verse" title="Copy">${COPY_ICON}</button>
          <span class="text il-stack" data-select="${i}">
            <span class="vnum">${vn}</span>
            <span class="il-lines">${interlinearLine(r, "en")}${interlinearLine(r, "cn")}</span>
          </span>
        </article>`;
      }
      const txt = escapeHtml(textFor(r));
      return `<article class="verse chapter-verse ${lang === "cn" ? "cn" : ""}${selClass(i)}" data-idx="${i}">
        <button class="copy-btn" data-copy="${i}" aria-label="${
          lang === "cn" ? "复制经文" : "Copy verse"
        }" title="${lang === "cn" ? "复制" : "Copy"}">${COPY_ICON}</button>
        <span class="text" data-select="${i}"><span class="vnum">${vn}</span>${txt}</span>
      </article>`;
    })
    .join("");

  const ilLabel = lang === "cn" ? "对照" : "Interlinear";
  const prevRow = bs.siblingChapterRow(rowIdx, -1);
  const nextRow = bs.siblingChapterRow(rowIdx, 1);
  const prevLabel = lang === "cn" ? "上一章" : "Previous chapter";
  const nextLabel = lang === "cn" ? "下一章" : "Next chapter";
  $results.innerHTML = `
    <div class="chapter-block">
      <div class="chapter-title">
        <span>${escapeHtml(title)}</span>
        <span class="chapter-tools">
          <button type="button" id="prev-chapter" class="nav-btn" aria-label="${prevLabel}"
            title="${prevLabel}"${prevRow == null ? " disabled" : ` data-row="${prevRow}"`}>&#8592;</button>
          <button type="button" id="next-chapter" class="nav-btn" aria-label="${nextLabel}"
            title="${nextLabel}"${nextRow == null ? " disabled" : ` data-row="${nextRow}"`}>&#8594;</button>
          <button type="button" id="interlinear-toggle" class="il-toggle${
            interlinear ? " active" : ""
          }" aria-pressed="${interlinear}">${ilLabel}</button>
        </span>
      </div>
      ${verses}
    </div>`;
  setStatus("");
  syncSelectionUI();
  if (scroll) $results.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Jump to the previous (dir=-1) or next (dir=+1) chapter, if one exists.
 * Used by both the on-screen arrows and the ←/→ keyboard shortcuts.
 */
function navigateChapter(dir) {
  if (currentChapterRow == null) return;
  const target = bs.siblingChapterRow(currentChapterRow, dir);
  if (target == null) return; // at the start/end of the canon
  renderChapter(target, { scroll: false });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Render the multiple interpretations of a fuzzy reference (e.g. "heb 111" →
 * Heb 1:11 and Heb 11:1). Verse candidates render as normal rows; whole-chapter
 * candidates render as a "jump to chapter" row.
 */
function renderFuzzy(parsed) {
  currentChapterRow = null; // not in chapter view
  const book = bs.bookByIdx.get(parsed.bookIdx);
  const rows = [];
  for (const c of parsed.candidates) {
    if (c.verse == null) {
      // whole-chapter option → a jump row pointing at verse 1 of that chapter
      const i = bs.refMap.get(`${c.bookIdx}:${c.chapter}:1`);
      if (i != null) rows.push({ kind: "chapter", rowIdx: i, chapter: c.chapter });
    } else {
      const i = bs.refMap.get(`${c.bookIdx}:${c.chapter}:${c.verse}`);
      if (i != null) rows.push({ kind: "verse", rowIdx: i });
    }
  }
  if (!rows.length) {
    $results.innerHTML = `<p class="empty">${
      lang === "cn" ? "未找到该处经文。" : "Reference not found."
    }</p>`;
    setStatus("");
    return;
  }

  const bookName = lang === "cn" ? book.cn || book.en : book.en;
  const html = rows
    .map((r) => {
      if (r.kind === "chapter") {
        const label = `${bookName} ${r.chapter}`;
        return `<article class="verse fuzzy-chapter">
          <span class="ref" data-row="${r.rowIdx}" title="${
            lang === "cn" ? "查看整章" : "Show full chapter"
          }">${escapeHtml(label)}</span>
          <span class="text muted">${
            lang === "cn" ? "整章 →" : "Whole chapter →"
          }</span>
        </article>`;
      }
      return verseRow(r.rowIdx, "");
    })
    .join("");
  $results.innerHTML = html;
  setStatus(
    lang === "cn"
      ? `多个可能的出处（${rows.length}）`
      : `${rows.length} possible references`
  );
}

/* ----------------------------- search flow ----------------------------- */

async function runSearch(raw, { pushHash = true } = {}) {
  const query = raw.trim();
  // Drop any selection when the query text actually changes (a language toggle
  // re-runs the same query and should preserve the current selection).
  if (query !== lastQuery) clearSelection();
  lastQuery = query;
  if (!query) {
    showHint();
    if (pushHash) location.hash = "";
    return;
  }

  setStatus(lang === "cn" ? "搜索中…" : "Searching…");
  try {
    await ensureLoaded();
  } catch (e) {
    setStatus(lang === "cn" ? "数据加载失败。" : "Failed to load Bible data.");
    return;
  }

  const parsed = bs.parse(query);
  if (parsed.type === "ref" && parsed.fuzzy) {
    renderFuzzy(parsed);
  } else if (parsed.type === "ref") {
    const rows = bs.lookupReference(parsed);
    if (!rows.length) {
      $results.innerHTML = `<p class="empty">${
        lang === "cn" ? "未找到该处经文。" : "Reference not found."
      }</p>`;
      setStatus("");
    } else if (rows.length === 1 && parsed.verse != null) {
      renderResults(rows, 1, "");
    } else if (parsed.verse == null) {
      // whole chapter
      renderChapter(rows[0]);
    } else {
      renderResults(rows, rows.length, "");
    }
  } else {
    // English queries need at least 2 characters; Chinese has no minimum.
    if (parsed.lang === "en" && parsed.term.replace(/\s+/g, "").length < 2) {
      currentChapterRow = null;
      wordResults = { rows: [], term: "", shown: 0 };
      $results.innerHTML = `<p class="hint">${
        lang === "cn"
          ? "英文搜索请至少输入 2 个字符。"
          : "Type at least 2 characters to search English text."
      }</p>`;
      setStatus("");
      if (pushHash) location.hash = "q=" + encodeURIComponent(query);
      return;
    }
    // Word search uses the language detected from the query, not the toggle,
    // so a Chinese query always searches Chinese text and vice-versa.
    // Request the full match list (Infinity) so the UI can page locally.
    const { rows } = bs.wordSearch(parsed.term, parsed.lang, Infinity);
    // If the query language differs from the display toggle, follow the query
    // so the user sees the text they searched in.
    if (parsed.lang !== lang) setLang(parsed.lang, { rerun: false });
    renderWordResults(rows, parsed.term);
  }

  syncSelectionUI();
  if (pushHash) location.hash = "q=" + encodeURIComponent(query);
}

let loaded = false;
async function ensureLoaded() {
  if (loaded) return;
  setStatus(lang === "cn" ? "首次加载经文数据…" : "Loading Bible data (first search)…");
  await bs.load("");
  loaded = true;
}

function showHint() {
  $results.innerHTML = `
    <div class="hint">
      ${
        lang === "cn"
          ? `输入经文出处（如 <code>约翰福音 1:1</code>、<code>约 1</code>）或任意字词（如 <code>基督</code>、<code>爱</code>）。`
          : `Type a reference like <code>John 1:1</code> or <code>John 1</code>, or any word like <code>Christ</code> or <code>love</code>.`
      }
    </div>`;
  setStatus("");
}

/* ----------------------------- theme ----------------------------- */

/** Resolve the active theme: saved preference, else the OS preference. */
function resolveTheme() {
  const saved = localStorage.getItem("ls-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if ($themeToggle) {
    $themeToggle.setAttribute(
      "aria-label",
      theme === "light" ? "Switch to dark mode" : "Switch to light mode"
    );
  }
}

function toggleTheme() {
  const next =
    document.documentElement.getAttribute("data-theme") === "light"
      ? "dark"
      : "light";
  localStorage.setItem("ls-theme", next);
  applyTheme(next);
}

/* ----------------------------- language ----------------------------- */

function setLang(next, { rerun = true } = {}) {
  if (next !== "en" && next !== "cn") return;
  lang = next;
  localStorage.setItem("ls-lang", lang);
  for (const btn of $toggle.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  }
  document.documentElement.lang = lang === "cn" ? "zh" : "en";
  // Re-render current results in the new language without re-searching.
  if (rerun && lastQuery) {
    runSearch(lastQuery, { pushHash: false });
  } else if (rerun && !lastQuery) {
    showHint();
  }
}

/* ----------------------------- copy / clear ----------------------------- */

/** Format a single verse row as "Reference  text".
 *  In interlinear chapter view, include both languages (EN line then CN line). */
function verseToText(rowIdx) {
  const row = bs.verses[rowIdx];
  if (interlinear && currentChapterRow != null) {
    const en = bs.bookByIdx.get(row[COL.BOOK]).en;
    const cn = bs.bookByIdx.get(row[COL.BOOK]).cn || en;
    const cv = `${row[COL.CHAP]}:${row[COL.VERSE]}`;
    const cnText = row[COL.CN] || row[COL.EN];
    return `${en} ${cv}  ${row[COL.EN]}\n${cn} ${cv}  ${cnText}`;
  }
  return `${bs.refLabel(row, lang)}  ${textFor(row)}`;
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-secure contexts.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    document.body.removeChild(ta);
  }
}

/**
 * Copy handler for a row's copy button. If any verses are selected, copy the
 * whole selection (in canonical order, one verse per line); otherwise copy just
 * the clicked verse.
 */
async function copyFromButton(rowIdx, btn) {
  let text;
  if (selected.size > 0) {
    const ordered = [...selected].sort((a, b) => a - b);
    text = ordered.map(verseToText).join("\n");
  } else {
    text = verseToText(rowIdx);
  }
  await writeClipboard(text);
  if (btn) {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 900);
  }
}

/* ----------------------------- selection ----------------------------- */

function toggleSelect(rowIdx) {
  const nowSelected = !selected.has(rowIdx);
  if (nowSelected) selected.add(rowIdx);
  else selected.delete(rowIdx);
  const el = $results.querySelector(`.verse[data-idx="${rowIdx}"]`);
  if (el) {
    el.classList.toggle("selected", nowSelected);
    if (nowSelected) {
      el.classList.remove("just-selected");
      void el.offsetWidth; // restart the animation if re-selected quickly
      el.classList.add("just-selected");
      setTimeout(() => el.classList.remove("just-selected"), 260);
    }
  }
  syncSelectionUI();
}

function clearSelection() {
  if (!selected.size) return;
  selected.clear();
  for (const el of $results.querySelectorAll(".verse.selected")) {
    el.classList.remove("selected");
  }
  syncSelectionUI();
}

/** Show/hide and label the floating "deselect all" button. */
function syncSelectionUI() {
  const n = selected.size;
  $deselect.hidden = n < 2;
  if (n >= 2) {
    $deselect.textContent =
      lang === "cn" ? `取消选择 (${n})` : `Deselect all (${n})`;
  }
}

/** Show/hide the clear button based on input content. */
function syncClearBtn() {
  $clear.hidden = $q.value.length === 0;
}

function clearSearch() {
  $q.value = "";
  syncClearBtn();
  clearTimeout(debounceTimer);
  runSearch("");
  $q.focus();
}

/* ----------------------------- events ----------------------------- */

let debounceTimer = null;
$q.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  syncClearBtn();
  const v = $q.value;
  debounceTimer = setTimeout(() => runSearch(v), 220);
});

// Esc clears the input (and results) when focused; X button does the same.
$q.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $q.value) {
    e.preventDefault();
    clearSearch();
  }
});
$clear.addEventListener("click", clearSearch);

$form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(debounceTimer);
  runSearch($q.value);
});

$toggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-lang]");
  if (btn) setLang(btn.dataset.lang);
});

$themeToggle.addEventListener("click", toggleTheme);

// If the OS theme changes and the user hasn't chosen one explicitly, follow it.
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (!localStorage.getItem("ls-theme")) applyTheme(resolveTheme());
});

$results.addEventListener("click", (e) => {
  // "More results" → reveal the next page of keyword matches.
  if (e.target.closest("#more-results")) {
    showMoreWordResults();
    return;
  }
  // Interlinear toggle (chapter view only) — re-render in place, no scroll.
  if (e.target.closest("#interlinear-toggle")) {
    interlinear = !interlinear;
    localStorage.setItem("ls-interlinear", interlinear ? "1" : "0");
    if (currentChapterRow != null) renderChapter(currentChapterRow, { scroll: false });
    return;
  }
  // Prev/next chapter arrows — navigate in place without nudging the scroll.
  if (e.target.closest("#prev-chapter")) return navigateChapter(-1);
  if (e.target.closest("#next-chapter")) return navigateChapter(1);
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    copyFromButton(Number(copyBtn.dataset.copy), copyBtn);
    return;
  }
  // Clicking a reference jumps to the full chapter.
  const refEl = e.target.closest("[data-row]");
  if (refEl) {
    renderChapter(Number(refEl.dataset.row));
    return;
  }
  // Clicking the verse text toggles selection.
  const selEl = e.target.closest("[data-select]");
  if (selEl) toggleSelect(Number(selEl.dataset.select));
});

$deselect.addEventListener("click", clearSelection);

// ←/→ keyboard shortcuts jump between chapters (chapter view only). Disabled
// while the search box is focused so arrow keys still move the text cursor,
// and ignored when a modifier is held (e.g. Alt+← = browser back).
document.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (currentChapterRow == null) return;
  const el = document.activeElement;
  if (el && (el === $q || el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
  e.preventDefault();
  navigateChapter(e.key === "ArrowLeft" ? -1 : 1);
});

window.addEventListener("hashchange", () => {
  const q = readHash();
  if (q !== lastQuery) {
    $q.value = q;
    syncClearBtn();
    runSearch(q, { pushHash: false });
  }
});

function readHash() {
  const h = location.hash.replace(/^#/, "");
  const m = /(?:^|&)q=([^&]*)/.exec(h);
  return m ? decodeURIComponent(m[1]) : "";
}

/* ----------------------------- init ----------------------------- */

// Apply the saved (or OS-derived) theme on first paint.
applyTheme(resolveTheme());

// Reflect saved language on first paint.
for (const btn of $toggle.querySelectorAll("button")) {
  btn.classList.toggle("active", btn.dataset.lang === lang);
}
document.documentElement.lang = lang === "cn" ? "zh" : "en";

const initial = readHash();
if (initial) {
  $q.value = initial;
  runSearch(initial, { pushHash: false });
} else {
  showHint();
}
syncClearBtn();
$q.focus();
