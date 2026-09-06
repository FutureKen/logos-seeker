import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AppProvider from "../../src/state/AppProvider.jsx";
import ScrollTop from "../../src/components/ScrollTop.jsx";
import { installDomStubs, resetEnvironment } from "./helpers.js";

const button = () => document.querySelector(".scroll-top");

/** jsdom never scrolls on its own, so move the page and tell the listeners. */
function scrollTo(y) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event("scroll"));
  });
}

function renderButton() {
  return render(
    <AppProvider>
      <ScrollTop />
    </AppProvider>,
  );
}

beforeEach(() => {
  resetEnvironment();
  installDomStubs();
  window.scrollY = 0;
});

describe("back to top", () => {
  it("stays away while the page is at the top", () => {
    renderButton();
    expect(button()).toBeNull();
  });

  it("appears once the page has been scrolled, and leaves again", () => {
    renderButton();

    scrollTo(100); // still within the threshold
    expect(button()).toBeNull();

    scrollTo(400);
    expect(button()).toBeInTheDocument();
    expect(button()).toHaveAccessibleName("Back to top");

    scrollTo(0);
    expect(button()).toBeNull();
  });

  it("travels to the top over a fixed, short animation", () => {
    const frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockReturnValue(0);

    renderButton();
    scrollTo(900);
    fireEvent.click(button());
    expect(frames).toHaveLength(1);

    // Half way through the journey, half way up the page is still to come.
    frames[0](120);
    const mid = window.scrollTo.mock.calls.at(-1)[1];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(900);

    // Once the time is up it lands exactly on the top and asks for no more frames.
    const pending = frames.length;
    frames.at(-1)(240);
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(frames).toHaveLength(pending);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("jumps straight there when less motion is asked for", () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    renderButton();
    scrollTo(900);
    fireEvent.click(button());
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it("is labelled in the reading language", () => {
    localStorage.setItem("ls-lang", "cn");
    renderButton();
    scrollTo(400);
    expect(button()).toHaveAccessibleName("回到顶部");
  });
});
