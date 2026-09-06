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

/**
 * The text sizes on offer. A pixel at a time while the text is small, where one
 * pixel is a visible difference, then two at a time once it is large, where it
 * is not — so the slider stays a short, usable ladder rather than a long one.
 */
export const SIZES = [14, 15, 16, 17, 18, 20, 22, 24, 26, 28];

export const SIZE = { min: SIZES[0], max: SIZES[SIZES.length - 1], default: 16 };

/** Sepia is the default in a light environment; the dark palette in a dark one. */
export function defaultScheme(prefersLight) {
  return prefersLight ? "sepia" : "dark";
}

export const isScheme = (v) => SCHEMES.includes(v);
export const isFont = (v) => FONTS.includes(v);

/** The nearest size on the ladder — a tie goes to the larger one. */
export function clampSize(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SIZE.default;
  if (n <= SIZE.min) return SIZE.min;
  if (n >= SIZE.max) return SIZE.max;
  return SIZES.reduce((best, size) =>
    Math.abs(size - n) <= Math.abs(best - n) ? size : best,
  );
}

/** Where a size sits on the ladder, which is what the slider runs along. */
export function sizeIndex(v) {
  return SIZES.indexOf(clampSize(v));
}

/** One rung up (+1) or down (-1), stopping at the ends. */
export function stepSize(v, delta) {
  const i = sizeIndex(v) + delta;
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, i))];
}
