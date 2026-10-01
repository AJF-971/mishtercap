/* ---------------------------------------------------------------
   Intake / edit-job drafts — so a reload, a phone-camera app switch
   that evicts the page, or an accidental Cancel never costs the front
   desk a half-filled job card.

   Storage:
   - IndexedDB holds the whole draft (text fields AND photos / signature /
     damage picture, which are big data URLs and do not belong in
     localStorage).
   - localStorage holds only the small text part, as a fallback when
     IndexedDB is unavailable (private window, blocked site data) and so
     the page can write synchronously while it is being hidden.
   Every storage call is wrapped in try/catch: a draft that cannot be
   saved must never break the form.
--------------------------------------------------------------- */
import { useEffect, useRef } from "react";

const DB_NAME = "mrcap_drafts";
const STORE = "drafts";
const LS_PREFIX = "mrcap_draft:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week-old half-filled card is stale

function openDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch {} };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

function idbRun(mode, fn) {
  return openDb().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const out = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { try { db.close(); } catch {} resolve(out && "result" in out ? out.result : undefined); };
        tx.onerror = () => { try { db.close(); } catch {} resolve(undefined); };
        tx.onabort = () => { try { db.close(); } catch {} resolve(undefined); };
      } catch { try { db.close(); } catch {} resolve(undefined); }
    });
  });
}

function lsGet(key) {
  try { const raw = window.localStorage.getItem(LS_PREFIX + key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function lsSet(key, val) {
  try { window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
}
function lsDel(key) {
  try { window.localStorage.removeItem(LS_PREFIX + key); } catch {}
}

// draft = { text: {...small fields}, media: {...photos, signature...}, label: "DXB A 51234 · Ahmed" }
export async function saveIntakeDraft(key, draft) {
  const savedAt = Date.now();
  // Small text copy first and synchronously: it survives even if the page
  // is killed before the IndexedDB transaction finishes.
  lsSet(key, { text: draft.text, label: draft.label || "", savedAt, hasMedia: !!draft.media && Object.keys(draft.media).length > 0 });
  await idbRun("readwrite", (store) => store.put({ text: draft.text, media: draft.media || {}, label: draft.label || "", savedAt }, key));
}

export async function loadIntakeDraft(key) {
  let rec;
  try { rec = await idbRun("readonly", (store) => store.get(key)); } catch { rec = undefined; }
  const ls = lsGet(key);
  let out = null;
  if (rec && rec.text) out = { text: rec.text, media: rec.media || {}, label: rec.label || "", savedAt: rec.savedAt || 0, mediaLost: false };
  else if (ls && ls.text) out = { text: ls.text, media: {}, label: ls.label || "", savedAt: ls.savedAt || 0, mediaLost: !!ls.hasMedia };
  if (!out) return null;
  if (!out.savedAt || Date.now() - out.savedAt > MAX_AGE_MS) { clearIntakeDraft(key); return null; }
  return out;
}

export async function clearIntakeDraft(key) {
  lsDel(key);
  await idbRun("readwrite", (store) => store.delete(key));
}

// "12 min ago" style age for the banner.
export function describeDraft(d) {
  if (!d) return "";
  const mins = Math.max(0, Math.round((Date.now() - (d.savedAt || Date.now())) / 60000));
  const age = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return `${d.label ? d.label + " · " : ""}saved ${age}`;
}

// Debounced autosave. `build()` returns { text, media, label }, null when
// the form is still empty (nothing worth keeping), or { clear: true } when it
// is back to exactly what is already saved (drops any older draft). It re-runs whenever
// `deps` change, 700 ms after the last change, and again straight away when
// the page is hidden or closed (switching to the camera app on a phone).
export function useDraftAutosave(key, enabled, build, deps) {
  const buildRef = useRef(build);
  buildRef.current = build;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const dirtyRef = useRef(false);

  const flush = () => {
    if (!enabledRef.current) return;
    let d;
    try { d = buildRef.current(); } catch { return; }
    if (!d) return;
    dirtyRef.current = false;
    if (d.clear) { clearIntakeDraft(key); return; } // form is back to the saved job: nothing to keep
    saveIntakeDraft(key, d);
  };

  useEffect(() => {
    if (!enabled) return undefined;
    dirtyRef.current = true;
    const t = setTimeout(flush, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [enabled, key, ...deps]);

  useEffect(() => {
    const onHide = () => { if (dirtyRef.current) flush(); };
    const onVis = () => { if (document.visibilityState === "hidden") onHide(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pagehide", onHide); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line
  }, [key]);
}
