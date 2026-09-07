import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ChapterView from "../../src/components/ChapterView.jsx";
import { installDomStubs } from "./helpers.js";

const rows = [
  [43, 1, 1, "In the beginning was the Word", "太初有话"],
  [43, 1, 2, "He was in the beginning with God", "这话太初与神同在"],
];

function setup(props = {}) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const utils = render(
    <ChapterView
      book={43}
      chapter={1}
      bookName="John"
      verses={rows}
      lang="en"
      scroll="none"
      selected={new Set()}
      onToggleSelect={() => {}}
      onCopy={() => {}}
      canPrev
      canNext
      prevLabel="Luke 24"
      nextLabel="John 2"
      onPrev={onPrev}
      onNext={onNext}
      {...props}
    />,
  );
  return { ...utils, onPrev, onNext };
}

const block = () => document.querySelector(".chapter-block");
const pt = (x, y) => ({ clientX: x, clientY: y });

/** A whole flick: down, one move along the way, up. */
function swipe(x0, x1, { y0 = 400, y1 = 400, ms = 120, target = block() } = {}) {
  const now = vi.spyOn(Date, "now");
  now.mockReturnValue(1000);
  fireEvent.touchStart(target, { touches: [pt(x0, y0)] });
  fireEvent.touchMove(block(), { touches: [pt((x0 + x1) / 2, (y0 + y1) / 2)] });
  now.mockReturnValue(1000 + ms);
  fireEvent.touchEnd(block(), { changedTouches: [pt(x1, y1)] });
  now.mockRestore();
}

beforeEach(() => {
  installDomStubs();
  vi.clearAllMocks();
});

afterEach(() => {
  document.querySelectorAll("dialog").forEach((d) => d.remove());
  vi.restoreAllMocks();
});

describe("swipe navigation", () => {
  it("flicks left for the next chapter and right for the previous one", () => {
    const { onNext, onPrev } = setup();
    swipe(300, 120);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();

    swipe(120, 300);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("ignores a drag too short to be meant", () => {
    const { onNext } = setup();
    swipe(300, 260);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("ignores a scroll that drifted sideways", () => {
    const { onPrev, onNext } = setup();
    swipe(300, 200, { y0: 400, y1: 90 });
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("leaves the screen edges to the browser's own back gesture", () => {
    const { onNext, onPrev } = setup();
    swipe(8, 300); // left edge
    swipe(window.innerWidth - 6, 300); // right edge
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("ignores a pinch, and a second finger that arrives mid-drag", () => {
    const { onNext } = setup();
    fireEvent.touchStart(block(), { touches: [pt(300, 400), pt(340, 420)] });
    fireEvent.touchEnd(block(), { changedTouches: [pt(120, 400)] });
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.touchStart(block(), { touches: [pt(300, 400)] });
    fireEvent.touchMove(block(), { touches: [pt(240, 400), pt(280, 430)] });
    fireEvent.touchEnd(block(), { changedTouches: [pt(120, 400)] });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("stays put at the ends of the canon", () => {
    const { onNext } = setup({ canNext: false, nextLabel: null });
    swipe(300, 120);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does nothing while a dialog is open", () => {
    const { onNext } = setup();
    document.body.insertAdjacentHTML("beforeend", "<dialog open></dialog>");
    swipe(300, 120);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does nothing while text is selected", () => {
    const { onNext } = setup();
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "In the beginning",
    });
    swipe(300, 120);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("ignores a slow drag, which is a selection rather than a flick", () => {
    const { onNext } = setup();
    swipe(300, 120, { ms: 900 });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("gives the gesture up when the system cancels it", () => {
    const { onNext } = setup();
    fireEvent.touchStart(block(), { touches: [pt(300, 400)] });
    fireEvent.touchMove(block(), { touches: [pt(210, 400)] });
    fireEvent.touchCancel(block(), { changedTouches: [pt(210, 400)] });
    fireEvent.touchEnd(block(), { changedTouches: [pt(120, 400)] });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("never starts on a control that owns its own touches", () => {
    const { onNext } = setup();
    swipe(300, 120, { target: document.querySelector(".nav-btn") });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("leaves a mouse alone", () => {
    const { onNext, onPrev } = setup();
    fireEvent.mouseDown(block(), { clientX: 300, clientY: 400 });
    fireEvent.mouseMove(block(), { clientX: 120, clientY: 400 });
    fireEvent.mouseUp(block(), { clientX: 120, clientY: 400 });
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("calls the handler the view holds now, not the one it held at touchstart", () => {
    const { onNext, rerender } = setup();
    const later = vi.fn();
    fireEvent.touchStart(block(), { touches: [pt(300, 400)] });
    rerender(
      <ChapterView
        book={43}
        chapter={1}
        bookName="John"
        verses={rows}
        lang="en"
        scroll="none"
        selected={new Set()}
        onToggleSelect={() => {}}
        onCopy={() => {}}
        canPrev
        canNext
        prevLabel="Luke 24"
        nextLabel="John 2"
        onPrev={() => {}}
        onNext={later}
      />,
    );
    fireEvent.touchEnd(block(), { changedTouches: [pt(120, 400)] });
    expect(later).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("lets go of the element when the view does", () => {
    const { onNext, unmount } = setup();
    const el = block();
    unmount();
    expect(() => {
      fireEvent.touchStart(el, { touches: [pt(300, 400)] });
      fireEvent.touchEnd(el, { changedTouches: [pt(120, 400)] });
    }).not.toThrow();
    expect(onNext).not.toHaveBeenCalled();
  });
});
