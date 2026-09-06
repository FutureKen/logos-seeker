import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AppProvider from "../../src/state/AppProvider.jsx";
import App from "../../src/App.jsx";
import { resetBooks } from "../../src/hooks/useBooks.js";
import { resetBible } from "../../src/hooks/useBible.js";
import { installDomStubs, installFetch, resetEnvironment } from "./helpers.js";

const dialog = () => document.querySelector("dialog.abbrev-dialog");
const rows = () => [...document.querySelectorAll(".ab-row")];

/** Open the abbreviations list from the question mark beside the hint. */
async function openAbbrev() {
  installFetch();
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Book name abbreviations" }));
  await screen.findByText("Genesis");
}

beforeEach(() => {
  resetEnvironment();
  resetBooks();
  resetBible();
  installDomStubs();
});

describe("book name abbreviations", () => {
  it("opens from the hint and lists every book in both testaments", async () => {
    await openAbbrev();
    expect(dialog().open).toBe(true);
    expect(screen.getByText("Old Testament")).toBeInTheDocument();
    expect(screen.getByText("New Testament")).toBeInTheDocument();
    expect(rows()).toHaveLength(66);
  });

  it("shows each book in both languages with the aliases the parser accepts", async () => {
    await openAbbrev();
    const genesis = screen.getByText("Genesis").closest(".ab-row");
    expect(genesis.querySelector(".ab-cn").textContent).toBe("创世记");
    // Straight from books.json, so the list cannot drift from what is parsed.
    const aliases = [...genesis.querySelectorAll(".ab-alias")].map((a) => a.textContent);
    expect(aliases).toEqual(expect.arrayContaining(["genesis", "gen", "创"]));

    // A numbered book keeps its digit forms.
    const first = screen.getByText("1 John").closest(".ab-row");
    expect([...first.querySelectorAll(".ab-alias")].map((a) => a.textContent)).toEqual(
      expect.arrayContaining(["1 john", "约一"]),
    );
  });

  it("closes again", async () => {
    await openAbbrev();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(dialog().open).toBe(false);
  });
});
