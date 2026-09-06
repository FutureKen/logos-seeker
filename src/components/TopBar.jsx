import { useState } from "react";
import BookMenu from "./BookMenu.jsx";
import LangToggle from "./LangToggle.jsx";
import StyleDialog from "./StyleDialog.jsx";
import UnlockButton from "./UnlockButton.jsx";
import NotesToggle from "./NotesToggle.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/**
 * The book menu, the brand, the language switch, the study gate slot and the
 * reading-style button.
 */
export default function TopBar() {
  const { state } = useApp();
  const t = tr(state.lang);
  const [menuOpen, setMenuOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  return (
    <header className="topbar">
      <h1 className="brand">
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
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
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
