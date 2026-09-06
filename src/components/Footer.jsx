import { useState } from "react";
import InstallHelp from "./InstallHelp.jsx";
import DownloadStudy from "./DownloadStudy.jsx";
import { HelpIcon } from "./icons.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

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
