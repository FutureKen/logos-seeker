import { useState } from "react";
import BookMenu from "./BookMenu.jsx";
import LangToggle from "./LangToggle.jsx";
import StyleDialog from "./StyleDialog.jsx";
import UnlockButton from "./UnlockButton.jsx";
import NotesToggle from "./NotesToggle.jsx";
import { BookIcon } from "./icons.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/**
 * The brand on the left; every control on the right — book menu, language
 * switch, study gate slot and reading-style button.
 */
export default function TopBar() {
  const { state } = useApp();
  const t = tr(state.lang);
  const [menuOpen, setMenuOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  return (
    <header className="topbar">
      <h1 className="brand">
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          className="brand-icon"
          width="28"
          height="28"
        />
        <span className="brand-name">Logos&nbsp;Seeker</span>
      </h1>
      <div className="topbar-tools">
        <button
          type="button"
          id="menu-btn"
          className="menu-btn"
          aria-label={t.menuTitle}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          title={t.menuTitle}
          onClick={() => setMenuOpen(true)}
        >
          <BookIcon />
        </button>
        <LangToggle />
        {state.unlocked ? <NotesToggle /> : <UnlockButton />}
        <button
          type="button"
          id="style-btn"
          className="style-btn"
          aria-label={t.styleTitle}
          aria-haspopup="dialog"
          aria-expanded={styleOpen}
          title={t.styleTitle}
          onClick={() => setStyleOpen(true)}
        >
          Aa
        </button>
      </div>
      <BookMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <StyleDialog open={styleOpen} onClose={() => setStyleOpen(false)} />
    </header>
  );
}
