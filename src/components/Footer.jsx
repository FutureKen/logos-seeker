import { useState } from "react";
import InstallHelp from "./InstallHelp.jsx";
import ShortcutsDialog from "./ShortcutsDialog.jsx";
import DownloadStudy from "./DownloadStudy.jsx";
import { HelpIcon } from "./icons.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

export default function Footer() {
  const { state } = useApp();
  const t = tr(state.lang);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);

  return (
    <>
      <footer className="foot">
        <button
          type="button"
          id="shortcuts-link"
          className="link-btn foot-btn"
          title={t.shortcutsTip}
          onClick={() => setScOpen(true)}
        >
          <HelpIcon />
          {t.shortcutsLink}
        </button>
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
        {/* The attribution closes the footer: read last, and never the thing a
            reader is reaching for. */}
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
      </footer>
      <InstallHelp open={helpOpen} lang={state.lang} onClose={() => setHelpOpen(false)} />
      <ShortcutsDialog
        open={scOpen}
        lang={state.lang}
        study={state.unlocked}
        onClose={() => setScOpen(false)}
      />
    </>
  );
}
