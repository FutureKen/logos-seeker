import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../../src/App.jsx";
import {
  installClipboard,
  installDomStubs,
  installFetch,
  resetEnvironment,
} from "./helpers.js";

// The real books.json / verses.json are served from disk, so these are true
// end-to-end checks of the ported behaviour.

let clipboard;

beforeEach(() => {
  resetEnvironment();
  installDomStubs();
  installFetch();
  clipboard = installClipboard();
});

afterEach(() => {
  vi.useRealTimers();
});

const status = () => document.getElementById("status").textContent;
const rows = () => [...document.querySelectorAll("article.verse")];
const box = () => screen.getByLabelText("Search the Bible");

/** Type into the search box (the 220 ms debounce still applies). */
function type(text) {
  fireEvent.change(box(), { target: { value: text } });
}

/** Type and submit — what pressing Enter does. */
function search(text) {
  type(text);
  fireEvent.submit(document.getElementById("search-form"));
}

describe("search box", () => {
  it("debounces typing by 220 ms", async () => {
    vi.useFakeTimers();
    render(<App />);
    type("John 1:1");
    act(() => vi.advanceTimersByTime(200));
    expect(status()).toBe("");
    act(() => vi.advanceTimersByTime(40));
    // The query is committed now: either still loading, or already answered.
    expect(status()).not.toBe("");
    vi.useRealTimers();
    await waitFor(() => expect(status()).toBe("1 result"));
  });

  it("Enter searches at once and syncs the hash both ways", async () => {
    render(<App />);
    search("John 1:1");
    await waitFor(() => expect(status()).toBe("1 result"));
    expect(decodeURIComponent(window.location.hash)).toBe("#q=John 1:1");

    // …and an externally changed hash re-runs the search.
    act(() => {
      window.location.hash = "#q=" + encodeURIComponent("John 1:3");
    });
    await waitFor(() => expect(box()).toHaveValue("John 1:3"));
    expect(rows()[0].textContent).toContain("All things came into being through Him");
  });

  it("restores a query from the hash on load", async () => {
    window.history.replaceState(null, "", "/#q=" + encodeURIComponent("John 1:1"));
    render(<App />);
    await waitFor(() => expect(status()).toBe("1 result"));
    expect(box()).toHaveValue("John 1:1");
  });

  it("clears with the X button", async () => {
    render(<App />);
    search("John 1:1");
    await waitFor(() => expect(status()).toBe("1 result"));
    fireEvent.click(screen.getByRole("button", { name: /Clear search/ }));
    expect(box()).toHaveValue("");
    await waitFor(() => expect(screen.getByText(/Type a reference like/)).toBeVisible());
  });

  it("asks for at least two characters in English", async () => {
    render(<App />);
    search("a");
    await waitFor(() =>
      expect(
        screen.getByText("Type at least 2 characters to search English text."),
      ).toBeVisible(),
    );
  });
});

describe("results", () => {
  it("pages keyword matches 20 at a time", async () => {
    render(<App />);
    search("love");
    await waitFor(() => expect(status()).toMatch(/^Showing 20 of \d+ matches$/));
    expect(rows()).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: /More results/ }));
    expect(rows()).toHaveLength(40);
    expect(status()).toMatch(/^Showing 40 of \d+ matches$/);
  });

  it("highlights the matched words", async () => {
    render(<App />);
    search("tree of life");
    await waitFor(() => expect(status()).toBe("Showing 14 of 14 matches"));
    const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toContain("tree of life");
  });

  it("offers every reading of an ambiguous reference", async () => {
    render(<App />);
    search("heb 111");
    await waitFor(() => expect(status()).toBe("2 possible references"));
    const refs = [...document.querySelectorAll(".ref")].map((r) => r.textContent);
    expect(refs).toEqual(["Hebrews 1:11", "Hebrews 11:1"]);
  });

  it("says so when nothing matches", async () => {
    render(<App />);
    search("zzzzqqq");
    await waitFor(() => expect(screen.getByText("No results found.")).toBeVisible());
  });
});

