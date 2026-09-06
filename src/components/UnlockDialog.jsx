import { useEffect, useRef, useState } from "react";
import { exportKey, unlock } from "../study/studyCrypto.js";
import { writeLS } from "../hooks/useLocalStorage.js";
import { tr } from "../lib/i18n.js";

/**
 * Password prompt for the study apparatus. The password is never stored: the
 * PBKDF2-derived AES key is checked against `index.json`'s `verify` blob and,
 * on success, the raw key goes to `localStorage["ls-study-key"]`.
 */
export default function UnlockDialog({ open, lang, store, onClose, onUnlocked }) {
  const t = tr(lang);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPassword("");
      setReveal(false);
      setError("");
      setBusy(false);
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      inputRef.current?.focus();
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const index = await store.loadIndex();
      const key = await unlock(password, index);
      if (!key) {
        setError(t.wrongPassword);
        return;
      }
      writeLS("ls-study-key", await exportKey(key));
      store.setKey(key);
      onUnlocked?.(key);
    } catch {
      // No index.json yet (404), offline, or a malformed manifest.
      setError(t.studyUnavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="help-dialog unlock-dialog"
      aria-labelledby="unlock-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div className="help-head">
        <h2 id="unlock-title">{t.unlockTitle}</h2>
        <button
          type="button"
          className="clear-btn help-close"
          aria-label={t.close}
          title={t.close}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form className="unlock-body" onSubmit={submit}>
        <label className="unlock-label" htmlFor="unlock-password">
          {t.password}
        </label>
        <div className="pw-field">
          <input
            id="unlock-password"
            ref={inputRef}
            type={reveal ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="pw-reveal"
            aria-label={reveal ? t.hidePassword : t.showPassword}
            title={reveal ? t.hidePassword : t.showPassword}
            aria-pressed={reveal}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? "🙈" : "👁"}
          </button>
        </div>
        {error ? (
          <p className="unlock-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="unlock-submit" disabled={busy}>
          {busy ? t.unlocking : t.unlock}
        </button>
      </form>
    </dialog>
  );
}
