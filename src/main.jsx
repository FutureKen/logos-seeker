import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Ask for storage that survives eviction pressure, so an installed home-screen
// app keeps the verse data. Ignored where unsupported.
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
