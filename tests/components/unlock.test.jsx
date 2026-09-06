import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AppProvider from "../../src/state/AppProvider.jsx";
import App from "../../src/App.jsx";
import TopBar from "../../src/components/TopBar.jsx";
import Footer from "../../src/components/Footer.jsx";
import {
  deriveKey,
  exportKey,
  makeVerify,
  randomSalt,
} from "../../src/study/studyCrypto.js";
import { installDomStubs, installFetch, resetEnvironment } from "./helpers.js";

// Throwaway credentials — never the real study password.
const PASSWORD = "fixture-password";
const ITER = 1000; // production uses 200_000; keep the suite fast
const INDEX_URL = "/data/study/index.json";

let index;
let key;

beforeAll(async () => {
  const salt = randomSalt();
  key = await deriveKey(PASSWORD, salt, ITER);
  index = {
    schema: 1,
    version: "test",
    kdf: { salt, iter: ITER },
    verify: await makeVerify(key),
    books: {},
    totalBytes: 0,
  };
});

beforeEach(() => {
  resetEnvironment();
  installDomStubs();
});

function renderGate(indexBody = index) {
  installFetch(new Map([[INDEX_URL, indexBody]]));
  return render(
    <AppProvider>
      <TopBar />
      <Footer />
    </AppProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /Unlock/ }));
}

/** Type the password and submit the form, the way Enter does in a browser. */
function submitPassword(password) {
  const input = screen.getByLabelText("Password");
  fireEvent.change(input, { target: { value: password } });
  fireEvent.submit(input.closest("form"));
}

describe("the study gate", () => {
  it("shows Unlock while locked and opens the password dialog", () => {
    renderGate();
    openDialog();
    expect(screen.getByRole("heading", { name: "Unlock study notes" })).toBeVisible();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("toggles password visibility", () => {
    renderGate();
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });

  it("rejects a wrong password inline and stores nothing", async () => {
    renderGate();
    openDialog();
    submitPassword("not-the-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password");
    expect(localStorage.getItem("ls-study-key")).toBeNull();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
  });

  it("unlocks with the right password, persists the key and turns Notes on", async () => {
    renderGate();
    openDialog();
    submitPassword(PASSWORD);

    const notes = await screen.findByRole("button", { name: "Notes" });
    expect(notes).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("ls-study-key")).toMatch(/^[A-Za-z0-9+/]+=*$/);
    await waitFor(() => expect(localStorage.getItem("ls-study")).toBe("1"));

    // The Notes toggle only flips state here; D wires it to the rendering.
    fireEvent.click(notes);
    expect(notes).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(localStorage.getItem("ls-study")).toBe("0"));
  });

  it("reports missing study data rather than a wrong password", async () => {
    renderGate(404);
    openDialog();
    submitPassword(PASSWORD);
    expect(await screen.findByRole("alert")).toHaveTextContent("Study data not available");
  });

  it("restores an unlocked device from the stored key on startup", async () => {
    localStorage.setItem("ls-study-key", await exportKey(key));
    installFetch(new Map([[INDEX_URL, index]]));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Notes" })).toBeInTheDocument();
  });

  it("drops a stored key that the current manifest rejects", async () => {
    const stale = await deriveKey("an-older-password", index.kdf.salt, ITER);
    localStorage.setItem("ls-study-key", await exportKey(stale));
    installFetch(new Map([[INDEX_URL, index]]));
    render(<App />);
    await waitFor(() => expect(localStorage.getItem("ls-study-key")).toBeNull());
    expect(screen.getByRole("button", { name: /Unlock/ })).toBeInTheDocument();
  });
});
