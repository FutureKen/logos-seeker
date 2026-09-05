import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RefTooltip from "../../src/components/RefTooltip.jsx";
import { installDomStubs } from "./helpers.js";

const rows = [
  [43, 1, 1, "In the beginning was the Word", "太初有话"],
  [43, 1, 2, "He was in the beginning with God", "这话太初与神同在"],
];

// The tooltip reads the verse index straight off the shared BibleSearch, so a
// stub keeps this test away from the 7.5 MB verse file.
vi.mock("../../src/hooks/useBible.js", () => ({
  getBible: () => ({
    verses: rows,
    refMap: new Map(rows.map((r, i) => [`${r[0]}:${r[1]}:${r[2]}`, i])),
    bookByIdx: new Map([[43, { en: "John", cn: "约翰福音" }]]),
  }),
}));

function Harness({ lang = "en" }) {
  const ref = useRef(null);
  return (
    <div ref={ref}>
      <button type="button" className="ref-link" data-ref="43:1:1:0">
        John 1:1
      </button>
      <button type="button">not a reference</button>
      <RefTooltip containerRef={ref} lang={lang} />
    </div>
  );
}

const link = () => screen.getByRole("button", { name: "John 1:1" });
const tip = () => document.querySelector(".ref-tip");

beforeEach(() => {
  installDomStubs();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Hovering is only a hover once the pointer has rested for the delay. */
function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("reference hover preview", () => {
  it("waits out the delay before showing anything", () => {
    render(<Harness />);
    fireEvent.pointerOver(link());

    advance(299);
    expect(tip()).toBeNull();

    advance(2);
    expect(tip()).toBeInTheDocument();
    expect(tip()).toHaveTextContent("John 1:1");
    expect(tip()).toHaveTextContent("In the beginning was the Word");
  });

  it("shows nothing when the pointer passes straight through", () => {
    render(<Harness />);
    fireEvent.pointerOver(link());
    advance(150);
    fireEvent.pointerOut(link());
    advance(500);
    expect(tip()).toBeNull();
  });

  it("hides again when the pointer leaves", () => {
    render(<Harness />);
    fireEvent.pointerOver(link());
    advance(300);
    expect(tip()).toBeInTheDocument();

    fireEvent.pointerOut(link());
    expect(tip()).toBeNull();
  });

  it("hides when the link is clicked, so navigation is not covered", () => {
    render(<Harness />);
    fireEvent.pointerOver(link());
    advance(300);
    fireEvent.pointerDown(link());
    expect(tip()).toBeNull();
  });

  it("ignores elements that carry no reference", () => {
    render(<Harness />);
    fireEvent.pointerOver(screen.getByRole("button", { name: "not a reference" }));
    advance(500);
    expect(tip()).toBeNull();
  });

  it("previews the Chinese text when the language is Chinese", () => {
    render(<Harness lang="cn" />);
    fireEvent.pointerOver(link());
    advance(300);
    expect(tip()).toHaveTextContent("太初有话");
    expect(tip()).toHaveClass("cn");
  });

  it("opens on keyboard focus too", () => {
    render(<Harness />);
    fireEvent.focusIn(link());
    expect(tip()).toBeInTheDocument();
  });
});
