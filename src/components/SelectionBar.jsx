import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/**
 * Floating bar, shown once two or more verses are selected: copy them all, or
 * drop the selection. A single verse is copied by double-clicking it instead,
 * so the bar only appears when there is something a double-click cannot do.
 */
export default function SelectionBar({ onCopy }) {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  const n = state.selected.size;
  if (n < 2) return null;
  return (
    <div className="selection-bar">
      <button
        id="copy-selected"
        type="button"
        className="sel-btn sel-copy"
        aria-label={t.copySelected(n)}
        onClick={onCopy}
      >
        {t.copy}
      </button>
      <button
        id="deselect-all"
        type="button"
        className="sel-btn"
        onClick={actions.clearSelection}
      >
        {t.deselect(n)}
      </button>
    </div>
  );
}