describe("selection and copying", () => {
  it("copies one verse, or the whole selection once verses are picked", async () => {
    render(<App />);
    search("John 1:1-3");
    await waitFor(() => expect(status()).toBe("3 results"));

    // No selection → the clicked row only.
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Copy verse" }));
    await waitFor(() =>
      expect(clipboard).toHaveBeenLastCalledWith(
        expect.stringMatching(/^John 1:1 {2}In the beginning was the Word/),
      ),
    );

    // Tapping the text selects; two selected rows raise the deselect pill.
    fireEvent.click(within(rows()[0]).getByText(/In the beginning was the Word/));
    fireEvent.click(within(rows()[1]).getByText(/He was in the beginning with God/));
    const deselect = await screen.findByRole("button", { name: "Deselect all (2)" });

    fireEvent.click(within(rows()[2]).getByRole("button", { name: "Copy verse" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledTimes(2));
    const copied = clipboard.mock.calls.at(-1)[0];
    expect(copied.split("\n")).toHaveLength(2);
    expect(copied).toMatch(/^John 1:1 {2}/);
    expect(copied).toContain("\nJohn 1:2  ");

    fireEvent.click(deselect);
    expect(screen.queryByRole("button", { name: /Deselect all/ })).toBeNull();
  });

  it("drops the selection when the query changes", async () => {
    render(<App />);
    search("John 1:1-3");
    await waitFor(() => expect(status()).toBe("3 results"));
    fireEvent.click(within(rows()[0]).getByText(/In the beginning was the Word/));
    fireEvent.click(within(rows()[1]).getByText(/He was in the beginning with God/));
    await screen.findByRole("button", { name: "Deselect all (2)" });

    search("John 3:16");
    await waitFor(() => expect(status()).toBe("1 result"));
    expect(screen.queryByRole("button", { name: /Deselect all/ })).toBeNull();
  });
});

describe("chapter view", () => {
  it("opens on a reference tap and returns with the back button", async () => {
    render(<App />);
    search("love");
    await waitFor(() => expect(status()).toMatch(/^Showing 20 of/));
    fireEvent.click(screen.getByRole("button", { name: /More results/ }));
    expect(rows()).toHaveLength(40);
    const firstRef = document.querySelectorAll(".ref")[0].textContent;

    fireEvent.click(document.querySelectorAll(".ref")[0]);
    expect(document.querySelector(".chapter-block")).not.toBeNull();
    expect(status()).toBe("");
    await waitFor(() => expect(window.location.hash).toMatch(/^#c=\d+:\d+:\d+$/));

    // Back restores the list *and* how far it had been paged.
    fireEvent.click(screen.getByRole("button", { name: "Back to search results" }));
    expect(document.querySelector(".chapter-block")).toBeNull();
    expect(rows()).toHaveLength(40);
    expect(status()).toMatch(/^Showing 40 of/);
    expect(document.querySelectorAll(".ref")[0].textContent).toBe(firstRef);
    await waitFor(() =>
      expect(decodeURIComponent(window.location.hash)).toBe("#q=love"),
    );
  });

  it("renders a whole-chapter query as a chapter, with no back button", async () => {
    render(<App />);
    search("John 1");
    await waitFor(() => expect(document.querySelector(".chapter-block")).not.toBeNull());
    expect(screen.getByText("John 1")).toBeInTheDocument();
    expect(document.querySelectorAll(".chapter-verse")).toHaveLength(51);
    expect(screen.queryByRole("button", { name: "Back to search results" })).toBeNull();
  });

  it("moves to the next chapter and keeps the interlinear preference", async () => {
    render(<App />);
    search("John 1");
    await waitFor(() => expect(document.querySelector(".chapter-block")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Interlinear" }));
    await waitFor(() => expect(localStorage.getItem("ls-interlinear")).toBe("1"));
    expect(document.querySelectorAll(".il-line")).toHaveLength(102);

    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await waitFor(() => expect(screen.getByText("John 2")).toBeInTheDocument());
    expect(document.querySelector(".il-toggle").className).toContain("active");
  });

  it("restores a chapter from the #c= hash", async () => {
    window.history.replaceState(null, "", "/#c=43:1:3");
    render(<App />);
    await waitFor(() => expect(screen.getByText("John 1")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.querySelector('[data-verse-no="3"]').className).toContain("focused"),
    );
  });
});

describe("preferences", () => {
  it("the language toggle persists and re-labels everything", async () => {
    render(<App />);
    search("John 1:1");
    await waitFor(() => expect(status()).toBe("1 result"));

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(localStorage.getItem("ls-lang")).toBe("cn"));
    expect(document.documentElement.lang).toBe("zh");
    expect(status()).toBe("共 1 处匹配");
    expect(document.querySelector(".ref").textContent).toBe("约翰福音 1:1");
  });

  it("a Chinese query switches the display language by itself", async () => {
    render(<App />);
    search("生命树");
    await waitFor(() => expect(localStorage.getItem("ls-lang")).toBe("cn"));
    expect(status()).toMatch(/^显示 \d+ \/ 共 \d+ 处匹配$/);
  });

  it("the theme toggle flips and persists", async () => {
    render(<App />);
    const before = document.documentElement.getAttribute("data-theme");
    fireEvent.click(screen.getByRole("button", { name: /Switch to (dark|light) mode/ }));
    const after = document.documentElement.getAttribute("data-theme");
    expect(after).not.toBe(before);
    await waitFor(() => expect(localStorage.getItem("ls-theme")).toBe(after));
  });

  it("the install walkthrough opens from the footer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "How to add to Home Screen" }));
    expect(screen.getByRole("heading", { name: /Add to Home Screen/ })).toBeVisible();
    expect(document.querySelectorAll(".help-step")).toHaveLength(3);
  });
});
