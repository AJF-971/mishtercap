import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Closes the one real gap the localStorage-based offline queue can't:
    // a COLD launch with zero signal (phone rebooted overnight, opened in
    // airplane mode before wifi's up). Without this, server.url mode in
    // Capacitor has nothing to show at all with no network — it has to
    // fetch the page fresh every time. This precaches the built app shell
    // (JS/CSS/HTML/icons) via a service worker, so the app itself always
    // opens instantly even offline; the existing sbFetch cache + write
    // queue then take over for the actual job/team data once the shell's
    // up. autoUpdate means every new Netlify deploy replaces the cached
    // shell in the background the next time there IS a connection — no
    // stale-version lock-in, matching the fast push-to-deploy habit here.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false, // real manifest.json in /public is already correct — don't generate a second one
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,webp}"],
        navigateFallback: "/index.html",
        // Never let the shell's service worker intercept live data calls —
        // those are Supabase/gatekeeper fetch()es, already handled by the
        // app's own cache-and-queue logic in GarageApp.jsx. The service
        // worker's job stops at "can the app itself open."
        navigateFallbackDenylist: [/^\/functions\//, /supabase\.co/],
        runtimeCaching: [],
      },
    }),
  ],
});
