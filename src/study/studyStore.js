import { decryptJson } from "./studyCrypto.js";

/**
 * Fetches, decrypts and caches the per-book / per-chapter study files.
 *
 * Framework-free on purpose: React hooks wrap it, and the footer's
 * "download for offline" button drives `preloadAll` directly. Every study file
 * is AES-GCM ciphertext at rest, so the store needs the unlock key before it
 * can hand anything back; without it, reads reject with `Error("study-locked")`.
 */
export class StudyStore {
  /** @param {string} basePath e.g. `import.meta.env.BASE_URL` ("/" or "/logos-seeker/") */
  constructor(basePath = "") {
    this.basePath = basePath;
    this.key = null;
    this.index = null;
    this._books = new Map();
    this._chapters = new Map();
    this._inflight = new Map();
  }

  /** Set (or clear) the unlock key. Changing it drops every cached file. */
  setKey(key) {
    if (key === this.key) return;
    this.key = key ?? null;
    this._books.clear();
    this._chapters.clear();
    this._inflight.clear();
  }

  get unlocked() {
    return this.key != null;
  }

  _url(rel) {
    return `${this.basePath}data/study/${rel}`;
  }

  async _fetchJson(rel, { needKey = true, signal } = {}) {
    const res = await fetch(this._url(rel), signal ? { signal } : undefined);
    if (!res || !res.ok) throw new Error(`study fetch failed: ${rel} (${res?.status ?? "?"})`);
    const raw = await res.json();
    if (raw && typeof raw.ct === "string") {
      if (!this.key) throw new Error("study-locked");
      return decryptJson(raw, this.key);
    }
    if (needKey && !this.key) throw new Error("study-locked");
    return raw;
  }

  /** Dedupe concurrent requests for the same file. */
  _once(cacheKey, run) {
    const pending = this._inflight.get(cacheKey);
    if (pending) return pending;
    const p = run().finally(() => {
      if (this._inflight.get(cacheKey) === p) this._inflight.delete(cacheKey);
    });
    this._inflight.set(cacheKey, p);
    return p;
  }

  /** The plaintext manifest — readable while still locked (for size labels). */
  async loadIndex({ signal } = {}) {
    if (this.index) return this.index;
    return this._once("index", async () => {
      this.index = await this._fetchJson("index.json", { needKey: false, signal });
      return this.index;
    });
  }

  async ensureBook(book, { signal } = {}) {
    const k = `b${book}`;
    if (this._books.has(k)) return this._books.get(k);
    return this._once(k, async () => {
      const data = await this._fetchJson(`${book}/book.json`, { signal });
      this._books.set(k, data);
      return data;
    });
  }

  async ensureChapter(book, chapter, { signal } = {}) {
    const k = `c${book}:${chapter}`;
    if (this._chapters.has(k)) return this._chapters.get(k);
    return this._once(k, async () => {
      const data = await this._fetchJson(`${book}/${chapter}.json`, { signal });
      this._chapters.set(k, data);
      return data;
    });
  }

  /** Synchronous cache reads — `null` when the file is not loaded yet. */
  book(book) {
    return this._books.get(`b${book}`) ?? null;
  }

  chapter(book, chapter) {
    return this._chapters.get(`c${book}:${chapter}`) ?? null;
  }

  /** The apparatus of one verse in one language, or `null`. */
  verse(book, chapter, verse, lang = "en") {
    const ch = this.chapter(book, chapter);
    return ch?.[lang]?.verses?.[String(verse)] ?? null;
  }

  /**
   * Outline entries that start inside `chapter`, grouped by the verse they
   * are anchored to (verse 0 = a heading above the chapter).
   * @returns {Map<number, object[]>}
   */
  outlineForChapter(book, chapter, lang = "en") {
    const out = new Map();
    const entries = this.book(book)?.[lang]?.outline ?? [];
    for (const e of entries) {
      if (!Array.isArray(e.start) || e.start[0] !== chapter) continue;
      const v = e.start[1] ?? 0;
      if (!out.has(v)) out.set(v, []);
      out.get(v).push(e);
    }
    return out;
  }

  /**
   * Warm the cache for every book/chapter listed in `index.json`.
   * @param {{concurrency?: number, onProgress?: (p: {done: number, total: number, book: number, chapter: number|null}) => void, signal?: AbortSignal}} opts
   */
  async preloadAll({ concurrency = 4, onProgress, signal } = {}) {
    const index = await this.loadIndex({ signal });
    /** @type {{book: number, chapter: number|null}[]} */
    const jobs = [];
    for (const [key, meta] of Object.entries(index?.books ?? {})) {
      const book = Number(key);
      jobs.push({ book, chapter: null });
      for (let c = 1; c <= (meta.chapters ?? 0); c++) jobs.push({ book, chapter: c });
    }
    const total = jobs.length;
    let done = 0;
    let next = 0;

    const worker = async () => {
      while (next < jobs.length) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const job = jobs[next++];
        if (job.chapter == null) await this.ensureBook(job.book, { signal });
        else await this.ensureChapter(job.book, job.chapter, { signal });
        done++;
        onProgress?.({ done, total, book: job.book, chapter: job.chapter });
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return { done, total };
  }
}

export default StudyStore;
