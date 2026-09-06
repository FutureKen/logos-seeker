import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getBible } from "../hooks/useBible.js";
import { formatRef } from "../study/refFormat.js";
import { refPreview, parseRefAttr } from "../study/refText.js";

/** Long enough that a pointer crossing a link on its way elsewhere never triggers it. */
const DELAY = 300;
const GAP = 6; // between the link and the tooltip
const MARGIN = 8; // keep this far from the viewport edges

/**
 * Hover preview for a scripture reference: pause over a reference in a
 * footnote, a cross-reference chip or the book info, and the verse it points at
 * appears in a tooltip. It reads `data-ref` off the link, so any element that
 * carries one is covered without wiring anything up per link.
 *
 * Rendered *inside* the element it watches on purpose: the study sheet is a
 * modal `<dialog>` in the browser's top layer, and a tooltip anywhere else in
 * the document would be painted underneath it.
 *
 * @param {{current: HTMLElement|null}} containerRef the subtree to watch
 * @param {"en"|"cn"} lang which half of the verse to preview
 * @param {number} [delay] ms the pointer must rest on the link
 */
export default function RefTooltip({ containerRef, lang = "en", delay = DELAY }) {
  const [tip, setTip] = useState(null); // {ref, rect, preview}
  const [pos, setPos] = useState(null); // {left, top} once measured
  const tipRef = useRef(null);
  const timer = useRef(null);
  const anchorEl = useRef(null);

  useEffect(() => {
    const root = containerRef?.current;
    if (!root) return;

    const cancel = () => {
      clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      cancel();
      anchorEl.current = null;
      setTip(null);
      setPos(null);
    };

    function open(el) {
      const ref = parseRefAttr(el.getAttribute("data-ref"));
      if (!ref) return;
      const preview = refPreview(getBible(), ref, lang);
      if (!preview) return; // data not loaded yet, or nothing at that reference
      anchorEl.current = el;
      setPos(null);
      setTip({ ref, rect: el.getBoundingClientRect(), preview });
    }

    function onOver(e) {
      // A touch "hover" is the tap that is about to navigate — leave it alone.
      if (e.pointerType === "touch") return;
      const el = e.target?.closest?.("[data-ref]");
      if (!el || !root.contains(el)) return;
      if (el === anchorEl.current) return;
      cancel();
      timer.current = setTimeout(() => open(el), delay);
    }

    function onOut(e) {
      const el = e.target?.closest?.("[data-ref]");
      if (!el) return;
      // Moving within the same link (across its text nodes) is not a leave.
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      hide();
    }

    function onFocusIn(e) {
      const el = e.target?.closest?.("[data-ref]");
      if (el) open(el);
      else hide();
    }

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("pointerdown", hide);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", hide);
    // Any scroll moves the anchor out from under the tooltip.
    root.addEventListener("scroll", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      cancel();
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("pointerdown", hide);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", hide);
      root.removeEventListener("scroll", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [containerRef, lang, delay]);

  // Place it once its size is known: above the link, or below when the top of
  // the window is in the way, and never past either edge.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const t = tipRef.current.getBoundingClientRect();
    const r = tip.rect;
    let top = r.top - t.height - GAP;
    if (top < MARGIN) top = Math.min(r.bottom + GAP, window.innerHeight - t.height - MARGIN);
    const left = Math.max(
      MARGIN,
      Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - MARGIN),
    );
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [tip]);

  if (!tip) return null;
  const bookByIdx = getBible().bookByIdx;
  return (
    <div
      ref={tipRef}
      className={`ref-tip${lang === "cn" ? " cn" : ""}${pos ? "" : " measuring"}`}
      role="tooltip"
      style={{ left: pos ? `${pos.left}px` : 0, top: pos ? `${pos.top}px` : 0 }}
    >
      <div className="rt-head">{formatRef(tip.ref, lang, bookByIdx)}</div>
      {tip.preview.lines.map((l) => (
        <p className="rt-line" key={l.no}>
          <span className="rt-no">{l.no}</span>
          {l.text}
        </p>
      ))}
      {tip.preview.more ? <p className="rt-more">…</p> : null}
    </div>
  );
}
