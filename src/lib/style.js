/**
 * Reading-style options: colour scheme, typeface and text size.
 *
 * Only the *ids* live here. Every palette and font stack is defined in
 * `styles.css` under `[data-theme="…"]` and `[data-font="…"]`, so the pre-paint
 * script in index.html can apply a saved choice by setting one attribute,
 * without a copy of the colours or the font stacks having to exist in JavaScript.
 */

/** Dark first, then the light ones, as they are offered in the dialog. */
export const SCHEMES = ["light", "sepia", "gray", "dark", "black"];

/** Which schemes are light, for choosing a default from the OS preference. */
export const LIGHT_SCHEMES = new Set(["light", "sepia", "gray"]);

export const FONTS = ["system", "serif", "sans", "book", "kai"];

export const SIZE = { min: 14, max: 24, step: 1, default: 16 };

/** Sepia is the default in a light environment; the dark palette in a dark one. */
export function defaultScheme(prefersLight) {
  return prefersLight ? "sepia" : "dark";
}

export const isScheme = (v) => SCHEMES.includes(v);
export const isFont = (v) => FONTS.includes(v);

export function clampSize(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SIZE.default;
  return Math.min(SIZE.max, Math.max(SIZE.min, Math.round(n)));
}
