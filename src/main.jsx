import React from "react";
import ReactDOM from "react-dom/client";
import GarageApp, { PublicLinkRouter, DispatchKiosk } from "./GarageApp.jsx";

// Checked before the main app mounts at all — a customer opening a
// ?track= or ?quote= link should never see a login screen or pay the
// cost of loading team/services data meant for staff.
const params = new URLSearchParams(window.location.search);
const isPublicLink = params.has("track") || params.has("quote");
// The shop-floor tablet bookmarks straight to /dispatch — its own
// login (tap your name, no PIN unless you're one of the four admins),
// completely separate from the main staff-PIN-gated app.
const isDispatchKiosk = window.location.pathname === "/dispatch";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPublicLink ? <PublicLinkRouter /> : isDispatchKiosk ? <DispatchKiosk /> : <GarageApp />}
  </React.StrictMode>
);
