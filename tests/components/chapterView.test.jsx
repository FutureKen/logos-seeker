import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChapterView from "../../src/components/ChapterView.jsx";
import { installDomStubs } from "./helpers.js";

// verses.json rows: [book, chapter, verse, en, cn]
const rows = [
  [43, 1, 1, "In the beginning was the Word", "太初有话"],
  [43, 1, 2, "He was in the beginning with God", "这话太初与神同在"],
  [43, 1, 3, "All things came into being through Him", ""],
];

function setup(props = {}) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const onToggleSelect = vi.fn();
  const onCopy = vi.fn();
  const onToggleInterlinear = vi.fn();
  const utils = render(
    <ChapterView
      book={43}
      chapter={1}
      bookName="John"
      verses={rows}
      lang="en"
      selected={new Set()}
      onToggleSelect={onToggleSelect}
      onCopy={onCopy}
      canPrev
      canNext
      prevLabel="Luke 24"
      nextLabel="John 2"
      onPrev={onPrev}
      onNext={onNext}
      onToggleInterlinear={onToggleInterlinear}
      {...props}
    />,
  );
  return { ...utils, onPrev, onNext, onToggleSelect, onCopy, onToggleInterlinear };
}

beforeEach(() => {
  installDomStubs();
  vi.clearAllMocks();
});

describe("ChapterView", () => {
  it("renders the title, every verse and its number", () => {
    setup();
    expect(screen.getByText("John 1")).toBeInTheDocument();
    expect(screen.getByText(/In the beginning was the Word/)).toBeInTheDocument();
    expect(document.querySelectorAll(".chapter-verse")).toHaveLength(3);
    expect(document.querySelectorAll(".vnum")[2].textContent).toBe("3");
  });

  it("wires prev/next and disables them at the ends of the canon", () => {
    const { onPrev, onNext, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);

    rerender(
      <ChapterView
        book={43}
        chapter={1}
        bookName="John"
        verses={rows}
        lang="en"
        selected={new Set()}
        onToggleSelect={() => {}}
        onCopy={() => {}}
        canPrev={false}
        canNext={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next chapter" })).toBeDisabled();
  });

  it("moves chapters with ←/→ but not while typing, and not with a modifier", () => {
    const { onPrev, onNext } = setup();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(onPrev).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("leaves ←/→ to a dialog open over the text", () => {
    const { onPrev, onNext } = setup();
    const d = document.createElement("dialog");
    document.body.appendChild(d);
    d.setAttribute("open", "");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    d.remove();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("lands on the focus verse and highlights it briefly", () => {
    vi.useFakeTimers();
    setup({ focusVerse: 2, scroll: "verse" });
    const verse2 = document.querySelector('[data-verse-no="2"]');
    expect(verse2.className).toContain("focused");
    expect(window.scrollTo).toHaveBeenCalled();
    vi.advanceTimersByTime(2100);
    vi.useRealTimers();
  });

  it("starts at the chapter heading when the focus verse is the first one", () => {
    setup({ focusVerse: 1, scroll: "verse" });
    expect(document.querySelector(".focused")).toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("does not scroll at all when restoring a view", () => {
    setup({ scroll: "none" });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("selection and copy report the verse key and row", () => {
    const { onToggleSelect, onCopy } = setup();
    fireEvent.click(screen.getByText(/He was in the beginning with God/));
    expect(onToggleSelect).toHaveBeenCalledWith("43:1:2");
    fireEvent.dblClick(screen.getByText(/In the beginning was the Word/));
    expect(onCopy).toHaveBeenCalledWith(rows[0]);
  });

  it("copies on two taps, which is all a touch screen reports", () => {
    const { onCopy, onToggleSelect } = setup();
    const text = screen.getByText(/In the beginning was the Word/);
    // No dblclick here: with double-tap zoom out of the way a phone sends two
    // plain clicks and nothing else.
    fireEvent.click(text);
    fireEvent.click(text);
    expect(onCopy).toHaveBeenCalledWith(rows[0]);
    expect(onCopy).toHaveBeenCalledTimes(1);
    // Selected and put back, so the row is left as it was found.
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
  });

  it("copies once when a mouse sends the clicks and the dblclick", () => {
    const { onCopy } = setup();
    const text = screen.getByText(/In the beginning was the Word/);
    fireEvent.click(text);
    fireEvent.click(text);
    fireEvent.dblClick(text);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("does not copy two taps that are far apart", () => {
    const { onCopy, onToggleSelect } = setup();
    const text = screen.getByText(/In the beginning was the Word/);
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(10_000);
    fireEvent.click(text);
    now.mockReturnValue(12_000);
    fireEvent.click(text);
    now.mockRestore();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
  });

  it("marks selected verses", () => {
    setup({ selected: new Set(["43:1:2"]) });
    expect(document.querySelector('[data-verse-no="2"]').className).toContain("selected");
    expect(document.querySelector('[data-verse-no="1"]').className).not.toContain("selected");
  });

  it("interlinear shows both languages, with an (EN) note where Chinese is missing", () => {
    setup({ interlinear: true });
    expect(screen.getByText("太初有话")).toBeInTheDocument();
    expect(screen.getByText(/In the beginning was the Word/)).toBeInTheDocument();
    const alt = document.querySelectorAll(".il-line.cn .alt-note");
    expect(alt).toHaveLength(1);
    expect(alt[0].textContent).toContain("All things came into being through Him");
  });

  it("repeats prev/next at the foot of the chapter, naming where each one goes", () => {
    const { onPrev, onNext } = setup();
    const block = document.querySelector(".chapter-block");
    expect(block.lastElementChild.className).toContain("chapter-end");

    fireEvent.click(screen.getByRole("button", { name: "Previous chapter: Luke 24" }));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter: John 2" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    // The named pair leaves the header arrows unambiguous.
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeInTheDocument();
  });

  it("drops the chapter-end button at the end of the canon", () => {
    setup({ canPrev: false, prevLabel: null });
    const ends = document.querySelectorAll(".chapter-end-btn");
    expect(ends).toHaveLength(1);
    expect(ends[0].className).toContain("chapter-end-next");
    expect(screen.getByRole("button", { name: "Previous chapter" })).toBeDisabled();
  });

  it("hides the whole end row when neither direction exists", () => {
    setup({ canPrev: false, canNext: false, prevLabel: null, nextLabel: null });
    expect(document.querySelector(".chapter-end")).toBeNull();
  });

  it("arrives at a new chapter instantly rather than scrolling smoothly to it", () => {
    setup({ scroll: "top" });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("shows Chinese labels and text in cn", () => {
    setup({ lang: "cn", prevLabel: "路加福音 24" });
    expect(screen.getByRole("button", { name: "上一章" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一章：路加福音 24" })).toBeInTheDocument();
    expect(screen.getByText("太初有话")).toBeInTheDocument();
    // Verse 3 has no Chinese text, so the English is used verbatim.
    expect(screen.getByText(/All things came into being through Him/)).toBeInTheDocument();
  });
});
