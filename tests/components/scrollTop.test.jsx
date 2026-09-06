import { describe, it, expect, beforeEach } from "vitest";
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

  it("scrolls the page back to the top when pressed", () => {
    renderButton();
    scrollTo(400);
    fireEvent.click(button());
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    );
  });

  it("is labelled in the reading language", () => {
    localStorage.setItem("ls-lang", "cn");
    renderButton();
    scrollTo(400);
    expect(button()).toHaveAccessibleName("回到顶部");
  });
});
