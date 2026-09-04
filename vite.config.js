import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The study cache is versioned by the manifest that the data pipeline writes,
 * so a data rebuild busts the runtime cache while an app deploy does not.
 * Read at config time; falls back to "dev" before any study data exists.
 */
function studyVersion() {
  try {
    const url = new URL("./public/data/study/index.json", import.meta.url);
    return JSON.parse(readFileSync(fileURLToPath(url), "utf8")).version || "dev";
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "generateSW",
      workbox: {
        // verses.json is ~7.5 MB; precache it (revision-hashed, so it is only
        // re-downloaded when the file itself changes).
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,webmanifest,json}"],
        globIgnores: ["**/data/study/**"],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/data/study/"),
            handler: "CacheFirst",
            options: {
              cacheName: `study-${studyVersion()}`,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Logos Seeker",
        short_name: "Logos",
        description: "Recovery Version Bible search (English & 中文) — works offline.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#0f1115",
        theme_color: "#0f1115",
        icons: [
          { src: "./apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          {
            src: "./favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.js"],
    globals: true,
  },
});
