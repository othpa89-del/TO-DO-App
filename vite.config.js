import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// App-Version hebt sich automatisch je Deploy: Hauptversion aus package.json,
// Nebenversion = Anzahl der Commits seit dem 1.0-Startpunkt (Commit f314df8).
// So steigt die Anzeige (1.0 → 1.1 → 1.2 …) ohne manuelles Nachziehen.
// Fallback (z. B. flacher Klon ohne Historie): Nebenversion aus package.json.
const BASELINE = "f314df8"; // "Reset version to 1.0 as the starting point"
const major = (pkg.version.split(".")[0]) || "1";
let minor = pkg.version.split(".")[1] || "0";
try {
  const n = execSync(`git rev-list --count ${BASELINE}..HEAD`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  if (/^\d+$/.test(n)) minor = n;
} catch {}
const appVersion = `${major}.${minor}`;

// base wird im GitHub-Workflow automatisch auf /<repo-name>/ gesetzt (--base).
export default defineConfig({
  // Version + Build-Datum für die Fußzeile der App (automatisch je Deploy)
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["apple-touch-icon.png", "favicon.ico"],
      manifest: {
        name: "TO DO APP",
        short_name: "TO DO APP",
        description: "Aufgaben – Training, Standardisierung, Qualität, Safety",
        theme_color: "#AF1E65",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,ico,svg,woff2}"],
        navigateFallback: null
      }
    })
  ]
});
