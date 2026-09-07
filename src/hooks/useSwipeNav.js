import { useEffect, useRef } from "react";

/**
 * iOS Safari and Android Chrome own a strip at each edge for their own back
 * gesture. A touch that starts there was never ours to read.
 */
const EDGE_ZONE = 24;
/** Far enough that a tap, a tap-to-select or a marker tap can never reach it. */
const MIN_DX = 64;
/** More vertical than this and it was a scroll that drifted sideways. */
const MAX_DY = 48;
/** A slow press-and-drag is a text selection, not a flick. */
const MAX_MS = 600;
/** Once a drag leans this far off the horizontal, it has committed to scrolling. */
const LOCK_DY = 12;

/** Controls that own their own touches; a swipe must not start on one. */
const INERT = "button, a, input, textarea, select, dialog, [role='button']";

function selectionIsLive() {
  const s = window.getSelection?.();
  return !!s && !s.isCollapsed && !!String(s).trim();
}

function dialogIsOpen() {
  return !!document.querySelector("dialog[open]");
}

/**
 * Flick left for the next chapter, right for the previous one.
 *
 * Touch events are the gate: a mouse never fires them, so this costs nothing on
 * a desktop and needs no media query to stay out of its way. Everything else
 * here is refusal — the gesture has to survive the edge strips the OS claims,
 * a second finger, a scroll that wandered, a live text selection and an open
 * dialog before it counts as a swipe.
 *
 * @param {{current: HTMLElement|null}} ref the element the reader drags across
 */
export function useSwipeNav(ref, { canPrev, canNext, onPrev, onNext }) {
  // The caller passes fresh arrows every render, so the listeners read the
  // handlers through a ref rather than re-subscribing — a re-render between
  // touchstart and touchend would otherwise swallow the gesture in flight.
  const latest = useRef(null);
  useEffect(() => {
    latest.current = { canPrev, canNext, onPrev, onNext };
  });

  const gesture = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    function onStart(e) {
      gesture.current = null;
      if (e.touches.length !== 1) return; // a pinch, not a swipe
      const p = e.touches[0];
      if (p.clientX < EDGE_ZONE || p.clientX > window.innerWidth - EDGE_ZONE) return;
      if (dialogIsOpen() || selectionIsLive()) return;
      if (e.target?.closest?.(INERT)) return;
      gesture.current = { x: p.clientX, y: p.clientY, t: Date.now(), live: true };
    }

    function onMove(e) {
      const g = gesture.current;
      if (!g?.live) return;
      if (e.touches.length > 1) {
        g.live = false; // a second finger arrived mid-drag
        return;
      }
      const dx = e.touches[0].clientX - g.x;
      const dy = e.touches[0].clientY - g.y;
      if (Math.abs(dy) > LOCK_DY && Math.abs(dy) > Math.abs(dx)) g.live = false;
    }

    function onEnd(e) {
      const g = gesture.current;
      gesture.current = null;
      if (!g?.live) return;
      // `touches` is empty by now; the finger that left is in changedTouches.
      const p = e.changedTouches?.[0];
      if (!p) return;
      if (Date.now() - g.t > MAX_MS) return;
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      // A flick can outrun touchmove entirely, so the axis is judged again here.
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) > MAX_DY) return;
      if (dialogIsOpen() || selectionIsLive()) return;
      const { canPrev: prevOk, canNext: nextOk, onPrev: prev, onNext: next } = latest.current;
      // Left-to-right reading: the finger travels the way the page does. An RTL
      // layout would flip this, but nothing here ever sets `dir`.
      if (dx < 0) {
        if (nextOk) next?.();
      } else if (prevOk) {
        prev?.();
      }
    }

    function onCancel() {
      // iOS hands the gesture back when it enters selection mode of its own.
      gesture.current = null;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ref]);
}

export default useSwipeNav;
