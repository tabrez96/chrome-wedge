/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Extension pages forbid inline scripts; the polyfill is not needed in Chrome.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: "popup.html",
        welcome: "welcome.html",
        settings: "settings.html",
        background: "src/background/index.ts",
      },
      output: {
        // The manifest points at a fixed service worker file name.
        entryFileNames: (chunk) =>
          chunk.name === "background"
            ? "background.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
