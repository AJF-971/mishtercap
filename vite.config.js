import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// One id per build, baked into the bundle (__BUILD_ID__) AND written to
// /version.json, so a running app can tell whether it is the latest deploy
// even when its service worker is broken. Netlify's commit sha is appended
// when available.
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const BUILD_ID =
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}` +
  (process.env.COMMIT_REF ? `-${String(process.env.COMMIT_REF).slice(0, 7)}` : "");

const versionJsonPlugin = {
  name: "mrcap-version-json",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
};

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    versionJsonPlugin,
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
      // Registered in src/UpdateManager.jsx (virtual:pwa-register) so the
      // app controls WHEN a new version reloads the page.
      injectRegister: false,
      manifest: false, // real manifest.json in /public is already correct — don't generate a second one
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,webp}"],
        // The document-preview PDF renderer (pdf.js, loaded lazily only when a
        // Preview opens) is ~0.4 MB of JS plus a ~1.4 MB worker — keep both
        // out of the offline shell so every phone doesn't re-download them on
        // each deploy. Offline, Preview shows its error state and offers the
        // plain PDF download instead.
        // version.json must always come from the network (it is the
        // "is there a newer deploy" probe), never from the precache.
        // The Excel export (exceljs, ~0.9 MB) is lazy-loaded the moment someone taps
        // Excel in Reports; it stays out of the offline shell for the same reason.
        globIgnores: ["**/pdf.min-*.js", "**/pdf.worker*", "**/exceljs*", "**/version.json"],
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
