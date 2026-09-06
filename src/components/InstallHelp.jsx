import { useEffect, useRef } from "react";
import { HELP_STEPS, tr } from "../lib/i18n.js";

/** The "Add to Home Screen" walkthrough (iOS Safari), as a native dialog. */
export default function InstallHelp({ open, lang, onClose }) {
  const t = tr(lang);
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      if (bodyRef.current) bodyRef.current.scrollTop = 0; // always open on step 1
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      id="install-help"
      className="help-dialog"
      aria-labelledby="install-help-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div className="help-head">
        <h2 id="install-help-title">{t.installTitle}</h2>
        <button
          type="button"
          id="install-help-close"
          className="clear-btn help-close"
          aria-label={t.close}
          title={t.close}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div id="install-help-body" className="help-body" ref={bodyRef}>
        {HELP_STEPS.map((s, i) => (
          <div className="help-step" key={s.img}>
            <p>
              <span className="step-n">{i + 1}</span>
              <span>
                {(lang === "cn" ? s.cn : s.en).map((run, k) =>
                  run.b ? <strong key={k}>{run.b}</strong> : <span key={k}>{run.t}</span>,
                )}
              </span>
            </p>
            <img src={`${base}${s.img}`} width={s.w} height={s.h} alt="" />
          </div>
        ))}
        <p className="help-note">{t.installNote}</p>
      </div>
    </dialog>
  );
}
