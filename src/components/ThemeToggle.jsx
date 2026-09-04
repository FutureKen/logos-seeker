import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/**
 * Light/dark switch. The glyph (🌙 / ☀) comes from CSS so it follows
 * `data-theme` without a re-render.
 */
export default function ThemeToggle() {
  const { state, actions } = useApp();
  const t = tr(state.lang);
  return (
    <button
      type="button"
      id="theme-toggle"
      className="theme-toggle"
      aria-label={state.theme === "light" ? t.themeToDark : t.themeToLight}
      title="Toggle light/dark mode"
      onClick={actions.toggleTheme}
    />
  );
}
