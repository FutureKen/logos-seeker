/**
 * sw.js — service worker for offline use.
 *
 * Without one, an iOS home-screen web app refetches everything from the
 * network every time the system reclaims its memory and relaunches it, so it
 * is unusable with no connection. This caches the whole app — shell and Bible
 * data — and serves it from disk first, so a relaunch is instant and works
 * offline.
 *
 * Bump VERSION on every deploy: it names the cache, so a new version installs
 * fresh copies and the old cache is dropped on activate.
 */

const VERSION = "v1";
const CACHE = `logos-seeker-${VERSION}`;

// The app shell. Install fails (and the old worker stays in charge) if any of
// these can't be fetched, so keep the list to what the app truly needs.
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/search.js",
  "./src/parseQuery.js",
  "./favicon.svg",
  "./apple-touch-icon.png",
  "./data/books.json",
  // Screenshots for the "add to Home Screen" walkthrough — small, and the
  // walkthrough is most useful to someone checking it offline.
  "./assets/ios-1-more.jpg",
  "./assets/ios-2-share.jpg",
  "./assets/ios-3-add.jpg",
];

// ~7 MB of verse text (≈3 MB over the wire). Cached separately and
// best-effort: a failed or slow download here must not fail the install.
const DATA = "./data/verses.json";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Warm the verse data too, but don't block installation on it — if it
      // fails the first search will fetch and cache it instead. Skipped when
      // it's already stored, so shipping a new worker doesn't cost the user
      // another multi-megabyte download; a VERSION bump (new cache) does.
      try {
        if (!(await cache.match(DATA))) await cache.add(DATA);
      } catch {}
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("logos-seeker-") && n !== CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Cache-first with a background refresh (stale-while-revalidate): the app
 * always starts from disk — instantly, and with no connection — while any
 * newer copy is quietly stored for the next launch.
 *
 * The verse data is the exception: it's megabytes, and it only ever changes
 * when the app itself does, so once cached it is served without touching the
 * network. A VERSION bump re-downloads it during install.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave third parties alone

  const bulk = url.pathname.endsWith("/data/verses.json");

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });

      if (cached && bulk) return cached; // no revalidation for the big file

      const network = fetch(req)
        .then((res) => {
          // Opaque/error responses are not worth storing.
          if (res && res.ok && res.type === "basic") {
            return cache.put(req, res.clone()).then(() => res);
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Let the refresh finish even though we answer from cache now.
        event.waitUntil(network);
        return cached;
      }

      const res = await network;
      if (res) return res;

      // Offline and never cached: fall back to the app shell for page loads so
      // a relaunch still opens the app rather than a browser error.
      if (req.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return new Response("Offline and not cached.", {
        status: 504,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain" },
      });
    })()
  );
});
