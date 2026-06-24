import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base wird im GitHub-Workflow automatisch auf /<repo-name>/ gesetzt (--base).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png", "favicon.ico"],
      manifest: {
        name: "Kalender – Familie & Business",
        short_name: "Kalender",
        description: "Gemeinsamer Familien- und Business-Kalender mit Terminen und Aufgaben",
        theme_color: "#16233F",
        background_color: "#EEF2F8",
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
