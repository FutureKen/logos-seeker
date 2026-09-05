import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

const MB = 1024 * 1024;
const fmt = (bytes) => (bytes / MB).toFixed(1);

/**
 * "Download study notes for offline" — walks every file in the manifest through
 * the service worker's study cache so an unvisited chapter still has its notes
 * on a plane. The size comes from `index.json.totalBytes`; progress is
 * approximated from the file count, which is all `preloadAll` reports.
 *
 * Only rendered once the study data is unlocked (a locked device cannot
 * decrypt, and would be downloading ciphertext it cannot read).
 */
export default function DownloadStudy() {
  const { state, store } = useApp();
  const t = tr(state.lang);
  const [index, setIndex] = useState(null);
  const [progress, setProgress] = useState(null); // {done, total}
  const [phase, setPhase] = useState("idle"); // idle | running | done | stopped | error
  const abortRef = useRef(null);

  useEffect(() => {
    if (!state.unlocked) return;
    let cancelled = false;
    store.loadIndex().then(
      (i) => !cancelled && setIndex(i),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [state.unlocked, store]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!state.unlocked) return null;
  const books = Object.keys(index?.books ?? {}).length;
  if (!books) return null;

  const totalBytes = index?.totalBytes ?? 0;

  async function start() {
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("running");
    setProgress({ done: 0, total: 0 });
    try {
      await store.preloadAll({
        concurrency: 4,
        signal: ac.signal,
        // One render per file would be 1,255 renders; every fifth is smooth
        // enough and keeps the main thread on the downloads.
        onProgress: ({ done, total }) => {
          if (done % 5 === 0 || done === total) setProgress({ done, total });
        },
      });
      setPhase("done");
    } catch (err) {
      setPhase(err?.name === "AbortError" ? "stopped" : "error");
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  if (phase === "running") {
    const { done = 0, total = 0 } = progress ?? {};
    const bytes = total ? (totalBytes * done) / total : 0;
    return (
      <span className="dl-study">
        <span className="dl-progress">
          {done} / {total} · {fmt(bytes)} MB
        </span>
        <button type="button" className="link-btn" onClick={stop}>
          {t.downloadCancel}
        </button>
      </span>
    );
  }

  if (phase === "done") return <span className="muted dl-study">{t.downloadDone}</span>;

  return (
    <span className="dl-study">
      <button type="button" className="link-btn" onClick={start}>
        {t.download(fmt(totalBytes))}
      </button>
      {phase === "error" || phase === "stopped" ? (
        <span className="muted dl-note">
          {phase === "error" ? t.downloadFailed : t.downloadStopped}
        </span>
      ) : null}
    </span>
  );
}
