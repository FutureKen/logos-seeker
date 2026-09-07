import { NotesIcon } from "./icons.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/**
 * The study-notes on-off switch that replaces the Unlock button once the study
 * data is unlocked; it drives the apparatus in the chapter view (`ls-study`).
 */
export default function NotesToggle() {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  return (
    <button
      type="button"
      className={`notes-toggle${state.study ? " active" : ""}`}
      aria-pressed={state.study}
      aria-label={t.notes}
      title={t.notesAria}
      onClick={() => actions.setStudy(!state.study)}
    >
      <NotesIcon />
    </button>
  );
}
