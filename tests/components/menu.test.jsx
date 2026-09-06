import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AppProvider, { useApp } from "../../src/state/AppProvider.jsx";
import TopBar from "../../src/components/TopBar.jsx";
import { resetBooks } from "../../src/hooks/useBooks.js";
import { resetBible } from "../../src/hooks/useBible.js";
import { installDomStubs, installFetch, resetEnvironment } from "./helpers.js";

/** Reports the view the menu navigated to, so a chapter pick is observable. */
function ViewProbe() {
  const { state } = useApp();
  const v = state.view;
  return (
    <p data-testid="view">
      {v.kind === "chapter" ? `chapter ${v.book}:${v.chapter}` : v.kind}
    </p>
  );
}

function renderMenu() {
  installFetch();
  const utils = render(
    <AppProvider>
      <TopBar />
      <ViewProbe />
    </AppProvider>,
  );
  return utils;
}

/** Open the menu and wait for the book list to arrive. */
async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Bible books/i }));
  await screen.findByText("Genesis");
}

beforeEach(() => {
  resetEnvironment();
  resetBooks();
  resetBible();
  installDomStubs();
});

describe("book menu", () => {
  it("lists all 66 books in two testaments, with chapter counts", async () => {
    renderMenu();
    await openMenu();

    expect(screen.getByText("Old Testament")).toBeInTheDocument();
    expect(screen.getByText("New Testament")).toBeInTheDocument();
    expect(document.querySelectorAll(".bm-book")).toHaveLength(66);
    // Genesis has 50 chapters; the card says so.
    expect(screen.getByText("Genesis").closest(".bm-book")).toHaveTextContent("50 ch.");
  });

  it("opens a book's chapter grid, and goes back to the list", async () => {
    renderMenu();
    await openMenu();

    fireEvent.click(screen.getByText("John"));
    await waitFor(() => expect(document.querySelectorAll(".bm-chapter")).toHaveLength(21));
    expect(screen.getByText("John", { selector: ".bm-book-name" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /All books/i }));
    await screen.findByText("Genesis");
    expect(document.querySelectorAll(".bm-chapter")).toHaveLength(0);
  });

  it("picking a chapter opens it and closes the menu", async () => {
    renderMenu();
    await openMenu();

    fireEvent.click(screen.getByText("John"));
    await waitFor(() => expect(document.querySelectorAll(".bm-chapter")).toHaveLength(21));
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    await waitFor(() =>
      expect(screen.getByTestId("view")).toHaveTextContent("chapter 43:3"),
    );
    expect(document.querySelector("dialog.book-menu").open).toBe(false);
  });

  it("a one-chapter book skips the chapter grid", async () => {
    renderMenu();
    await openMenu();

    fireEvent.click(screen.getByText("Jude"));
    await waitFor(() =>
      expect(screen.getByTestId("view")).toHaveTextContent("chapter 65:1"),
    );
  });
});
