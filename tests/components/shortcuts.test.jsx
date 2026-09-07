import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AppProvider from "../../src/state/AppProvider.jsx";
import App from "../../src/App.jsx";
import ShortcutsDialog from "../../src/components/ShortcutsDialog.jsx";
import { SHORTCUTS } from "../../src/lib/i18n.js";
import { resetBooks } from "../../src/hooks/useBooks.js";
import { resetBible } from "../../src/hooks/useBible.js";
import { installDomStubs, installFetch, resetEnvironment } from "./helpers.js";

const dialog = () => document.querySelector("dialog#shortcuts");
const rows = () => [...document.querySelectorAll(".sc-row")];
const groups = () => [...document.querySelectorAll(".sc-group-title")].map((h) => h.textContent);

function open(label = "Guide") {
  installFetch();
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  resetEnvironment();
  resetBooks();
  resetBible();
  installDomStubs();
});

describe("shortcuts and gestures", () => {
  it("opens from the ? in the footer and lists every group", () => {
    open();
    expect(dialog().open).toBe(true);
    expect(groups()).toEqual(["Moving between chapters", "Searching", "Selecting and copying"]);
  });

  it("leads the footer, with a tooltip that says what it is for", () => {
    open();
    const foot = document.querySelector(".foot");
    const btn = document.querySelector("#shortcuts-link");
    expect(foot.firstElementChild).toBe(btn);
    expect(btn).toHaveAttribute("title", expect.stringContaining("every way to move"));
    // The visible word is the name, so speech input can reach it; the sentence
    // is the tooltip's job and the full title belongs to the dialog.
    expect(btn).toHaveAccessibleName("Guide");
    expect(screen.getByRole("heading", { name: "Shortcuts and gestures" })).toBeInTheDocument();
    // The attribution closes the list rather than opening it.
    expect(foot.lastElementChild.textContent).toContain("Living Stream Ministry");
  });

  it("gives each row its keys and what they do", () => {
    open();
    const chapters = rows().slice(0, SHORTCUTS[0].rows.length);
    const keys = chapters.map((r) => [...r.querySelectorAll(".sc-key")].map((k) => k.textContent));
    expect(keys[0]).toEqual(["←", "→"]);
    expect(keys[1]).toEqual(["Swipe"]);
    expect(chapters[0].querySelector(".sc-what").textContent).toMatch(/Previous \/ next chapter/);

    // Both halves of a gesture that a mouse and a thumb name differently.
    const copy = screen.getByText(/Copy that verse with its reference/).closest(".sc-row");
    expect([...copy.querySelectorAll(".sc-key")].map((k) => k.textContent)).toEqual([
      "Double-click",
      "Double-tap",
    ]);
  });

  it("keeps the notes group back until the apparatus is unlocked", () => {
    open();
    expect(groups()).not.toContain("Notes and outlines");
    expect(rows()).toHaveLength(
      SHORTCUTS.filter((g) => !g.study).reduce((n, g) => n + g.rows.length, 0),
    );
  });

  it("shows the notes group once unlocked", () => {
    // Deriving a real key belongs to the unlock suite; the gate is the prop.
    render(<ShortcutsDialog open lang="en" study onClose={() => {}} />);
    expect(groups()).toContain("Notes and outlines");
    expect(screen.getByText(/superscript marker in the text/)).toBeInTheDocument();
    expect(rows()).toHaveLength(SHORTCUTS.reduce((n, g) => n + g.rows.length, 0));
  });

  it("is written in both languages", () => {
    localStorage.setItem("ls-lang", "cn");
    open("指南");
    expect(within(dialog()).getByText("在章之间移动")).toBeInTheDocument();
    expect(within(dialog()).getByText("滑动")).toBeInTheDocument();
    expect(within(dialog()).getByText(/向左滑到下一章/)).toBeInTheDocument();
    // Nothing falls back to English: every row carries a cn string.
    for (const g of SHORTCUTS) {
      expect(typeof g.cn).toBe("string");
      for (const r of g.rows) expect(typeof r.cn).toBe("string");
    }
  });

  it("closes again", () => {
    open();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(dialog().open).toBe(false);
  });
});
