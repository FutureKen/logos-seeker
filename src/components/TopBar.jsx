import LangToggle from "./LangToggle.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import UnlockButton from "./UnlockButton.jsx";
import NotesToggle from "./NotesToggle.jsx";
import { useApp } from "../state/AppProvider.jsx";

/** Brand, language switch, the study gate slot, and the theme switch. */
export default function TopBar() {
  const { state } = useApp();
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
        Logos&nbsp;Seeker
      </h1>
      <div className="topbar-tools">
        <LangToggle />
        {state.unlocked ? <NotesToggle /> : <UnlockButton />}
        <ThemeToggle />
      </div>
    </header>
  );
}
