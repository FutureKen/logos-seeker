import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/**
 * The Notes / 注解 on-off switch that replaces the Unlock button once the
 * study data is unlocked. Subtask C only wires the state (`ls-study`); subtask
 * D makes it drive the apparatus rendering in the chapter view.
 */
export default function NotesToggle() {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  return (
    <button
      type="button"
      className={`notes-toggle${state.study ? " active" : ""}`}
      aria-pressed={state.study}
      title={t.notesAria}
      onClick={() => actions.setStudy(!state.study)}
    >
      {t.notes}
    </button>
  );
}
