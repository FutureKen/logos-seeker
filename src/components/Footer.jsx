import { useState } from "react";
import InstallHelp from "./InstallHelp.jsx";
import DownloadStudy from "./DownloadStudy.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/** A circled question mark, for the "add to home" walkthrough. */
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="foot-icon">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.2-2.8 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.4" r="1.2" fill="currentColor" />
    </svg>
  );
}

export default function Footer() {
  const { state } = useApp();
  const t = tr(state.lang);
  const [helpOpen, setHelpOpen] = useState(false);

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
          <span className="muted">
            ©{" "}
            <a href="https://www.lsm.org/" target="_blank" rel="noopener noreferrer">
              Living Stream Ministry
            </a>
          </span>
        </span>
        <span className="muted">{t.personalUse}</span>
        <DownloadStudy />
        <button
          type="button"
          id="install-help-link"
          className="link-btn foot-btn"
          onClick={() => setHelpOpen(true)}
        >
          <HelpIcon />
          {t.installLink}
        </button>
      </footer>
      <InstallHelp open={helpOpen} lang={state.lang} onClose={() => setHelpOpen(false)} />
    </>
  );
}
