import { defineConfig } from "vitest/config";

// Eigene Vitest-Konfiguration (statt vite.config.js), damit die Tests ohne
// PWA-Plugin und Build-Defines laufen. jsdom stellt DOM/localStorage bereit,
// die die Export-Helfer (sanitizeHtml, htmlToPlain) und i18n benötigen.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.js"],
  },
});
