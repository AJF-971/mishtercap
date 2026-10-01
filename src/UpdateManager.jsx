import React, { useEffect, useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

/* ---------------------------------------------------------------------------
   Version freshness.

   Why this exists: the shop-floor kiosks (dispatch TV, PPF Room tablet) stay
   logged in for days and never reload, so they kept running whatever bundle
   they first loaded. Nothing in the app ever registered the service worker's
   update flow or re-checked for a new deploy. This module:

   1. registers the service worker (registerType autoUpdate in vite.config.js
      installs + activates a new worker by itself; we only decide WHEN the
      page reloads),
   2. re-checks for a new version every 10 minutes and whenever the tab
      becomes visible / focused again,
   3. as belt and braces for devices whose service worker is broken or stuck,
      fetches /version.json (no-store, never precached) and compares its
      build id with the one baked into the running bundle,
   4. kiosk sessions reload silently once it is safe (offline queue empty,
      nobody touching the screen); everyone else gets a small gold banner
      and one tap reloads. Nothing ever auto-reloads a staff session, so a
      form in progress is never lost.
--------------------------------------------------------------------------- */

// Baked in by vite.config.js (`define`). "dev" under `vite dev` / tests that
// do not go through the build.
/* global __BUILD_ID__ */
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? String(__BUILD_ID__) : "dev";

const CHECK_EVERY_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000; // focus/visibility storms must not hammer the server
const KIOSK_POLL_MS = 10 * 1000;
const KIOSK_IDLE_MS = 20 * 1000; // nobody touched the screen for this long
const KIOSK_BUSY_IDLE_MS = 3 * 60 * 1000; // a car / form is open: wait for a longer pause
const KIOSK_QUEUE_PATIENCE_MS = 2 * 60 * 60 * 1000; // see canReloadNow()
const RELOAD_GUARD_KEY = "mrcap_update_reload_at";
const OFFLINE_QUEUE_KEY = "mrcap_offline_queue"; // same key GarageApp.jsx writes

/* ----- tiny external store (works outside React too) ----- */
let state = { ready: false, reason: null, kiosk: false, busy: false };
const listeners = new Set();
const setState = (patch) => {
  const next = { ...state, ...patch };
  if (next.ready === state.ready && next.reason === state.reason && next.kiosk === state.kiosk && next.busy === state.busy) return;
  state = next;
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
};
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getState = () => state;

// Kiosk = dispatch TV board (/dispatch) or the PPF Room tablet. The PPF Room
// screen lives inside the normal app, so it flags itself via setKioskMode().
const isDispatchPath = () => { try { return window.location.pathname === "/dispatch"; } catch { return false; } };
export function setKioskMode(on) { setState({ kiosk: !!on }); }
// Kiosk screens call this while something is open that shouldn't be yanked
// away (e.g. a PPF car screen with taps being recorded).
export function setKioskBusy(on) { setState({ busy: !!on }); }

/* ----- interaction tracking (for "is anyone using the screen right now") ----- */
let lastTouchAt = Date.now();
const noteTouch = () => { lastTouchAt = Date.now(); };

function readQueueLength() {
  try { return (JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]") || []).length; } catch { return 0; }
}

let queueNonEmptySince = 0;
function canReloadNow() {
  const now = Date.now();
  if (readQueueLength() > 0) {
    if (!queueNonEmptySince) queueNonEmptySince = now;
    // Wait for unsynced offline writes to drain. The queue itself lives in
    // localStorage and survives a reload, so if something is truly stuck
    // (e.g. a write the server keeps refusing) we stop holding the kiosk on
    // an old version forever after two hours.
    if (now - queueNonEmptySince < KIOSK_QUEUE_PATIENCE_MS) return false;
  } else {
    queueNonEmptySince = 0;
  }
  const idleFor = now - lastTouchAt;
  if (idleFor < KIOSK_IDLE_MS) return false;
  if (state.busy && idleFor < KIOSK_BUSY_IDLE_MS) return false;
  return true;
}

/* ----- applying an update ----- */
let versionMismatch = false; // true when /version.json (not the SW) told us

export async function applyUpdate() {
  try { window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())); } catch { /* ignore */ }
  if (versionMismatch) {
    // The service worker didn't deliver the new build (broken / stuck
    // worker). A plain reload would be answered from its stale precache, so
    // drop the worker and caches first; the reloaded page re-registers clean.
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    } catch { /* ignore */ }
    try {
      const keys = (await window.caches?.keys?.()) || [];
      await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => {})));
    } catch { /* ignore */ }
  }
  window.location.reload();
}

function markReady(reason) {
  if (reason === "version.json") versionMismatch = true;
  if (!state.ready) setState({ ready: true, reason });
}

