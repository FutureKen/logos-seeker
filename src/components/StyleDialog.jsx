import { useEffect, useRef } from "react";
import { useApp } from "../state/AppProvider.jsx";
import { SCHEMES, FONTS, SIZE, SIZES, sizeIndex, stepSize } from "../lib/style.js";
import { tr } from "../lib/i18n.js";

/**
 * Reading style: colour scheme, typeface and text size.
 *
 * Every change applies to the page immediately — the dialog sits over the text
 * it is restyling, so the effect of a choice is visible while making it. There
 * is no OK/Cancel, only a close button; the choices persist themselves.
 */
export default function StyleDialog({ open, onClose }) {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="style-dialog"
      aria-label={t.styleTitle}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
    >
      <div className="sd-head">
        <span className="sd-title">{t.styleTitle}</span>
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

      <div className="sd-body">
        <section className="sd-section">
          <h3 className="sd-label">{t.colourScheme}</h3>
          <div className="sd-schemes" role="group" aria-label={t.colourScheme}>
            {SCHEMES.map((id) => (
              <button
                key={id}
                type="button"
                className={`sd-swatch${state.scheme === id ? " active" : ""}`}
                data-scheme={id}
                aria-pressed={state.scheme === id}
                onClick={() => actions.setScheme(id)}
              >
                <span className="sw-chip" aria-hidden="true">
                  Aa
                </span>
                <span className="sw-name">{t.scheme[id]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sd-section">
          <h3 className="sd-label">{t.typeface}</h3>
          <div className="sd-fonts" role="group" aria-label={t.typeface}>
            {FONTS.map((id) => (
              <button
                key={id}
                type="button"
                className={`sd-font${state.font === id ? " active" : ""}`}
                data-font-sample={id}
                aria-pressed={state.font === id}
                onClick={() => actions.setFont(id)}
              >
                <span className="sf-sample" aria-hidden="true">
                  Aa 经文
                </span>
                <span className="sf-name">{t.font[id]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sd-section">
          <h3 className="sd-label">
            {t.textSize} <span className="sd-size-value">{state.fontSize}px</span>
          </h3>
          <div className="sd-size">
            <button
              type="button"
              className="sd-step"
              aria-label={t.smaller}
              title={t.smaller}
              disabled={state.fontSize <= SIZE.min}
              onClick={() => actions.setFontSize(stepSize(state.fontSize, -1))}
            >
              A<span className="sd-step-sign">−</span>
            </button>
            {/* The slider runs along the ladder, not along pixels, because the
                steps are not all the same width. */}
            <input
              type="range"
              className="sd-range"
              min={0}
              max={SIZES.length - 1}
              step={1}
              value={sizeIndex(state.fontSize)}
              aria-label={t.textSize}
              aria-valuetext={`${state.fontSize}px`}
              onChange={(e) => actions.setFontSize(SIZES[Number(e.target.value)])}
            />
            <button
              type="button"
              className="sd-step sd-step-big"
              aria-label={t.larger}
              title={t.larger}
              disabled={state.fontSize >= SIZE.max}
              onClick={() => actions.setFontSize(stepSize(state.fontSize, 1))}
            >
              A<span className="sd-step-sign">+</span>
            </button>
          </div>
          <p className="sd-sample">{t.styleSample}</p>
        </section>
      </div>
    </dialog>
  );
}
