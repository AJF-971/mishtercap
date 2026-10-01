/* ---------------------------------------------------------------
   Mr.CAP — design tokens (black + gold, IBM Plex Sans).

   One small module so the staff app, the customer pages and the
   reports can share the same colours, radii, type sizes and spacing.
   It has no React and no app logic, so the customer page can import it
   without pulling the staff bundle. GarageApp.jsx re-uses COLORS and the
   font stacks from here; new code should reach for RADIUS / FONT_SIZE /
   SPACE / TAP instead of another one-off number.
--------------------------------------------------------------- */

export const COLORS = {
  ink: "#E9E4D4",        // primary text (on dark backgrounds) — bone white
  darkText: "#0D0C08",   // fixed dark text, used on gold/light surfaces
  paper: "#0A0A09",      // page background — void black
  panel: "#141311",      // card surface
  panel2: "#1C1A16",     // elevated surface (inputs, keypad, unselected toggles)
  gold: "#C9A227",       // primary accent — worn brass, not bright
  goldDeep: "#9C7D1A",   // pressed/deep gold
  goldBright: "#E8C34A", // highlight flashes only — success moments, glints
  line: "#2C2A24",       // hairline borders
  muted: "#8C8573",      // secondary text — dossier grey
  red: "#A8402F",        // desaturated crimson
  green: "#4A7A57",      // desaturated forest
  blue: "#4A6478",       // desaturated steel
  // Readable text tints of the three status colours above — the base
  // colours are fills/borders; these are for words sitting on dark.
  // (dangerText is about 7:1 on the black page, successText about 8:1.)
  successText: "#7FB08C",
  dangerText: "#E58A76",
  blueText: "#8FB4CC",
  plate: "#F2EEE3",      // UAE number-plate face
  plateEdge: "#D8D2C0",
};

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');`;
export const DISPLAY_FONT = "'Playfair Display', serif";
export const MONO_FONT = "'IBM Plex Mono', ui-monospace, monospace";
export const BODY_FONT = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Corner radii: sm = small chips/inputs inside a card, md = buttons and
// inputs, lg = cards, pill = chips and FABs.
export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 };

// Type scale. Nothing the staff or a customer has to READ goes below
// `meta` (12); body copy is `body` (13) or larger; customer-facing pages
// use `customerBody` (15) or larger.
export const FONT_SIZE = { meta: 12, body: 13, base: 15, customerBody: 15, title: 17, h1: 20, display: 26 };

// Spacing steps (px).
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

// Smallest comfortable touch target (px) — Apple/Google guidance is 44.
export const TAP = 44;

// "rgba" from a #RRGGBB colour, so tints are not retyped by hand.
export function tint(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// How a customer reaches the shop from the job card / quote pages.
// `whatsapp` is an international number without "+" (wa.me format). It is
// the shop's main line — if the shop's WhatsApp runs on a different
// number, change it here and every customer page follows.
export const SHOP_CONTACT = {
  name: "Mr.CAP.",
  phoneDisplay: "04 288 6550",
  phoneTel: "+97142886550",
  whatsapp: "97142886550",
  area: "Nad Al Hamar, Dubai",
};
