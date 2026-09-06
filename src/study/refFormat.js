/**
 * Display formatting for language-neutral `Ref = [book, chapter, verse, verseEnd]`.
 */

/**
 * @param {[number, number, number, number]} ref
 * @param {"en"|"cn"} lang
 * @param {Map<number, {en: string, cn: string}>} bookByIdx
 * @returns {string} e.g. `"John 1:1-2"`, `"约翰福音 1:1-2"`, `"John 1"`
 */
export function formatRef(ref, lang = "en", bookByIdx) {
  if (!Array.isArray(ref)) return "";
  const [b, c, v, ve] = ref;
  const meta = bookByIdx?.get?.(b);
  const name = meta ? (lang === "cn" ? meta.cn : meta.en) : `#${b}`;
  if (!v) return `${name} ${c}`;
  return ve && ve !== v ? `${name} ${c}:${v}-${ve}` : `${name} ${c}:${v}`;
}

/**
 * Stable navigation key for a reference — book, chapter and starting verse
 * (`verse 0` = the whole chapter). Ranges collapse to their first verse, which
 * is the verse the chapter view scrolls to.
 * @param {[number, number, number, number]} ref
 */
export function refKey(ref) {
  if (!Array.isArray(ref)) return "";
  const [b, c, v] = ref;
  return `${b}:${c}:${v || 0}`;
}
