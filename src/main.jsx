import React from "react";
import ReactDOM from "react-dom/client";
import GarageApp, { PublicLinkRouter } from "./GarageApp.jsx";

// Checked before the main app mounts at all — a customer opening a
// ?track= or ?quote= link should never see a login screen or pay the
// cost of loading team/services data meant for staff.
const params = new URLSearchParams(window.location.search);
const isPublicLink = params.has("track") || params.has("quote");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPublicLink ? <PublicLinkRouter /> : <GarageApp />}
  </React.StrictMode>
);
