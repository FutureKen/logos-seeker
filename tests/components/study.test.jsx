import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.jsx";
import VerseText from "../../src/components/VerseText.jsx";
import BookInfoCard from "../../src/components/BookInfoCard.jsx";
import {
  deriveKey,
  encryptJson,
  exportKey,
  makeVerify,
  randomSalt,
} from "../../src/study/studyCrypto.js";
import {
  installClipboard,
  installDomStubs,
  repoRoot,
  resetEnvironment,
} from "./helpers.js";

/**
 * The study UI, driven by the hand-written Genesis 1 fixtures
 * (`scripts/fixtures/study/1/**`, which are the data contract itself): they are
 * encrypted on the fly with a throwaway password, exactly as the real files are
 * at rest, and served to the app through a mocked `fetch`.
 */

const PASSWORD = "fixture-password";
const ITER = 1000;

const readFixture = (rel) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, "scripts/fixtures/study", rel), "utf8"));

let key;
let keyB64;
let studyFiles; // url suffix → JSON body

beforeAll(async () => {
  const salt = randomSalt();
  key = await deriveKey(PASSWORD, salt, ITER);
  keyB64 = await exportKey(key);
  studyFiles = new Map([
    [
      "data/study/index.json",
      {
        schema: 1,
        version: "test",
        kdf: { salt, iter: ITER },
        verify: await makeVerify(key),
        books: { 1: { chapters: 1, bytes: 4096 } },
        totalBytes: 4 * 1024 * 1024,
      },
    ],
    ["data/study/1/book.json", await encryptJson(readFixture("1/book.json"), key)],
    ["data/study/1/1.json", await encryptJson(readFixture("1/1.json"), key)],
  ]);
});

/** Serve the study fixtures first, then the real `public/data` files. */
function installStudyFetch() {
  const mock = vi.fn(async (url) => {
    const href = String(url);
    for (const [suffix, body] of studyFiles) {
      if (href.endsWith(suffix)) return { ok: true, status: 200, json: async () => body };
    }
    const m = /(data\/.+)$/.exec(href);
    if (m) {
      const file = path.join(repoRoot, "public", m[1]);
      if (fs.existsSync(file)) {
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(fs.readFileSync(file, "utf8")),
        };
      }
    }
    return { ok: false, status: 404, json: async () => null };
  });
  globalThis.fetch = mock;
  return mock;
}

let clipboard;

