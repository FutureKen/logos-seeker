import { useEffect, useRef } from "react";
import { SHORTCUTS, tr } from "../lib/i18n.js";

/** A chip is a bare symbol where both languages share it, a `{en, cn}` word otherwise. */
function chipText(c, lang) {
  return typeof c === "string" ? c : lang === "cn" ? c.cn : c.en;
}

/**
 * Every way the app can be driven — key, mouse and thumb — in one list.
 *
 * `study` groups are left out until the apparatus is unlocked, so the dialog
 * only ever describes what the reader actually has.
 */
export default function ShortcutsDialog({ open, lang, study = false, onClose }) {
  const t = tr(lang);
  const ref = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  const groups = SHORTCUTS.filter((g) => !g.study || study);

  return (
    <dialog
      ref={ref}
      id="shortcuts"
      className="help-dialog shortcuts-dialog"
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div className="help-head">
        <h2 id="shortcuts-title">{t.shortcutsTitle}</h2>
        <button
          type="button"
          id="shortcuts-close"
          className="clear-btn help-close"
          aria-label={t.close}
          title={t.close}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div id="shortcuts-body" className="help-body" ref={bodyRef}>
        {groups.map((g) => (
          <section className="sc-group" key={g.en}>
            <h3 className="sc-group-title">{lang === "cn" ? g.cn : g.en}</h3>
            {g.rows.map((r, i) => (
              <div className="sc-row" key={i}>
                <span className="sc-keys">
                  {r.k.map((c, j) => (
                    <kbd className="sc-key" key={j}>
                      {chipText(c, lang)}
                    </kbd>
                  ))}
                </span>
                <span className="sc-what">{lang === "cn" ? r.cn : r.en}</span>
              </div>
            ))}
          </section>
        ))}
        <p className="help-note">{t.shortcutsNote}</p>
      </div>
    </dialog>
  );
}
