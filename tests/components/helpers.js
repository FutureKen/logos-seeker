// Shared jsdom shims for the component tests: the browser APIs the UI touches
// that jsdom either omits (scrollIntoView) or refuses to implement (scrollTo).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function installDomStubs() {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

/** A clipboard we can read back in assertions. */
export function installClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

/** Serve `public/data/**` from disk, plus any extra URL → JSON entries. */
export function installFetch(extra = new Map()) {
  const fetchMock = vi.fn(async (url) => {
    const href = String(url);
    if (extra.has(href)) {
      const body = extra.get(href);
      if (body === 404) return { ok: false, status: 404, json: async () => null };
      return { ok: true, status: 200, json: async () => body };
    }
    const m = /(data\/.+)$/.exec(href);
    if (m) {
      const file = path.join(repoRoot, "public", m[1]);
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, "utf8");
        return { ok: true, status: 200, json: async () => JSON.parse(text) };
      }
    }
    return { ok: false, status: 404, json: async () => null };
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

/** Start every test from a clean slate. */
export function resetEnvironment() {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  document.documentElement.removeAttribute("data-theme");
}
