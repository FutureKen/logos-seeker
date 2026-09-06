import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/** Floating pill, shown once two or more verses are selected. */
export default function DeselectButton() {
  const { state, actions } = useApp();
  const n = state.selected.size;
  if (n < 2) return null;
  return (
    <button
      id="deselect-all"
      type="button"
      className="deselect-btn"
      onClick={actions.clearSelection}
    >
      {tr(state.lang).deselect(n)}
    </button>
  );
}
