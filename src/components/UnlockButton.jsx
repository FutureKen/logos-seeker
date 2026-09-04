import { useState } from "react";
import UnlockDialog from "./UnlockDialog.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <rect
        x="4"
        y="10"
        width="16"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

/** Top-bar entry point to the study gate; owns the unlock dialog. */
export default function UnlockButton() {
  const { state, actions, store } = useApp();
  const t = tr(state.lang);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="unlock-btn" onClick={() => setOpen(true)}>
        <LockIcon />
        {t.unlock}
      </button>
      <UnlockDialog
        open={open}
        lang={state.lang}
        store={store}
        onClose={() => setOpen(false)}
        onUnlocked={() => {
          setOpen(false);
          actions.setUnlocked(true);
          actions.setStudy(true); // a successful unlock turns Notes on at once
        }}
      />
    </>
  );
}
