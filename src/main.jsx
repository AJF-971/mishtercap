import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { startUpdateWatcher, UpdateBanner } from "./UpdateManager.jsx";

// Each surface is its own chunk and is fetched only when it is used: a
// customer opening a job card or quotation link downloads the small public
// page module, never the ~1.3 MB staff app (GarageApp.jsx). The staff app
// and the dispatch TV share one chunk.
const PublicLinkRouter = lazy(() => import("./publicPages.jsx"));
const GarageApp = lazy(() => import("./GarageApp.jsx"));
const DispatchKiosk = lazy(() => import("./GarageApp.jsx").then((m) => ({ default: m.DispatchKiosk })));

// Checked before the main app mounts at all — a customer opening a
// ?quote= link should never see a login screen or pay the cost of
// loading team/services data meant for staff. ?track= is deliberately
// NOT included here — job tracking now requires a staff/Smartech login,
// handled inside GarageApp itself (see the isSmartechPortal /
// trackJobId check right after the session gate).
const params = new URLSearchParams(window.location.search);
// ?approve= is the customer's job-card link (sent on WhatsApp
// right after intake) — same no-login treatment as ?quote=.
const isPublicLink = params.has("quote") || params.has("approve");
// The shop-floor tablet bookmarks straight to /dispatch — its own
// login (tap your name, no PIN unless you're one of the four admins),
// completely separate from the main staff-PIN-gated app.
const isDispatchKiosk = window.location.pathname === "/dispatch";

// Right tab title from the first paint, before the page module arrives.
if (isPublicLink) document.title = params.has("approve") ? "Mr.CAP — Your job card" : "Mr.CAP — Your quotation";

// Service worker + "is there a newer version?" checks (see UpdateManager.jsx).
// Skipped on customer links: a customer mid-read is never reloaded or shown staff UI.
if (!isPublicLink) startUpdateWatcher();

// Dark, empty frame while a chunk downloads (no white flash).
const fallback = <div style={{ minHeight: "100vh", background: "#0A0A09" }} />;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={fallback}>
      {isPublicLink ? <PublicLinkRouter /> : isDispatchKiosk ? <DispatchKiosk /> : <GarageApp />}
    </Suspense>
    {!isPublicLink && <UpdateBanner />}
  </React.StrictMode>
);
