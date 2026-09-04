import { useState } from "react";
import InstallHelp from "./InstallHelp.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { writeLS } from "../hooks/useLocalStorage.js";
import { tr } from "../lib/i18n.js";

export default function Footer() {
  const { state, actions, store } = useApp();
  const t = tr(state.lang);
  const [helpOpen, setHelpOpen] = useState(false);

  function lock() {
    writeLS("ls-study-key", null);
    store.setKey(null);
    actions.lock();
  }

  return (
    <>
      <footer className="foot">
        <span>
          <a
            href="https://www.recoveryversion.bible/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Recovery Version
          </a>{" "}
          · English &amp; 中文
        </span>
        <span className="muted">Static &amp; offline after first load</span>
        <span className="muted">For personal use only.</span>
        {state.unlocked ? (
          <button type="button" className="link-btn" onClick={lock}>
            {t.lock}
          </button>
        ) : null}
        <button
          type="button"
          id="install-help-link"
          className="link-btn"
          onClick={() => setHelpOpen(true)}
        >
          {t.installLink}
        </button>
      </footer>
      <InstallHelp open={helpOpen} lang={state.lang} onClose={() => setHelpOpen(false)} />
    </>
  );
}
