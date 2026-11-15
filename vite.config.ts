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
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/**/*.test.ts"],
      thresholds: {
        perFile: true,
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
