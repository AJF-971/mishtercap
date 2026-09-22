import React from "react";
import ReactDOM from "react-dom/client";
import GarageApp, { PublicLinkRouter, DispatchKiosk } from "./GarageApp.jsx";

// Checked before the main app mounts at all — a customer opening a
// ?quote= link should never see a login screen or pay the cost of
// loading team/services data meant for staff. ?track= is deliberately
// NOT included here — job tracking now requires a staff/Smartech login,
// handled inside GarageApp itself (see the isSmartechPortal /
// trackJobId check right after the session gate).
const params = new URLSearchParams(window.location.search);
const isPublicLink = params.has("quote");
// The shop-floor tablet bookmarks straight to /dispatch — its own
// login (tap your name, no PIN unless you're one of the four admins),
// completely separate from the main staff-PIN-gated app.
const isDispatchKiosk = window.location.pathname === "/dispatch";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPublicLink ? <PublicLinkRouter /> : isDispatchKiosk ? <DispatchKiosk /> : <GarageApp />}
  </React.StrictMode>
);