// Refuse to auto-reload twice within two minutes: if a reload somehow did not
// bring the new build (CDN lag), show the banner / retry later instead of
// looping.
function recentlyReloaded() {
  try { return Date.now() - Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 0) < 2 * 60 * 1000; } catch { return false; }
}

/* ----- checking ----- */
let swReg = null;
let lastCheckAt = 0;

export async function checkForUpdate(force = false) {
  const now = Date.now();
  if (!force && now - lastCheckAt < MIN_GAP_MS) return;
  lastCheckAt = now;
  try { await swReg?.update(); } catch { /* offline / broken worker: the version.json check below still runs */ }
  if (BUILD_ID === "dev") return;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (j && typeof j.build === "string" && j.build && j.build !== BUILD_ID) markReady("version.json");
  } catch { /* offline or not JSON (SPA fallback) - ignore */ }
}

let started = false;
export function startUpdateWatcher() {
  if (started || typeof window === "undefined") return;
  started = true;

  ["pointerdown", "keydown", "touchstart", "wheel"].forEach((ev) => window.addEventListener(ev, noteTouch, { passive: true, capture: true }));

  try {
    registerSW({
      immediate: true,
      // autoUpdate mode: a new worker has installed AND activated. We choose
      // when the page follows (banner for staff, quiet reload for kiosks).
      onNeedReload: () => markReady("service-worker"),
      onRegisteredSW: (_url, reg) => { swReg = reg || null; },
      onRegisterError: () => { /* version.json check still covers us */ },
    });
  } catch { /* no service worker support (old WebView) */ }

  const onWake = () => { if (document.visibilityState === "visible") checkForUpdate(); };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  window.addEventListener("online", () => checkForUpdate());
  setInterval(() => checkForUpdate(true), CHECK_EVERY_MS);
  setTimeout(() => checkForUpdate(true), 3000);

  // Kiosk auto-reload loop. Normal staff sessions never reload by themselves.
  setInterval(() => {
    const kiosk = state.kiosk || isDispatchPath();
    if (!state.ready || !kiosk || recentlyReloaded()) return;
    if (canReloadNow()) applyUpdate();
  }, KIOSK_POLL_MS);

  // Test / support hook: lets a person (or the smoke suite) see the build and poke a check.
  try { window.__mrcapUpdater = { buildId: BUILD_ID, check: () => checkForUpdate(true), getState }; } catch { /* ignore */ }
}

/* ----- React bits ----- */
export function useUpdateState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

// Small gold pill, top centre, for normal staff sessions. Kiosks get nothing
// on screen: they reload on their own.
export function UpdateBanner() {
  const s = useUpdateState();
  const kiosk = s.kiosk || isDispatchPath();
  if (!s.ready || kiosk) return null;
  return (
    <div style={{ position: "fixed", top: "max(8px, calc(env(safe-area-inset-top) + 6px))", left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 100000, pointerEvents: "none" }}>
      <button
        type="button"
        data-testid="update-banner"
        onClick={() => applyUpdate()}
        style={{ pointerEvents: "auto", background: "#E8C34A", color: "#0A0A09", border: "1px solid #C9A227", borderRadius: 999, padding: "9px 18px", minHeight: 38, fontSize: 13.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 18px -6px rgba(0,0,0,0.7)", maxWidth: "92vw", fontFamily: "inherit" }}
      >
        New version — tap to update
      </button>
    </div>
  );
}

// Subtle build id, so a person can tell which version a device is running.
export function BuildStamp({ style }) {
  return (
    <div data-testid="build-stamp" style={{ fontSize: 10, letterSpacing: 0.4, color: "#8A8373", opacity: 0.75, ...style }}>
      Build {BUILD_ID}
    </div>
  );
}

// Keeps a kiosk's screen awake; re-acquires after the tab was hidden (the
// browser releases the lock whenever the page is hidden).
export function useScreenWakeLock() {
  useEffect(() => {
    let released = false;
    let lock = null;
    const request = async () => {
      try {
        if (released || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
        lock = await navigator.wakeLock.request("screen");
      } catch { /* tolerate rejection - not fatal */ }
    };
    request();
    const onVisible = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      try { lock && lock.release(); } catch { /* ignore */ }
    };
  }, []);
}

// Mounted by a kiosk screen: marks the session as a kiosk (auto-reload) and
// optionally "busy" (something open that shouldn't be yanked away).
export function useKioskMode(busy = false) {
  useEffect(() => { setKioskMode(true); return () => setKioskMode(false); }, []);
  useEffect(() => { setKioskBusy(!!busy); return () => setKioskBusy(false); }, [busy]);
}
