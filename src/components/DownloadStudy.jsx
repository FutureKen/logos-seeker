import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

const MB = 1024 * 1024;
const fmt = (bytes) => (bytes / MB).toFixed(1);

/** Arrow into a tray — the usual "save to this device" mark. */
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="foot-icon">
      <path
        d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Store every chapter's study notes on the device, so an unvisited chapter
 * still has its footnotes on a plane. It walks the manifest through the service
 * worker's study cache; progress is counted in files, which is all
 * `preloadAll` reports, and the megabytes shown are that fraction of the total.
 *
 * A download of this size is worth asking about first, so the button opens a
 * confirmation rather than starting straight away.
 *
 * Only rendered once the study data is unlocked: a locked device cannot decrypt
 * what it would be storing.
 */
export default function DownloadStudy() {
  const { state, store } = useApp();
  const t = tr(state.lang);
  const [index, setIndex] = useState(null);
  const [progress, setProgress] = useState(null); // {done, total}
  const [phase, setPhase] = useState("idle"); // idle | running | done | stopped | error
  const [asking, setAsking] = useState(false);
  const abortRef = useRef(null);
  const dialogRef = useRef(null);

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

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (asking && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!asking && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [asking]);

  if (!state.unlocked) return null;
  const books = Object.keys(index?.books ?? {}).length;
  if (!books) return null;

  const totalBytes = index?.totalBytes ?? 0;

  async function start() {
    setAsking(false);
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
      <button type="button" className="link-btn foot-btn" onClick={() => setAsking(true)}>
        <DownloadIcon />
        {t.downloadShort}
      </button>
      {phase === "error" || phase === "stopped" ? (
        <span className="muted dl-note">
          {phase === "error" ? t.downloadFailed : t.downloadStopped}
        </span>
      ) : null}

      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        aria-label={t.downloadTitle}
        onClose={() => setAsking(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setAsking(false);
        }}
      >
        <h2 className="cd-title">{t.downloadTitle}</h2>
        <p className="cd-body">{t.downloadAsk(fmt(totalBytes))}</p>
        <div className="cd-actions">
          <button type="button" className="cd-btn" onClick={() => setAsking(false)}>
            {t.cancel}
          </button>
          <button type="button" className="cd-btn cd-primary" onClick={start}>
            {t.downloadConfirm}
          </button>
        </div>
      </dialog>
    </span>
  );
}
