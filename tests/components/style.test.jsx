import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AppProvider from "../../src/state/AppProvider.jsx";
import TopBar from "../../src/components/TopBar.jsx";
import { SIZES } from "../../src/lib/style.js";
import { installDomStubs, installFetch, resetEnvironment } from "./helpers.js";

/** jsdom answers every media query with `false`; say what the OS prefers. */
function stubMatchMedia(prefersLight) {
  window.matchMedia = vi.fn((query) => ({
    matches: query.includes("prefers-color-scheme: light") ? prefersLight : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const root = () => document.documentElement;
const openStyle = () =>
  fireEvent.click(screen.getByRole("button", { name: "Reading style" }));

function renderBar() {
  installFetch();
  return render(
    <AppProvider>
      <TopBar />
    </AppProvider>,
  );
}

beforeEach(() => {
  resetEnvironment();
  installDomStubs();
  root().removeAttribute("data-font");
  root().style.removeProperty("--reading-size");
  stubMatchMedia(false);
});

describe("reading style", () => {
  it("defaults to sepia when the system asks for a light appearance", () => {
    stubMatchMedia(true);
    renderBar();
    expect(root().getAttribute("data-theme")).toBe("sepia");
    // A default is not a choice, so it is not written to storage.
    expect(localStorage.getItem("ls-theme")).toBeNull();
  });

  it("defaults to the dark scheme in a dark environment", () => {
    stubMatchMedia(false);
    renderBar();
    expect(root().getAttribute("data-theme")).toBe("dark");
  });

  it("offers five schemes and applies the one picked", async () => {
    renderBar();
    openStyle();
    for (const name of ["Light", "Sepia", "Gray", "Dark", "Black"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /Black/ }));
    expect(root().getAttribute("data-theme")).toBe("black");
    await waitFor(() => expect(localStorage.getItem("ls-theme")).toBe("black"));

    fireEvent.click(screen.getByRole("button", { name: /Light/ }));
    expect(root().getAttribute("data-theme")).toBe("light");
  });

  it("remembers a scheme across a reload", () => {
    localStorage.setItem("ls-theme", "gray");
    renderBar();
    expect(root().getAttribute("data-theme")).toBe("gray");
  });

  it("applies and remembers a typeface", async () => {
    renderBar();
    openStyle();
    expect(root().getAttribute("data-font")).toBe("system");

    fireEvent.click(screen.getByRole("button", { name: /Serif/ }));
    expect(root().getAttribute("data-font")).toBe("serif");
    await waitFor(() => expect(localStorage.getItem("ls-font")).toBe("serif"));
  });

  it("changes the text size with the slider", async () => {
    renderBar();
    openStyle();
    const size = () => root().style.getPropertyValue("--reading-size");
    expect(size()).toBe("16px");

    // The slider runs along the ladder, so its value is a rung, not a pixel.
    fireEvent.change(screen.getByRole("slider", { name: "Text size" }), {
      target: { value: String(SIZES.indexOf(22)) },
    });
    expect(size()).toBe("22px");
    await waitFor(() => expect(localStorage.getItem("ls-font-size")).toBe("22"));
  });

  it("steps by one pixel below 18 and by two above it", () => {
    localStorage.setItem("ls-font-size", "16");
    renderBar();
    openStyle();
    const size = () => root().style.getPropertyValue("--reading-size");
    const bigger = () => fireEvent.click(screen.getByRole("button", { name: "Larger text" }));
    const smaller = () => fireEvent.click(screen.getByRole("button", { name: "Smaller text" }));

    bigger();
    expect(size()).toBe("17px");
    bigger();
    expect(size()).toBe("18px");
    bigger();
    expect(size()).toBe("20px");
    bigger();
    expect(size()).toBe("22px");
    smaller();
    expect(size()).toBe("20px");
    smaller();
    expect(size()).toBe("18px");
    smaller();
    expect(size()).toBe("17px");
  });

  it("stops at the ends of the size range", () => {
    localStorage.setItem("ls-font-size", "28");
    renderBar();
    openStyle();
    expect(screen.getByRole("button", { name: "Larger text" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Smaller text" }));
    expect(root().style.getPropertyValue("--reading-size")).toBe("26px");
  });

  it("snaps a stored size that is off the ladder", () => {
    localStorage.setItem("ls-font-size", "19");
    renderBar();
    expect(root().style.getPropertyValue("--reading-size")).toBe("20px");
  });

  it("ignores a stored size that is out of range", () => {
    localStorage.setItem("ls-font-size", "99");
    renderBar();
    expect(root().style.getPropertyValue("--reading-size")).toBe("28px");
  });
});
