import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/** EN / 中文 display-language switch. */
export default function LangToggle() {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  return (
    <div className="lang-toggle" role="group" aria-label={t.langGroup}>
      {[
        ["en", "EN"],
        ["cn", "中文"],
      ].map(([code, label]) => (
        <button
          key={code}
          type="button"
          data-lang={code}
          className={state.lang === code ? "active" : ""}
          aria-pressed={state.lang === code}
          onClick={() => actions.setLang(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