beforeEach(() => {
  resetEnvironment();
  installDomStubs();
  installStudyFetch();
  clipboard = installClipboard();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Unlock the study data the way a returning device does. */
function unlockedSession({ study = true } = {}) {
  localStorage.setItem("ls-study-key", keyB64);
  localStorage.setItem("ls-study", study ? "1" : "0");
}

function search(text) {
  fireEvent.change(screen.getByLabelText("Search the Bible"), { target: { value: text } });
  fireEvent.submit(document.getElementById("search-form"));
}

const verseEl = (n) => document.querySelector(`.chapter-verse[data-verse-no="${n}"]`);
const markersIn = (n) => [...verseEl(n).querySelectorAll(".mk")].map((m) => m.textContent);
const sheet = () => document.querySelector(".study-sheet");
const cards = () => [...document.querySelectorAll(".note-card")];

/** Open Genesis 1 with the apparatus loaded. */
async function openGenesis1() {
  render(<App />);
  search("gen 1");
  await waitFor(() => expect(screen.getByText("Genesis 1")).toBeInTheDocument());
  await waitFor(() => expect(verseEl(1).querySelector(".mk")).not.toBeNull());
}

/* ============================== unit: VerseText ============================== */

describe("VerseText", () => {
  const text = "In the beginning God created the heavens and the earth.";
  const apparatus = {
    m: [
      { l: "1a", p: 0, n: 1, x: "a", w: "In" },
      { l: "2", p: 7, n: 2, w: "beginning" },
      { l: "b", p: 17, x: "b", w: "God" },
    ],
  };

  it("renders the text verbatim when study is off", () => {
    const { container } = render(
      <VerseText text={text} verseNo={1} apparatus={apparatus} study={false} />,
    );
    expect(container.querySelectorAll("sup")).toHaveLength(0);
    expect(container.textContent).toBe(`1${text}`);
  });

  it("puts each marker in front of the word it annotates", () => {
    const { container } = render(
      <VerseText text={text} verseNo={1} apparatus={apparatus} study />,
    );
    expect(container.textContent).toBe(
      "11aIn the 2beginning bGod created the heavens and the earth.",
    );
    const sups = [...container.querySelectorAll("sup")];
    expect(sups.map((s) => s.textContent)).toEqual(["1a", "2", "b"]);
    // Digits are the note number, letters the cross-reference letter.
    expect(sups[0].querySelector(".mk-n").textContent).toBe("1");
    expect(sups[0].querySelector(".mk-x").textContent).toBe("a");
    expect(sups[2].querySelector(".mk-n")).toBeNull();
    // Markers are hidden from assistive tech; the verse number is the handle.
    expect(sups.every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("groups unaligned markers right after the verse number", () => {
    const { container } = render(
      <VerseText
        text={text}
        verseNo={3}
        apparatus={{ m: [{ l: "a", p: null, x: "a" }, { l: "1", p: 3, n: 1 }] }}
        study
      />,
    );
    expect(container.textContent).toBe("3aIn 1the beginning God created the heavens and the earth.");
    expect(container.querySelector(".mk").className).toContain("mk-float");
  });

  it("makes the verse number a button only when the verse has apparatus", () => {
    const onVerseNumber = vi.fn();
    const { container, rerender } = render(
      <VerseText text={text} verseNo={1} apparatus={apparatus} study onVerseNumber={onVerseNumber} />,
    );
    fireEvent.click(container.querySelector(".vnum-btn"));
    expect(onVerseNumber).toHaveBeenCalled();

    rerender(<VerseText text={text} verseNo={1} apparatus={null} study onVerseNumber={onVerseNumber} />);
    expect(container.querySelector(".vnum-btn")).toBeNull();
  });

  it("weaves a mid-verse outline heading into the text", () => {
    const { container } = render(
      <VerseText
        text={text}
        verseNo={2}
        apparatus={null}
        heads={[{ level: 3, label: "1.", title: "A new section", pos: 7 }]}
        study
      />,
    );
    const head = container.querySelector(".otl-inline");
    expect(head.textContent).toBe("1.A new section");
    expect(container.textContent).toBe("2In the 1.A new sectionbeginning God created the heavens and the earth.");
  });
});

/* ============================ unit: BookInfoCard ============================ */

describe("BookInfoCard", () => {
  const info = {
    author: [["Paul"]],
    written: [["About A.D. 62"]],
    place: [["Rome"]],
    period: [["A.D. 62"]],
    recipients: [["The saints in Ephesus (", { ref: [49, 1, 1, 0], t: "1:1" }, ")."]],
    subject: [["Christ and the church"]],
  };

  it("renders six rows, including Recipients, and links its references", () => {
    const onGoto = vi.fn();
    const { container } = render(<BookInfoCard info={info} lang="en" onGoto={onGoto} />);
    const labels = [...container.querySelectorAll(".bi-label")].map((e) => e.textContent);
    expect(labels).toEqual([
      "Author",
      "Time of Writing",
      "Place of Writing",
      "Time Period Covered",
      "Recipients",
      "Subject",
    ]);
    fireEvent.click(container.querySelector(".bi-recipients .ref-link"));
    expect(onGoto).toHaveBeenCalledWith([49, 1, 1, 0]);
  });

  it("skips fields the source does not carry, and uses Chinese labels", () => {
    const { container } = render(
      <BookInfoCard info={{ author: [["摩西"]], subject: [["神的创造"]] }} lang="cn" />,
    );
    expect([...container.querySelectorAll(".bi-label")].map((e) => e.textContent)).toEqual([
      "著者",
      "主题",
    ]);
  });
});

/* ============================ the chapter view ============================ */

describe("chapter view with study on", () => {
  it("renders no markers at all while study is off", async () => {
    unlockedSession({ study: false });
    render(<App />);
    search("gen 1");
    await waitFor(() => expect(screen.getByText("Genesis 1")).toBeInTheDocument());
    expect(document.querySelectorAll("sup")).toHaveLength(0);
    expect(document.querySelector(".otl")).toBeNull();
    expect(document.querySelector(".vnum-btn")).toBeNull();
  });

  it("shows the markers, the outline heading above verse 1 and the mid-verse one in 1:2", async () => {
    unlockedSession();
    await openGenesis1();

    expect(markersIn(1)).toEqual(["1a", "2", "b"]);
    expect(verseEl(1).querySelector(".text").textContent).toBe(
      "11aIn the 2beginning bGod created the heavens and the earth.",
    );

    // Block headings stand in front of the verse their range starts at.
    const before = verseEl(1).previousElementSibling;
    expect(before.className).toContain("otl");
    expect(before.textContent).toContain("The heavens and the earth created by God");
    expect(verseEl(2).previousElementSibling.textContent).toContain(
      "The earth becoming waste and empty",
    );

    // …and a section that opens mid-verse is rendered inside the verse.
    const mid = verseEl(2).querySelector(".otl-inline");
    expect(mid.textContent).toContain("God's restoration and further creation");

    // The repeated marker in 1:2 appears twice with the same label.
    expect(markersIn(2)).toEqual(["1", "2", "1"]);
    // A marker that could not be aligned floats after the verse number.
    expect(verseEl(3).querySelector(".mk").className).toContain("mk-float");
  });

  it("copies the plain verse text, without any marker labels", async () => {
    unlockedSession();
    await openGenesis1();
    fireEvent.click(verseEl(1).querySelector(".copy-btn"));
    await waitFor(() =>
      expect(clipboard).toHaveBeenLastCalledWith(
        "Genesis 1:1  In the beginning God created the heavens and the earth.",
      ),
    );
  });

  it("shows markers on both lines in interlinear mode", async () => {
    unlockedSession();
    await openGenesis1();
    fireEvent.click(screen.getByRole("button", { name: "Interlinear" }));
    await waitFor(() => expect(document.querySelector(".il-line")).not.toBeNull());
    const lines = verseEl(1).querySelectorAll(".il-line");
    expect([...lines[0].querySelectorAll(".mk")].map((m) => m.textContent)).toEqual([
      "1a",
      "2",
      "b",
    ]);
    expect([...lines[1].querySelectorAll(".mk")].map((m) => m.textContent)).toEqual([
      "1a",
      "2",
      "b",
    ]);
  });
});

/* ============================== the study sheet ============================== */

describe("study sheet", () => {
  it("a marker tap opens the sheet on that card", async () => {
    unlockedSession();
    await openGenesis1();

    fireEvent.click(verseEl(1).querySelectorAll(".mk")[1]);
    await waitFor(() => expect(sheet().open).toBe(true));
    expect(document.querySelector(".sheet-title").textContent).toContain("Genesis 1:1");

    const focused = document.querySelector(".note-card.focused");
    expect(focused.dataset.card).toBe("1");
    expect(focused.querySelector(".nc-label").textContent).toBe("2");
    expect(focused.querySelector(".nc-word").textContent).toBe("beginning");
    expect(focused.textContent).toContain("Placeholder note text for marker 2");
  });

  it("a verse-number tap lists every marker of the verse, with its cross-references", async () => {
    unlockedSession();
    await openGenesis1();

    fireEvent.click(verseEl(1).querySelector(".vnum-btn"));
    await waitFor(() => expect(sheet().open).toBe(true));
    expect(document.querySelector(".note-card.focused")).toBeNull();
    expect(cards().map((c) => c.querySelector(".nc-label").textContent)).toEqual(["1a", "2", "b"]);

    // "cf." introduces a run of comparison references, once.
    expect(cards()[0].querySelector(".cf-prefix").textContent).toBe("cf.");
    expect([...cards()[2].querySelectorAll(".xref-chip")].map((c) => c.textContent)).toEqual([
      "Zech. 12:1",
      "Psa. 33:6",
    ]);
    expect(cards()[2].querySelectorAll(".cf-prefix")).toHaveLength(0);
  });

  it("marks the second occurrence of a note as a repeat", async () => {
    unlockedSession();
    await openGenesis1();
    fireEvent.click(verseEl(2).querySelector(".vnum-btn"));
    await waitFor(() => expect(sheet().open).toBe(true));
    expect(cards()).toHaveLength(3);
    expect(cards()[0].textContent).toContain("Placeholder note text for the repeated marker");
    expect(cards()[2].querySelector(".nc-repeat").textContent).toBe("Same as note 1 above");
  });

  it("flips only the sheet between EN and 中", async () => {
    unlockedSession();
    await openGenesis1();
    fireEvent.click(verseEl(1).querySelector(".vnum-btn"));
    await waitFor(() => expect(sheet().open).toBe(true));
    expect(cards()[1].textContent).toContain("Placeholder note text for marker 2");

    fireEvent.click(screen.getByRole("button", { name: "中" }));
    await waitFor(() => expect(cards()[1].textContent).toContain("占位注解二"));
    // The chapter underneath is still English.
    expect(verseEl(1).textContent).toContain("God created the heavens and the earth.");
  });

  it("lists the outline with the current chapter highlighted", async () => {
    unlockedSession();
    await openGenesis1();
    fireEvent.click(screen.getByRole("button", { name: "Outline" }));
    await waitFor(() => expect(sheet().open).toBe(true));

    const items = [...document.querySelectorAll(".otl-item")];
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toContain("God's creation");
    // Every fixture entry starts in Genesis 1, so all four are the current one.
    expect(items.every((i) => i.className.includes("current"))).toBe(true);
  });

  it("shows the book info in the Book tab", async () => {
    unlockedSession();
    await openGenesis1();
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    await waitFor(() => expect(sheet().open).toBe(true));
    expect(document.querySelector(".sheet-body .book-info")).not.toBeNull();
    expect(document.querySelector(".sheet-body").textContent).toContain(
      "Placeholder subject line",
    );
  });

  it("a reference link navigates, pushes the nav stack, and comes back", async () => {
    unlockedSession();
    await openGenesis1();

    // The book-info card on chapter 1 carries a reference too.
    expect(document.querySelector(".chapter-block .book-info")).not.toBeNull();

    fireEvent.click(verseEl(1).querySelectorAll(".mk")[0]);
    await waitFor(() => expect(sheet().open).toBe(true));
    fireEvent.click(document.querySelector(".note-card .ref-link"));

    await waitFor(() => expect(screen.getByText("John 1")).toBeInTheDocument());
    expect(sheet()?.open ?? false).toBe(false);
    // Landed on the referenced verse, and the back button now returns to Genesis.
    const back = screen.getByRole("button", { name: "Back to search results" });
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByText("Genesis 1")).toBeInTheDocument());
  });
});
