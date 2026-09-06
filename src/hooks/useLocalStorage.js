import { useCallback, useState } from "react";

/**
 * `localStorage` access that never throws (private mode, disabled storage,
 * SSR/tests without a DOM) — every read falls back to `fallback`.
 */
export function readLS(key, fallback = null) {
  try {
    const v = globalThis.localStorage?.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function writeLS(key, value) {
  try {
    if (value == null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable — the app works, it just forgets */
  }
}

/**
 * A string-valued preference backed by `localStorage`.
 * @returns {[string, (v: string|null) => void]}
 */
export function useLocalStorage(key, initial = "") {
  const [value, setValue] = useState(() => readLS(key, initial));
  const set = useCallback(
    (v) => {
      setValue(v ?? initial);
      writeLS(key, v);
    },
    [key, initial],
  );
  return [value, set];
}

export default useLocalStorage;
