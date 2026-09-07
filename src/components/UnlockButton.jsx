import { useState } from "react";
import UnlockDialog from "./UnlockDialog.jsx";
import { LockIcon } from "./icons.jsx";
import { useApp } from "../state/AppProvider.jsx";
import { tr } from "../lib/i18n.js";

/** Top-bar entry point to the study gate; owns the unlock dialog. */
export default function UnlockButton() {
  const { state, actions, store } = useApp();
  const t = tr(state.lang);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="unlock-btn"
        aria-label={t.unlock}
        title={t.unlockTitle}
        onClick={() => setOpen(true)}
      >
        <LockIcon />
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
