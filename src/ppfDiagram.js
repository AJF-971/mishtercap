// PPF Room diagram engine — ported faithfully from the approved vanilla-JS
// mockup (ppf-room.html) so the shape of every car, panel and cut-line on
// the tablet/scope-editor/office screens matches exactly what the owner
// signed off. Pure functions only (no DOM, no React) — GarageApp.jsx wraps
// the returned SVG markup strings in dangerouslySetInnerHTML and handles
// taps by event delegation on [data-zone], same pattern as the mockup.
//
// "car" objects passed in here are a small normalized shape, not the full
// job record:
//   { bodyShape: 'suv'|'sedan'|'coupe'|'pickup', tintBooked: bool, spare: bool,
//     scope: { z: { [zoneKey]: 'full'|'partial' } } }
// Progress (done/skipped panels) is passed separately as a `progress`
// option to buildSheet so this module never needs to know about
// ppfProgress's shape.

/* ============================================================
   STATIC DATA — panel names, per-shape panel lists, presets
============================================================ */
export const SHAPE_LABEL = { suv: "SUV", sedan: "Sedan", coupe: "Coupe", pickup: "Pickup" };

export const ZNAME = {
  front_bumper: "Front Bumper", bonnet: "Bonnet", headlights: "Headlights", roof: "Roof", tailgate: "Tailgate", boot: "Boot",
  rear_bumper: "Rear Bumper", rear_lip: "Rear Bumper Top", taillights: "Tail-lights",
  l_fender: "Left Front Fender", r_fender: "Right Front Fender", l_mirror: "Left Mirror", r_mirror: "Right Mirror",
  l_apillar: "Left A-Pillar", r_apillar: "Right A-Pillar",
  l_door_f: "Left Front Door", r_door_f: "Right Front Door", l_door_r: "Left Rear Door", r_door_r: "Right Rear Door",
  l_rocker: "Left Rocker / Sill", r_rocker: "Right Rocker / Sill",
  l_quarter: "Left Rear Quarter", r_quarter: "Right Rear Quarter", l_bedside: "Left Bed Side", r_bedside: "Right Bed Side",
  spare_cover: "Spare Wheel Cover",
  windscreen: "Windscreen", side_f: "Front Side Windows", side_r: "Rear Side Windows", rear_glass: "Rear Glass",
  foilwork: "FoilWork (whole job)", door_cups: "Door Cups & Edges",
};
export function zoneName(k, shape) {
  if (shape === "coupe") {
    if (k === "l_door_f") return "Left Door";
    if (k === "r_door_f") return "Right Door";
    if (k === "side_r") return "Rear Quarter Windows";
  }
  if (shape === "suv") {
    if (k === "l_rocker") return "Left Side Step";
    if (k === "r_rocker") return "Right Side Step";
  }
  return ZNAME[k] || k;
}
export const SHAPE_ZONES = {
  suv: ["front_bumper", "bonnet", "headlights", "l_fender", "r_fender", "l_mirror", "r_mirror", "roof", "l_apillar", "r_apillar", "l_door_f", "r_door_f", "l_door_r", "r_door_r", "l_rocker", "r_rocker", "l_quarter", "r_quarter", "tailgate", "rear_bumper", "rear_lip", "taillights"],
  sedan: ["front_bumper", "bonnet", "headlights", "l_fender", "r_fender", "l_mirror", "r_mirror", "roof", "l_apillar", "r_apillar", "l_door_f", "r_door_f", "l_door_r", "r_door_r", "l_rocker", "r_rocker", "l_quarter", "r_quarter", "boot", "rear_bumper", "rear_lip", "taillights"],
  coupe: ["front_bumper", "bonnet", "headlights", "l_fender", "r_fender", "l_mirror", "r_mirror", "roof", "l_apillar", "r_apillar", "l_door_f", "r_door_f", "l_rocker", "r_rocker", "l_quarter", "r_quarter", "boot", "rear_bumper", "rear_lip", "taillights"],
  pickup: ["front_bumper", "bonnet", "headlights", "l_fender", "r_fender", "l_mirror", "r_mirror", "roof", "l_apillar", "r_apillar", "l_door_f", "r_door_f", "l_door_r", "r_door_r", "l_rocker", "r_rocker", "l_bedside", "r_bedside", "tailgate", "rear_bumper", "rear_lip", "taillights"],
};
export const TINT_KEYS = ["windscreen", "side_f", "side_r", "rear_glass"];
export const PARTIAL_OK = { bonnet: 1, l_fender: 1, r_fender: 1 };
export function groupOf(k) {
  if (/^(front_bumper|bonnet|headlights|l_fender|r_fender|l_mirror|r_mirror)$/.test(k)) return "Front";
  if (/^(roof|l_apillar|r_apillar)$/.test(k)) return "Upper";
  if (/^(tailgate|boot|rear_bumper|rear_lip|taillights|spare_cover)$/.test(k)) return "Rear";
  return "Sides";
}
export const PRESETS = {
  partial_front: { label: "Partial front", z: { front_bumper: "full", bonnet: "partial", l_fender: "partial", r_fender: "partial", l_mirror: "full", r_mirror: "full" } },
  full_front: { label: "Full front", z: { front_bumper: "full", bonnet: "full", l_fender: "full", r_fender: "full", l_mirror: "full", r_mirror: "full", headlights: "full" } },
  track: {
    label: "Track pack", z: {
      front_bumper: "full", bonnet: "full", l_fender: "full", r_fender: "full", l_mirror: "full", r_mirror: "full", headlights: "full",
      l_apillar: "full", r_apillar: "full", roof: "full", l_rocker: "full", r_rocker: "full",
    },
  },
  full_body: { label: "Full body", z: null },
  custom: { label: "Custom", z: {} },
};
export const PRESET_ORDER = ["partial_front", "full_front", "track", "full_body", "custom"];

/* ============================================================
   BODY GEOMETRY — one scale for every view (~110 units per metre)
============================================================ */
export const SPEC = {
  suv: {
    type: "suv", L: 588, W: 224, wr: 50, ar: 60, xf: 112, xr: 452, bb: 36, rockLo: 44, sill: 66, bt: 98, belt: 142, nose: 132, cowl: 140, roof: 218, fall: 4, gTop: 198,
    xn: 14, xbf: 50, xCowl: 200, xA: 252, xD1: 208, xB: 340, xD3: 436, xCb: 514, xC: 540, xbr: 540, xLt: 546, tlLo: 112, tlHi: 132, lampLo: 114,
    tumb: 16, rearDoors: true, fenderLab: [118, 125, 13], quarterLab: [482, 126, 14], doorRLab: [367], grille: 50, tw: 57, bd: 20,
  },
  sedan: {
    type: "sedan", L: 584, W: 208, wr: 40, ar: 50, xf: 112, xr: 452, bb: 26, rockLo: 30, sill: 46, bt: 70, belt: 108, nose: 94, cowl: 106, roof: 160,
    xn: 18, xbf: 50, xCowl: 214, xA: 290, xD1: 222, xB: 350, xD3: 440, xCb: 462, xC: 420, xDeck: 488, deck: 114, xbr: 536, xLt: 536, tlTop: 98,
    tumb: 26, rearDoors: true, fenderLab: [190, 70, 16], quarterLab: [500, 92, 14], doorRLab: [392], lampW: 50, grille: 30, tw: 40, tlR: 108, bd: 24,
  },
  coupe: {
    type: "coupe", L: 504, W: 210, wr: 38, ar: 47, xf: 92, xr: 362, bb: 22, rockLo: 25, sill: 40, bt: 60, belt: 96, nose: 80, cowl: 100, roof: 142,
    xn: 12, xbf: 44, xCowl: 182, xA: 250, xD1: 190, xB: 330, xD3: 330, xCb: 392, xC: 340, xDeck: 470, deck: 104, xbr: 460, xLt: 460, tlTop: 82,
    tumb: 30, rearDoors: false, fenderLab: [163, 58, 15], quarterLab: [430, 70, 15], lampW: 0, grille: 0, tw: 40, tlR: 82, bd: 24,
  },
  pickup: {
    type: "pickup", L: 600, W: 226, wr: 48, ar: 60, xf: 112, xr: 482, bb: 40, rockLo: 48, sill: 66, bt: 98, belt: 150, nose: 132, cowl: 146, roof: 218,
    xn: 16, xbf: 48, xCowl: 190, xA: 248, xD1: 198, xB: 318, xD3: 410, xC: 408, xCab: 414, xBed: 424, bedTop: 146, xbr: 560, xLt: 584, tlTop: 146,
    tumb: 18, rearDoors: true, fenderLab: [112, 128, 18], bedLab: [482, 126, 20], doorRLab: [364], lampW: 50, grille: 51, tw: 16, tlR: 143.5, bd: 24,
  },
};
const G = 2.5; // half the gap between neighbouring panels

function r1(n) { return Math.round(n * 10) / 10; }
function P(x, h) { return r1(x) + "," + r1(-h); } // side / front / back views: height goes up
function T(u, v) { return r1(u) + "," + r1(v); } // top view: nose at top

function hwArch(S, base) { const dy = base - S.wr; return Math.abs(dy) < S.ar ? Math.sqrt(S.ar * S.ar - dy * dy) : 0; }
function lowH(S, x, base) {
  let h = base;
  [S.xf, S.xr].forEach((cx) => {
    const dx = x - cx, hw = hwArch(S, base);
    if (hw && Math.abs(dx) < hw - 0.01) { const u = S.wr + Math.sqrt(S.ar * S.ar - dx * dx); if (u > h) h = u; }
  });
  return h;
}
function bottomRun(S, x1, x0, base) {
  let out = "", cur = x1;
  const hw = hwArch(S, base);
  if (hw) {
    [S.xr, S.xf].forEach((cx) => {
      const a0 = cx - hw, a1 = cx + hw;
      if (a1 <= x0 || a0 >= cur) return;
      const s = Math.min(cur, a1), e = Math.max(x0, a0);
      const hs = (s >= a1 - 0.01) ? base : S.wr + Math.sqrt(S.ar * S.ar - (s - cx) * (s - cx));
      const he = (e <= a0 + 0.01) ? base : S.wr + Math.sqrt(S.ar * S.ar - (e - cx) * (e - cx));
      if (cur > s + 0.01) out += " L" + P(s, base);
      const ts = Math.atan2(hs - S.wr, s - cx), te = Math.atan2(he - S.wr, e - cx);
      let d = te - ts;
      while (d < 0) d += 2 * Math.PI;
      out += " A" + S.ar + "," + S.ar + " 0 " + (d > Math.PI ? 1 : 0) + " 0 " + P(e, he);
      cur = e;
    });
  }
  if (cur > x0 + 0.01) out += " L" + P(x0, base);
  return out;
}
function wheelSVG(cx, r) {
  let s = '<g class="wheel" transform="translate(' + cx + ',' + (-r) + ')"><circle class="t" r="' + (r - 1.5) + '"></circle><circle class="rim" r="' + r1(r * 0.62) + '"></circle>';
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI * 2 / 6 - Math.PI / 2;
    s += '<line class="sp" x1="' + r1(Math.cos(a) * 6) + '" y1="' + r1(Math.sin(a) * 6) + '" x2="' + r1(Math.cos(a) * r * 0.57) + '" y2="' + r1(Math.sin(a) * r * 0.57) + '"></line>';
  }
  return s + '<circle class="hub" r="5"></circle></g>';
}
function rectClipX(xmax) { return "M-900,-900 L" + r1(xmax) + ",-900 L" + r1(xmax) + ",900 L-900,900 Z"; }
function rectClipY(ymax) { return "M-900,-900 L900,-900 L900," + r1(ymax) + " L-900," + r1(ymax) + " Z"; }
function rectClipYmin(ymin) { return "M-900," + r1(ymin) + " L900," + r1(ymin) + " L900,900 L-900,900 Z"; }

/* ---------- SIDE PROFILE (nose on the left in both side views) ---------- */
function sideView(S, side, o) {
  const g = G, L = S.L, it = [], dec = [];
  const k = (n) => side + "_" + n;
  const fall = S.fall || 0, gTopF = S.gTop || S.roof - 17;
  function fallAt(x) { return fall ? fall * Math.max(0, Math.min(1, (x - S.xA) / (S.xC - S.xA))) : 0; }
  function tailX(h) { const h2 = S.bt + 26, h1 = S.roof - 14; return h <= h2 ? L - 1 : (L - 1) + (h - h2) * ((S.xC + 18) - (L - 1)) / (h1 - h2); }

  let u = "M" + P(L - 10, S.bb) + bottomRun(S, L - 10, 10, S.bb) + " Q" + P(0, S.bb) + " " + P(0, S.bb + 12) + " L" + P(0, S.nose - 16) + " Q" + P(1, S.nose) + " " + P(S.xn + 10, S.nose) +
    " Q" + P((S.xn + S.xCowl) / 2, S.nose + (S.cowl - S.nose) * 0.85) + " " + P(S.xCowl, S.cowl) + " L" + P(S.xA - 10, S.roof - 5) + " Q" + P(S.xA, S.roof) + " " + P(S.xA + 16, S.roof);
  if (S.type === "suv") u += " L" + P(S.xC - 10, S.roof - fall) + " Q" + P(S.xC + 10, S.roof - fall) + " " + P(S.xC + 18, S.roof - 14) + " L" + P(L - 1, S.bt + 26) + " Q" + P(L, S.bt + 22) + " " + P(L, S.bt + 12);
  else if (S.type === "sedan") u += " L" + P(S.xC, S.roof) + " C" + P(S.xC + 30, S.roof - 2) + " " + P(S.xDeck - 30, S.deck + 14) + " " + P(S.xDeck, S.deck) + " L" + P(L - 12, S.deck) + " Q" + P(L - 2, S.deck) + " " + P(L - 2, S.deck - 14);
  else if (S.type === "coupe") u += " L" + P(S.xC, S.roof) + " C" + P(S.xC + 60, S.roof - 4) + " " + P(S.xDeck - 40, S.deck + 14) + " " + P(S.xDeck, S.deck) + " L" + P(L - 8, S.deck - 2) + " Q" + P(L, S.deck - 4) + " " + P(L, S.deck - 16);
  else u += " L" + P(S.xC - 8, S.roof) + " Q" + P(S.xCab, S.roof) + " " + P(S.xCab, S.roof - 10) + " L" + P(S.xCab, S.bedTop) + " L" + P(L - 4, S.bedTop) + " Q" + P(L, S.bedTop) + " " + P(L, S.bedTop - 6);
  u += " L" + P(L, S.bb + 10) + " Q" + P(L, S.bb) + " " + P(L - 10, S.bb) + " Z";

  function silX(h) { return S.xCowl + (h - S.cowl) / ((S.roof - 5) - S.cowl) * ((S.xA - 10) - S.xCowl); }
  function glX(h) { return (S.xCowl + 22) + (h - (S.belt + 5)) / (gTopF - (S.belt + 5)) * ((S.xA + 4) - (S.xCowl + 22)); }
  const ph0 = Math.max(S.belt, S.cowl) + 5, ph1 = S.roof - 15;
  it.push({ z: k("apillar"), d: "M" + P(silX(ph0) + 3, ph0) + " L" + P(silX(ph1) + 3, ph1) + " L" + P(glX(ph1) - 3, ph1) + " L" + P(glX(ph0) - 3, ph0) + " Z", c: [(silX(ph0) + silX(ph1) + glX(ph0) + glX(ph1)) / 4, -(ph0 + ph1) / 2], cs: 9 });

  it.push({ z: "side_f", glass: 1, d: "M" + P(S.xCowl + 22, S.belt + 5) + " L" + P(S.xA + 4, gTopF) + " L" + P(S.xB - 4, gTopF) + " L" + P(S.xB - 4, S.belt + 5) + " Z", c: [(S.xA + S.xB) / 2, -(S.belt + gTopF) / 2], cs: 24 });
  let gr, grc;
  if (S.type === "suv") { gr = "M" + P(S.xB + 4, S.belt + 5) + " L" + P(S.xB + 4, gTopF) + " L" + P(S.xCb - 12, gTopF) + " L" + P(S.xCb - 2, S.belt + 5) + " Z"; grc = [(S.xB + S.xCb) / 2 - 4, -(S.belt + gTopF) / 2]; }
  else if (S.type === "sedan") { gr = "M" + P(S.xB + 4, S.belt + 5) + " L" + P(S.xB + 4, S.roof - 17) + " L" + P(S.xC - 16, S.roof - 17) + " Q" + P(S.xC - 4, S.roof - 18) + " " + P(S.xC + 2, S.roof - 28) + " L" + P(S.xCb - 6, S.belt + 5) + " Z"; grc = [(S.xB + S.xC) / 2, -(S.belt + S.roof - 12) / 2]; }
  else if (S.type === "coupe") { gr = "M" + P(S.xB + 4, S.belt + 5) + " L" + P(S.xB + 4, S.roof - 22) + " Q" + P(S.xB + 30, S.roof - 22) + " " + P(S.xCb, S.belt + 5) + " Z"; grc = [S.xB + 20, -(S.belt + 11)]; }
  else { gr = "M" + P(S.xB + 4, S.belt + 5) + " L" + P(S.xB + 4, S.roof - 17) + " L" + P(S.xC - 8, S.roof - 17) + " Q" + P(S.xC - 2, S.roof - 17) + " " + P(S.xC - 2, S.roof - 24) + " L" + P(S.xC - 2, S.belt + 5) + " Z"; grc = [(S.xB + S.xC) / 2, -(S.belt + S.roof - 12) / 2]; }
  it.push({ z: "side_r", glass: 1, d: gr, c: grc, cs: (S.type === "coupe" ? 14 : 24) });
  if (S.type === "suv") dec.push('<path class="frame" d="M' + P(S.xD3, S.belt + 3) + ' L' + P(S.xD3, gTopF + 2) + '"></path>');
  if (S.type === "sedan") {
    const t = (S.xD3 - (S.xC + 2)) / ((S.xCb - 6) - (S.xC + 2)), th = (S.roof - 28) + t * ((S.belt + 5) - (S.roof - 28));
    dec.push('<path class="frame" d="M' + P(S.xD3, S.belt + 3) + ' L' + P(S.xD3, th + 2) + '"></path>');
  }

  it.push({ z: "front_bumper", d: "M" + P(S.xbf - g, S.bt - g) + " L" + P(10, S.bt - g) + " Q" + P(1, S.bt - g) + " " + P(1, S.bt - 12) + " L" + P(1, S.bb + 12) + " Q" + P(1, S.bb + 1) + " " + P(12, S.bb + 1) + " L" + P(S.xbf - g, S.bb + 1) + " Z", c: [S.xbf / 2, -(S.bb + S.bt) / 2], cs: 18 });
  const lb = S.lampLo || (S.bt + g);
  it.push({ z: "headlights", d: "M" + P(4, lb) + " L" + P(S.xbf - g, lb) + " L" + P(S.xbf - g, S.nose - 6) + " L" + P(S.xn + 6, S.nose - g - 1) + " Q" + P(2, S.nose - g - 2) + " " + P(2, S.nose - 12) + " L" + P(2, lb + 4) + " Z", c: [S.xbf / 2 + 2, -(lb + S.nose) / 2], cs: 12 });

  const fx0 = S.xbf + g, fx1 = S.xD1 - g, ftop = Math.min(S.cowl, S.belt) - g, cutX = fx0 + 0.4 * (fx1 - fx0), cmx = (fx0 + cutX) / 2;
  it.push({
    z: k("fender"), d: "M" + P(fx0, S.nose - 4) + " Q" + P((fx0 + fx1) / 2, S.nose + (ftop - S.nose) * 0.8) + " " + P(fx1, ftop) + " L" + P(fx1, lowH(S, fx1, S.bb)) + bottomRun(S, fx1, fx0, S.bb) + " Z",
    c: [S.fenderLab[0], -S.fenderLab[1]], cs: S.fenderLab[2] + 6, lab: "Fender", fs: S.fenderLab[2],
    cut: { clip: rectClipX(cutX - 1.5), line: "M" + P(cutX, lowH(S, cutX, S.bb) + 1) + " L" + P(cutX, S.nose + (ftop - S.nose) * 0.5 - 1), c: [cmx, -((lowH(S, cmx, S.bb) + S.nose) / 2 + 2)] },
  });

  function door(x0, x1, key, lx) {
    const d = "M" + P(x0, S.belt - g) + " Q" + P((x0 + x1) / 2, S.belt - g + 1.5) + " " + P(x1, S.belt - g) + " L" + P(x1, lowH(S, x1, S.sill)) + bottomRun(S, x1, x0 + 8, S.sill) + " Q" + P(x0, S.sill) + " " + P(x0, S.sill + 8) + " Z";
    it.push({ z: k(key), d, c: [lx, -(S.sill + (S.belt - S.sill) * 0.42)], cs: 30, lab: "Door", fs: 20 });
    dec.push('<path class="decf" d="M' + P(x1 - 44, S.belt - 15) + ' L' + P(x1 - 22, S.belt - 15) + ' Q' + P(x1 - 18, S.belt - 18.5) + ' ' + P(x1 - 22, S.belt - 22) + ' L' + P(x1 - 44, S.belt - 22) + ' Q' + P(x1 - 48, S.belt - 18.5) + ' ' + P(x1 - 44, S.belt - 15) + ' Z"></path>');
  }
  door(S.xD1 + g, S.xB - g, "door_f", (S.xD1 + S.xB) / 2);
  if (S.rearDoors) door(S.xB + g, S.xD3 - g, "door_r", S.doorRLab[0]);

  const rx0 = Math.max(S.xD1, S.xf + S.ar) + g, rx1 = Math.min(S.xD3, S.xr - S.ar) - g, rh0 = S.rockLo, rh1 = S.sill - g;
  it.push({ z: k("rocker"), d: "M" + P(rx0 + 8, rh0) + " L" + P(rx1 - 8, rh0) + " Q" + P(rx1, rh0) + " " + P(rx1, rh0 + 6) + " L" + P(rx1, rh1) + " L" + P(rx0, rh1) + " L" + P(rx0, rh0 + 6) + " Q" + P(rx0, rh0) + " " + P(rx0 + 8, rh0) + " Z", c: [(rx0 + rx1) / 2, -(rh0 + rh1) / 2], cs: 14, lab: (S.type === "suv" ? "Step" : "Sill"), fs: r1(Math.min(13, (rh1 - rh0) * 0.8)) });

  if (S.type === "pickup") {
    const b0 = S.xBed + g;
    it.push({ z: k("bedside"), d: "M" + P(b0, S.bedTop - g) + " L" + P(S.xLt - g, S.bedTop - g) + " L" + P(S.xLt - g, S.bt + g) + " L" + P(S.xbr - g, S.bt + g) + " L" + P(S.xbr - g, S.bb + 1) + bottomRun(S, S.xbr - g, b0, S.bb) + " Z", c: [S.bedLab[0], -S.bedLab[1]], cs: 26, lab: "Bed", fs: S.bedLab[2] });
  } else if (S.type === "suv") {
    const q0 = S.xD3 + g;
    const q = "M" + P(q0, S.belt - g) + " L" + P(S.xCb + 3, S.belt - g) + " L" + P(S.xCb - 7, gTopF) + " L" + P(S.xC - 6, gTopF) + " Q" + P(S.xC + 10, gTopF) + " " + P(tailX(gTopF - 12) - 4, gTopF - 12) +
      " L" + P(tailX(S.tlHi + g) - 4, S.tlHi + g) + " L" + P(S.xLt - g, S.tlHi + g) + " L" + P(S.xLt - g, S.tlLo - g) + " L" + P(tailX(S.tlLo - g) - 4, S.tlLo - g) + " L" + P(L - 4, S.bt + g) +
      " L" + P(S.xbr - g, S.bt + g) + " L" + P(S.xbr - g, S.bb + 1) + bottomRun(S, S.xbr - g, q0, S.bb) + " Z";
    it.push({ z: k("quarter"), d: q, c: [S.quarterLab[0], -S.quarterLab[1]], cs: 22, lab: "Quarter", fs: S.quarterLab[2] });
    it.push({ z: "taillights", d: "M" + P(S.xLt + g + 6, S.tlLo) + " L" + P(tailX(S.tlLo) - 2, S.tlLo) + " L" + P(tailX(S.tlHi) - 2, S.tlHi) + " L" + P(S.xLt + g + 6, S.tlHi) + " Q" + P(S.xLt + g, S.tlHi) + " " + P(S.xLt + g, S.tlHi - 6) + " L" + P(S.xLt + g, S.tlLo + 6) + " Q" + P(S.xLt + g, S.tlLo) + " " + P(S.xLt + g + 6, S.tlLo) + " Z", c: [(S.xLt + L) / 2, -(S.tlLo + S.tlHi) / 2], cs: 12 });
  } else {
    const q1 = S.xD3 + g;
    let qq;
    if (S.type === "sedan") qq = "M" + P(q1, S.belt - g) + " L" + P(S.xCb + 1, S.belt - g) + " L" + P(S.xC + 8, S.roof - 30) + " Q" + P(S.xC + 4, S.roof - 16) + " " + P(S.xC + 14, S.roof - 15) + " C" + P(S.xC + 40, S.roof - 16) + " " + P(S.xDeck - 30, S.deck + 6) + " " + P(S.xDeck, S.deck - 3) + " L" + P(L - 10, S.deck - 3) + " Q" + P(L - 3, S.deck - 3) + " " + P(L - 3, S.deck - 8);
    else qq = "M" + P(q1, S.belt - g) + " L" + P(S.xCb + 6, S.belt - g) + " Q" + P(S.xB + 40, S.roof - 14) + " " + P(S.xC + 4, S.roof - 14) + " C" + P(S.xC + 56, S.roof - 18) + " " + P(S.xDeck - 40, S.deck + 4) + " " + P(S.xDeck, S.deck - 4) + " L" + P(L - 10, S.deck - 4) + " Q" + P(L - 3, S.deck - 4) + " " + P(L - 3, S.deck - 9);
    qq += " L" + P(L - 3, S.tlTop + g) + " L" + P(S.xbr - g, S.tlTop + g) + " L" + P(S.xbr - g, S.bb + 1) + bottomRun(S, S.xbr - g, q1, S.bb) + " Z";
    it.push({ z: k("quarter"), d: qq, c: [S.quarterLab[0], -S.quarterLab[1]], cs: 22, lab: "Quarter", fs: S.quarterLab[2] });
  }
  if (S.type !== "suv") it.push({ z: "taillights", d: "M" + P(S.xLt + g, S.tlTop - g) + " L" + P(L - 6, S.tlTop - g) + " Q" + P(L - 2, S.tlTop - g) + " " + P(L - 2, S.tlTop - 8) + " L" + P(L - 2, S.bt + g) + " L" + P(S.xLt + g, S.bt + g) + " Z", c: [(S.xLt + L) / 2, -(S.bt + S.tlTop) / 2], cs: 12 });

  it.push({ z: "rear_bumper", d: "M" + P(S.xbr + g, S.bt - g) + " L" + P(L - 10, S.bt - g) + " Q" + P(L - 1, S.bt - g) + " " + P(L - 1, S.bt - 12) + " L" + P(L - 1, S.bb + 12) + " Q" + P(L - 1, S.bb + 1) + " " + P(L - 12, S.bb + 1) + " L" + P(S.xbr + g, S.bb + 1) + " Z", c: [(S.xbr + L) / 2, -(S.bb + S.bt) / 2], cs: 18 });

  const sx0 = S.xA + 12, sx1 = (S.type === "pickup") ? S.xC - 6 : S.xC - 8;
  it.push({ z: "roof", d: "M" + P(sx0, S.roof - 13 - fallAt(sx0)) + " L" + P(sx1, S.roof - 13 - fallAt(sx1)) + " Q" + P(sx1 + 4, S.roof - 8 - fallAt(sx1)) + " " + P(sx1, S.roof - 2 - fallAt(sx1)) + " L" + P(sx0, S.roof - 2 - fallAt(sx0)) + " Q" + P(sx0 - 4, S.roof - 8) + " " + P(sx0, S.roof - 13 - fallAt(sx0)) + " Z", c: [(sx0 + sx1) / 2, -(S.roof - 7.5 - fall / 2)], cs: 10 });

  const mx = S.xD1;
  it.push({ z: k("mirror"), d: "M" + P(mx - 2, S.belt + 3) + " Q" + P(mx - 12, S.belt + 6) + " " + P(mx - 10, S.belt + 18) + " Q" + P(mx - 6, S.belt + 28) + " " + P(mx + 14, S.belt + 27) + " Q" + P(mx + 26, S.belt + 25) + " " + P(mx + 24, S.belt + 12) + " L" + P(mx + 20, S.belt + 3) + " Z", c: [mx + 7, -(S.belt + 15)], cs: 13 });

  if (o.spare) it.push({ z: "spare_cover", d: "M" + P(L + 1, S.bt + 14) + " L" + P(L + 16, S.bt + 14) + " Q" + P(L + 26, S.bt + 14) + " " + P(L + 26, S.bt + 28) + " L" + P(L + 26, S.bt + 76) + " Q" + P(L + 26, S.bt + 90) + " " + P(L + 16, S.bt + 90) + " L" + P(L - 2, S.bt + 90) + " Z", c: [L + 13.5, -(S.bt + 52)], cs: 14 });

  if (S.type === "suv" || S.type === "pickup") {
    [S.xf, S.xr].forEach((cx) => {
      const tp = S.wr + S.ar + 4;
      dec.push('<path class="flare" d="M' + P(cx - S.ar - 5, S.bb + 3) + ' L' + P(cx - S.ar - 5, S.wr + S.ar * 0.45) + ' Q' + P(cx - S.ar - 3, tp) + ' ' + P(cx - S.ar * 0.35, tp) + ' L' + P(cx + S.ar * 0.35, tp) + ' Q' + P(cx + S.ar + 3, tp) + ' ' + P(cx + S.ar + 5, S.wr + S.ar * 0.45) + ' L' + P(cx + S.ar + 5, S.bb + 3) + '"></path>');
    });
  }
  if (S.type === "suv") {
    const ra = S.xA + 34, rb = S.xC - 20;
    dec.push('<path class="rail" d="M' + P(ra, S.roof - fallAt(ra) - 1) + ' L' + P(ra + 6, S.roof - fallAt(ra) + 6) + ' L' + P(rb - 6, S.roof - fallAt(rb) + 6) + ' L' + P(rb, S.roof - fallAt(rb) - 1) + '"></path>');
  }
  if (S.type === "coupe") dec.push('<path class="decf" d="M' + P(L - 40, S.deck - 2) + ' L' + P(L - 36, S.deck + 30) + ' M' + P(L - 78, S.deck + 30) + ' L' + P(L - 6, S.deck + 32) + ' Q' + P(L - 2, S.deck + 36) + ' ' + P(L - 8, S.deck + 40) + ' L' + P(L - 80, S.deck + 37) + ' Q' + P(L - 84, S.deck + 33) + ' ' + P(L - 78, S.deck + 30) + ' Z"></path>');

  const pre = '<line class="gnd" x1="-14" y1="0" x2="' + (L + 40) + '" y2="0"></line>';
  const mid = wheelSVG(S.xf, S.wr) + wheelSVG(S.xr, S.wr);
  return { pre, under: u, mid, items: it, post: dec.join("") };
}

/* ---------- TOP VIEW (vertical, nose at top) ---------- */
function topView(S, o) {
  const g = G, hw = S.W / 2, sw = 24, vb = 40, L = S.L, bd = S.bd, vr = L - bd - 16, it = [], dec = [];
  let pre = "", mid = "";
  const bw = hw - sw - g, rw = hw - sw - 8, ws0 = hw - sw - 14, ws1 = hw - sw - 18;
  [S.xf, S.xr].forEach((v) => { [-1, 1].forEach((s) => {
    pre += '<rect class="tyre" x="' + (s > 0 ? hw - 14 : -hw - 8) + '" y="' + r1(v - S.wr * 0.85) + '" width="22" height="' + r1(S.wr * 1.7) + '" rx="6"></rect>';
  }); });
  const u = "M" + T(-hw + 28, 3) + " Q" + T(0, -2) + " " + T(hw - 28, 3) + " Q" + T(hw - 1, 6) + " " + T(hw, 40) + " L" + T(hw, L - 30) + " Q" + T(hw - 1, L - 4) + " " + T(hw - 28, L - 2) + " Q" + T(0, L + 2) + " " + T(-hw + 28, L - 2) + " Q" + T(-hw + 1, L - 4) + " " + T(-hw, L - 30) + " L" + T(-hw, 40) + " Q" + T(-hw + 1, 6) + " " + T(-hw + 28, 3) + " Z";

  it.push({ z: "front_bumper", d: "M" + T(-hw + 3, vb - g) + " L" + T(-hw + 3, 32) + " Q" + T(-hw + 4, 8) + " " + T(-hw + 30, 6) + " Q" + T(0, 1) + " " + T(hw - 30, 6) + " Q" + T(hw - 4, 8) + " " + T(hw - 3, 32) + " L" + T(hw - 3, vb - g) + " Z", c: [0, 22], cs: 20, lab: "Bumper", fs: 15 });
  it.push({ z: "rear_bumper", d: "M" + T(-hw + 3, L - bd) + " L" + T(hw - 3, L - bd) + " L" + T(hw - 3, L - 14) + " Q" + T(hw - 4, L - 5) + " " + T(hw - 28, L - 4) + " Q" + T(0, L) + " " + T(-hw + 28, L - 4) + " Q" + T(-hw + 4, L - 5) + " " + T(-hw + 3, L - 14) + " Z", c: [0, L - bd / 2 - 1], cs: 16, lab: "Bumper", fs: 13 });
  it.push({ z: "rear_lip", d: "M" + T(-(hw - 6), L - bd - 12.5) + " L" + T(hw - 6, L - bd - 12.5) + " L" + T(hw - 5, L - bd - 4.5) + " L" + T(-(hw - 5), L - bd - 4.5) + " Z", c: [0, L - bd - 8.5], cs: 9 });
  dec.push('<path class="decf" d="M' + T(-(hw - 64), vb + g) + ' L' + T(hw - 64, vb + g) + ' L' + T(hw - 64, vb + 19) + ' Q' + T(0, vb + 21) + ' ' + T(-(hw - 64), vb + 19) + ' Z"></path>');

  const bv0 = vb + 27, bv1 = S.xCowl - g, bcv = bv0 + 0.4 * (bv1 - bv0);
  it.push({
    z: "bonnet", d: "M" + T(-bw, bv0) + " Q" + T(0, vb + 23) + " " + T(bw, bv0) + " L" + T(bw, bv1) + " Q" + T(0, S.xCowl + 4) + " " + T(-bw, bv1) + " Z",
    c: [0, (bv0 + S.xCowl) / 2], cs: 34, lab: "Bonnet", fs: 22,
    cut: { clip: rectClipY(bcv - 1.5), line: "M" + T(-bw, bcv) + " L" + T(bw, bcv), c: [0, (bv0 + bcv) / 2] },
  });
  it.push({ z: "windscreen", glass: 1, d: "M" + T(-ws0, S.xCowl + g) + " Q" + T(0, S.xCowl + 10.5) + " " + T(ws0, S.xCowl + g) + " L" + T(ws1, S.xA - g) + " Q" + T(0, S.xA + 2) + " " + T(-ws1, S.xA - g) + " Z", c: [0, (S.xCowl + S.xA) / 2 + 4], cs: 22 });
  const vRE = S.type === "suv" ? vr - 48 : (S.type === "pickup" ? S.xC - 14 : S.xC);
  it.push({ z: "roof", d: "M" + T(-rw, S.xA + g) + " Q" + T(0, S.xA + 7.5) + " " + T(rw, S.xA + g) + " L" + T(rw, vRE - 12) + " Q" + T(rw, vRE - g) + " " + T(rw - 10, vRE - g) + " L" + T(-rw + 10, vRE - g) + " Q" + T(-rw, vRE - g) + " " + T(-rw, vRE - 12) + " Z", c: [0, (S.xA + vRE) / 2], cs: 40, lab: "Roof", fs: 26 });
  if (S.type === "suv") [-1, 1].forEach((s) => { dec.push('<line class="rail" x1="' + r1(s * (rw - 7)) + '" y1="' + r1(S.xA + 34) + '" x2="' + r1(s * (rw - 7)) + '" y2="' + r1(vRE - 16) + '"></line>'); });

  function gateTop(v0) { return "M" + T(-bw, v0) + " Q" + T(0, v0 - 2) + " " + T(bw, v0) + " L" + T(bw, vr - 2) + " Q" + T(0, vr + 1) + " " + T(-bw, vr - 2) + " Z"; }
  if (S.type === "suv") {
    it.push({ z: "rear_glass", glass: 1, d: "M" + T(-rw + 4, vRE + g + 2) + " L" + T(rw - 4, vRE + g + 2) + " L" + T(rw - 6, vr - 30) + " Q" + T(0, vr - 28) + " " + T(-rw + 6, vr - 30) + " Z", c: [0, (vRE + vr - 28) / 2], cs: 14 });
    it.push({ z: "tailgate", d: gateTop(vr - 24), c: [0, vr - 13], cs: 18, lab: "Tailgate", fs: 14 });
    if (o.spare) it.push({ z: "spare_cover", d: "M" + T(-44, L + 3) + " L" + T(44, L + 3) + " L" + T(44, L + 12) + " Q" + T(44, L + 22) + " " + T(34, L + 22) + " L" + T(-34, L + 22) + " Q" + T(-44, L + 22) + " " + T(-44, L + 12) + " Z", c: [0, L + 12], cs: 14 });
  } else if (S.type === "sedan") {
    it.push({ z: "rear_glass", glass: 1, d: "M" + T(-rw, S.xC + 5) + " Q" + T(0, S.xC + 1) + " " + T(rw, S.xC + 5) + " L" + T(bw - 2, S.xDeck - g) + " Q" + T(0, S.xDeck + 2) + " " + T(-bw + 2, S.xDeck - g) + " Z", c: [0, (S.xC + S.xDeck) / 2], cs: 24 });
    it.push({ z: "boot", d: gateTop(S.xDeck + g + 3), c: [0, (S.xDeck + vr) / 2 + 1], cs: 24, lab: "Boot", fs: 20 });
  } else if (S.type === "coupe") {
    it.push({ z: "rear_glass", glass: 1, d: "M" + T(-rw, S.xC + 5) + " L" + T(rw, S.xC + 5) + " L" + T(rw - 8, S.xC + 44) + " Q" + T(0, S.xC + 48) + " " + T(-rw + 8, S.xC + 44) + " Z", c: [0, S.xC + 25], cs: 20 });
    it.push({ z: "boot", d: gateTop(S.xC + 52), c: [0, (S.xC + 52 + vr) / 2], cs: 26, lab: "Boot", fs: 20 });
  } else {
    it.push({ z: "rear_glass", glass: 1, d: "M" + T(-rw + 6, S.xC - 9) + " L" + T(rw - 6, S.xC - 9) + " L" + T(rw - 6, S.xC + 3) + " L" + T(-rw + 6, S.xC + 3) + " Z", c: [0, S.xC - 3], cs: 10 });
    mid += '<path class="decf" d="M' + T(-bw, S.xBed + g) + ' L' + T(bw, S.xBed + g) + ' L' + T(bw, vr - 30) + ' L' + T(-bw, vr - 30) + ' Z"></path>';
    for (let i = 1; i < 6; i++) { const ux = -bw + i * (2 * bw / 6); mid += '<line class="dec" x1="' + r1(ux) + '" y1="' + r1(S.xBed + 8) + '" x2="' + r1(ux) + '" y2="' + r1(vr - 36) + '"></line>'; }
    it.push({ z: "tailgate", d: gateTop(vr - 24), c: [0, vr - 13], cs: 18, lab: "Tailgate", fs: 14 });
  }

  [-1, 1].forEach((s) => {
    const sd = s < 0 ? "l_" : "r_";
    it.push({ z: "headlights", d: "M" + T(s * (hw - 3), vb + g) + " L" + T(s * (hw - 56), vb + g) + " Q" + T(s * (hw - 60), vb + g) + " " + T(s * (hw - 58), vb + 10) + " L" + T(s * (hw - 52), vb + 20) + " Q" + T(s * (hw - 50), vb + 23) + " " + T(s * (hw - 44), vb + 23) + " L" + T(s * (hw - 8), vb + 23) + " Q" + T(s * (hw - 3), vb + 23) + " " + T(s * (hw - 3), vb + 18) + " Z", c: [s * (hw - 30), vb + 13], cs: 12 });
    it.push({ z: "taillights", d: "M" + T(s * (hw - sw + g), vr - 22) + " L" + T(s * (hw - 3), vr - 22) + " L" + T(s * (hw - 3), vr - 6) + " Q" + T(s * (hw - 3), vr - 2) + " " + T(s * (hw - 8), vr - 2) + " L" + T(s * (hw - sw + g), vr - 2) + " Z", c: [s * (hw - 12), vr - 12], cs: 10 });
    it.push({ z: sd + "apillar", d: "M" + T(s * (ws0 + 5), S.xCowl + g) + " L" + T(s * (hw - sw - g), S.xCowl + g) + " L" + T(s * (hw - sw - g), S.xA - g) + " L" + T(s * (ws1 + 5), S.xA - g) + " Z", c: [s * (hw - sw - 8), (S.xCowl + S.xA) / 2], cs: 9 });
    function strip(key, v0, v1, cut) {
      const itm = { z: sd + key, d: "M" + T(s * (hw - sw + g), v0) + " L" + T(s * (hw - sw + g), v1) + " L" + T(s * (hw - 3), v1) + " Q" + T(s * (hw + 1), (v0 + v1) / 2) + " " + T(s * (hw - 3), v0) + " Z", c: [s * (hw - 12), (v0 + v1) / 2], cs: 12 };
      if (cut) { const cv = v0 + 0.4 * (v1 - v0); itm.cut = { clip: rectClipY(cv - 1.5), line: "M" + T(s * (hw - sw + g), cv) + " L" + T(s * (hw - 3), cv), c: [s * (hw - 12), (v0 + cv) / 2] }; }
      it.push(itm);
    }
    strip("fender", vb + 27, S.xD1 - g, true);
    strip("door_f", S.xD1 + g, S.xB - g);
    if (S.rearDoors) strip("door_r", S.xB + g, S.xD3 - g);
    if (S.type === "pickup") strip("bedside", S.xBed + g, vr - 26); else strip("quarter", S.xD3 + g, vr - 26);
    const v0 = S.xD1 + 4;
    it.push({ z: sd + "mirror", d: "M" + T(s * (hw - 1), v0) + " Q" + T(s * (hw + 20), v0 - 2) + " " + T(s * (hw + 24), v0 + 10) + " Q" + T(s * (hw + 24), v0 + 22) + " " + T(s * (hw + 12), v0 + 22) + " L" + T(s * (hw - 1), v0 + 18) + " Z", c: [s * (hw + 12), v0 + 10], cs: 11 });
  });
  return { pre, under: u, mid, items: it, post: dec.join("") };
}

/* ---------- FRONT & BACK VIEWS ---------- */
function tyresFR(S) {
  const hw = S.W / 2;
  let s = "";
  [-1, 1].forEach((k) => { s += '<rect class="tyre" x="' + (k > 0 ? hw - 42 : -hw + 6) + '" y="' + (-(S.bb + 18)) + '" width="36" height="' + (S.bb + 18) + '" rx="7"></rect>'; });
  return s;
}
function bodyFR(S) {
  const hw = S.W / 2, tb = S.tumb;
  return "M" + P(-hw + 10, S.bb) + " L" + P(hw - 10, S.bb) + " Q" + P(hw, S.bb) + " " + P(hw, S.bb + 12) + " L" + P(hw, S.belt - 8) + " Q" + P(hw, S.belt) + " " + P(hw - 10, S.belt) +
    " L" + P(hw - tb, S.roof - 12) + " Q" + P(hw - tb - 2, S.roof) + " " + P(hw - tb - 14, S.roof) + " L" + P(-(hw - tb - 14), S.roof) + " Q" + P(-(hw - tb - 2), S.roof) + " " + P(-(hw - tb), S.roof - 12) +
    " L" + P(-(hw - 10), S.belt) + " Q" + P(-hw, S.belt) + " " + P(-hw, S.belt - 8) + " L" + P(-hw, S.bb + 12) + " Q" + P(-hw, S.bb) + " " + P(-hw + 10, S.bb) + " Z";
}
function bumperFR(S, top) {
  const hw = S.W / 2;
  return "M" + P(-hw + 3, top) + " L" + P(hw - 3, top) + " L" + P(hw - 3, S.bb + 12) + " Q" + P(hw - 3, S.bb + 1) + " " + P(hw - 14, S.bb + 1) + " L" + P(-hw + 14, S.bb + 1) + " Q" + P(-hw + 3, S.bb + 1) + " " + P(-hw + 3, S.bb + 12) + " Z";
}
function roofFR(S) {
  const hw = S.W / 2, tb = S.tumb;
  return "M" + P(-(hw - tb - 10), S.roof - 12) + " Q" + P(0, S.roof - 9) + " " + P(hw - tb - 10, S.roof - 12) + " L" + P(hw - tb - 16, S.roof - 1) + " L" + P(-(hw - tb - 16), S.roof - 1) + " Z";
}
function mirrorFR(S, s) {
  const hw = S.W / 2, mb = S.belt;
  return "M" + P(s * (hw - 6), mb + 2) + " L" + P(s * (hw + 18), mb + 4) + " Q" + P(s * (hw + 28), mb + 5) + " " + P(s * (hw + 27), mb + 15) + " L" + P(s * (hw + 24), mb + 24) + " Q" + P(s * (hw + 20), mb + 28) + " " + P(s * (hw + 10), mb + 26) + " L" + P(s * (hw - 6), mb + 18) + " Z";
}
function trapFR(b, t, h0, h1) { return "M" + P(-b, h0) + " Q" + P(0, h0 - 2) + " " + P(b, h0) + " L" + P(t, h1) + " Q" + P(0, h1 + 2) + " " + P(-t, h1) + " Z"; }
function roundBox(x0, x1, h0, h1, r) { return "M" + P(x0 + r, h0) + " L" + P(x1 - r, h0) + " Q" + P(x1, h0) + " " + P(x1, h0 + r) + " L" + P(x1, h1 - r) + " Q" + P(x1, h1) + " " + P(x1 - r, h1) + " L" + P(x0 + r, h1) + " Q" + P(x0, h1) + " " + P(x0, h1 - r) + " L" + P(x0, h0 + r) + " Q" + P(x0, h0) + " " + P(x0 + r, h0) + " Z"; }

function frontView(S, o) {
  const g = G, hw = S.W / 2, tb = S.tumb, it = [], dec = [];
  it.push({ z: "front_bumper", d: bumperFR(S, S.bt - g), c: [0, -(S.bb + (S.bt - S.bb) * 0.6)], cs: 26, lab: "Bumper", fs: 18 });
  if (S.type === "suv") {
    const gw = S.grille, g0 = S.bt - 14, g1 = S.nose - 4;
    let gs = '<path class="decf" d="' + roundBox(-gw, gw, g0, g1, 8) + '"></path>';
    for (let j = 1; j < 5; j++) { const hy = g0 + (g1 - g0) * j / 5; gs += '<line class="dec" x1="' + r1(-gw + 6) + '" y1="' + r1(-hy) + '" x2="' + r1(gw - 6) + '" y2="' + r1(-hy) + '"></line>'; }
    gs += '<path class="chrome-line" d="M' + P(-gw - 3, g1) + ' L' + P(0, g0 + 3) + ' L' + P(gw + 3, g1) + '"></path>';
    gs += '<path class="chrome-line thin" d="' + roundBox(-gw, gw, g0, g1, 8) + '"></path>';
    gs += '<path class="skid" d="M' + P(-56, S.bb + 2) + ' L' + P(56, S.bb + 2) + ' L' + P(46, S.bb + 17) + ' L' + P(-46, S.bb + 17) + ' Z"></path>';
    dec.push(gs);
  } else {
    dec.push('<path class="dec" d="M' + P(-(hw - 50), S.bb + 5) + ' L' + P(hw - 50, S.bb + 5) + ' Q' + P(hw - 45, S.bb + 9) + ' ' + P(hw - 50, S.bb + 13) + ' L' + P(-(hw - 50), S.bb + 13) + ' Q' + P(-(hw - 45), S.bb + 9) + ' ' + P(-(hw - 50), S.bb + 5) + ' Z"></path>');
    if (S.grille) {
      const gw2 = S.grille, h0 = S.bt + g + 2, h1 = S.nose - 6;
      let gs2 = '<path class="decf" d="' + roundBox(-gw2, gw2, h0, h1, 6) + '"></path>';
      for (let i = 1; i < 4; i++) { const hy2 = h0 + (h1 - h0) * i / 4; gs2 += '<line class="dec" x1="' + r1(-gw2 + 5) + '" y1="' + r1(-hy2) + '" x2="' + r1(gw2 - 5) + '" y2="' + r1(-hy2) + '"></line>'; }
      dec.push(gs2);
    }
  }
  [-1, 1].forEach((s) => {
    if (S.type === "suv") {
      const gw = S.grille, a = S.nose - 4, b = S.nose - 15;
      it.push({ z: "headlights", d: "M" + P(s * (gw + 5), a - 2) + " L" + P(s * (hw - 8), a) + " Q" + P(s * (hw - 2), a) + " " + P(s * (hw - 3), a - 6) + " L" + P(s * (hw - 6), a - 24) + " Q" + P(s * (hw - 8), a - 29) + " " + P(s * (hw - 12), a - 25) + " L" + P(s * (hw - 14), b) + " L" + P(s * (gw + 9), b) + " Q" + P(s * (gw + 5), b) + " " + P(s * (gw + 5), b + 4) + " Z", c: [s * (gw + hw) / 2, -(a + b) / 2], cs: 12 });
    } else if (S.type === "coupe") {
      const c = s * (hw - 34), hc = S.nose + 6;
      it.push({ z: "headlights", d: "M" + P(c - 22, hc) + " A22,10 0 1,0 " + P(c + 22, hc) + " A22,10 0 1,0 " + P(c - 22, hc) + " Z", c: [c, -hc], cs: 12 });
    } else {
      const ua = s * (hw - 6), ub = s * (hw - 6 - S.lampW), a0 = S.bt + g + 1, a1 = S.nose - 4;
      it.push({ z: "headlights", d: "M" + P(ua, a0 + 3) + " Q" + P(ua, a0) + " " + P(ua - s * 6, a0) + " L" + P(ub + s * 6, a0 + 2) + " Q" + P(ub, a0 + 2) + " " + P(ub, a0 + 8) + " L" + P(ub, a1 - 4) + " Q" + P(ub, a1) + " " + P(ub + s * 6, a1) + " L" + P(ua - s * 6, a1) + " Q" + P(ua, a1) + " " + P(ua, a1 - 4) + " Z", c: [(ua + ub) / 2, -(a0 + a1) / 2], cs: 14 });
    }
    it.push({ z: (s > 0 ? "l_mirror" : "r_mirror"), d: mirrorFR(S, s), c: [s * (hw + 13), -(S.belt + 14)], cs: 12 });
  });
  const bf = S.type === "coupe" ? hw - 60 : hw - 8, bk = S.type === "coupe" ? hw - 62 : hw - 18, bh0 = S.nose - 1, bh1 = S.cowl + 4, bch = bh0 + 0.4 * (bh1 - bh0);
  it.push({
    z: "bonnet", d: "M" + P(-bf, bh0) + " Q" + P(0, S.nose + 2) + " " + P(bf, bh0) + " L" + P(bk, bh1) + " Q" + P(0, S.cowl + 6) + " " + P(-bk, bh1) + " Z",
    c: [0, -(bh0 + bh1) / 2], cs: 14, lab: (S.cowl - S.nose >= 18 ? "Bonnet" : ""), fs: 14,
    cut: { clip: rectClipYmin(-bch + 1.5), line: "M" + P(-bf, bch) + " L" + P(bf, bch), c: [0, -(bh0 + bch) / 2] },
  });
  const w0 = S.cowl + 10, w1 = S.roof - 16, f = Math.max(0, (w0 - S.belt) / (S.roof - 12 - S.belt)), wb = Math.min(hw - 14, hw - 10 - f * (tb - 10) - 4), wt = hw - tb - 6;
  it.push({ z: "windscreen", glass: 1, d: "M" + P(-wb, w0) + " Q" + P(0, w0 + 2) + " " + P(wb, w0) + " L" + P(wt, w1) + " Q" + P(0, w1 + 3) + " " + P(-wt, w1) + " Z", c: [0, -(w0 + w1) / 2], cs: 24 });
  it.push({ z: "roof", d: roofFR(S), c: [0, -(S.roof - 6.5)], cs: 10 });
  return { pre: tyresFR(S), under: bodyFR(S), mid: "", items: it, post: dec.join("") };
}

function rearView(S, o) {
  const g = G, hw = S.W / 2, tb = S.tumb, it = [], dec = [];
  let under;
  if (S.type === "pickup") {
    under = "M" + P(-hw + 10, S.bb) + " L" + P(hw - 10, S.bb) + " Q" + P(hw, S.bb) + " " + P(hw, S.bb + 12) + " L" + P(hw, S.bedTop - 6) + " Q" + P(hw, S.bedTop) + " " + P(hw - 8, S.bedTop) + " L" + P(hw - 16, S.bedTop) + " L" + P(hw - 16, S.belt) +
      " L" + P(hw - tb, S.roof - 12) + " Q" + P(hw - tb - 2, S.roof) + " " + P(hw - tb - 14, S.roof) + " L" + P(-(hw - tb - 14), S.roof) + " Q" + P(-(hw - tb - 2), S.roof) + " " + P(-(hw - tb), S.roof - 12) +
      " L" + P(-(hw - 16), S.belt) + " L" + P(-(hw - 16), S.bedTop) + " L" + P(-(hw - 8), S.bedTop) + " Q" + P(-hw, S.bedTop) + " " + P(-hw, S.bedTop - 6) + " L" + P(-hw, S.bb + 12) + " Q" + P(-hw, S.bb) + " " + P(-hw + 10, S.bb) + " Z";
  } else under = bodyFR(S);
  it.push({ z: "rear_bumper", d: bumperFR(S, S.bt - 16), c: [0, -(S.bb + (S.bt - 16 - S.bb) * 0.5)], cs: 24, lab: "Bumper", fs: 16 });
  it.push({ z: "rear_lip", d: "M" + P(-(hw - 6), S.bt - 11) + " L" + P(hw - 6, S.bt - 11) + " L" + P(hw - 4, S.bt - g) + " L" + P(-(hw - 4), S.bt - g) + " Z", c: [0, -(S.bt - 7)], cs: 9 });
  if (S.type === "suv") dec.push('<path class="dec" d="M' + P(-40, S.bt - 7) + ' L' + P(40, S.bt - 7) + '"></path>');
  [-1, 1].forEach((s) => {
    if (S.type === "suv") {
      it.push({ z: "taillights", d: "M" + P(s * (hw - 3), S.tlLo + 5) + " Q" + P(s * (hw - 3), S.tlLo) + " " + P(s * (hw - 9), S.tlLo) + " L" + P(s * (hw - 57), S.tlLo + 2) + " L" + P(s * (hw - 57), S.tlHi - 2) + " L" + P(s * (hw - 9), S.tlHi) + " Q" + P(s * (hw - 3), S.tlHi) + " " + P(s * (hw - 3), S.tlHi - 5) + " Z", c: [s * (hw - 30), -(S.tlLo + S.tlHi) / 2], cs: 12 });
    } else {
      const tw = S.tw, top = S.tlR;
      it.push({ z: "taillights", d: "M" + P(s * (hw - 3), S.bt + g + 4) + " Q" + P(s * (hw - 3), S.bt + g) + " " + P(s * (hw - 7), S.bt + g) + " L" + P(s * (hw - 3 - tw), S.bt + g) + " L" + P(s * (hw - 3 - tw), top) + " L" + P(s * (hw - 8), top) + " Q" + P(s * (hw - 3), top) + " " + P(s * (hw - 3), top - 5) + " Z", c: [s * (hw - 3 - tw / 2), -(S.bt + top) / 2], cs: 12 });
    }
    it.push({ z: (s < 0 ? "l_mirror" : "r_mirror"), d: mirrorFR(S, s), c: [s * (hw + 13), -(S.belt + 14)], cs: 12 });
  });
  const key = (S.type === "suv" || S.type === "pickup") ? "tailgate" : "boot";
  let cw, top2, gd;
  if (S.type === "suv") {
    top2 = S.belt - g;
    const n = hw - 62, lo = S.tlLo - g, hi = S.tlHi + g;
    gd = "M" + P(-(hw - 8), S.bt + g) + " L" + P(hw - 8, S.bt + g) + " L" + P(hw - 8, lo) + " L" + P(n, lo) + " L" + P(n, hi) + " L" + P(hw - 12, hi) + " L" + P(hw - 12, top2 - 4) + " Q" + P(hw - 12, top2) + " " + P(hw - 20, top2) +
      " Q" + P(0, top2 + 3) + " " + P(-(hw - 20), top2) + " Q" + P(-(hw - 12), top2) + " " + P(-(hw - 12), top2 - 4) + " L" + P(-(hw - 12), hi) + " L" + P(-n, hi) + " L" + P(-n, lo) + " L" + P(-(hw - 8), lo) + " Z";
    cw = n;
  } else {
    cw = hw - 3 - S.tw - 5;
    top2 = S.type === "pickup" ? S.bedTop - g : S.deck - g;
    gd = "M" + P(-cw, S.bt + g) + " L" + P(cw, S.bt + g) + " L" + P(cw, top2 - 6) + " Q" + P(cw, top2) + " " + P(cw - 8, top2) + " Q" + P(0, top2 + 3) + " " + P(-cw + 8, top2) + " Q" + P(-cw, top2) + " " + P(-cw, top2 - 6) + " Z";
  }
  const cy = S.bt + g + (top2 - S.bt) * 0.62;
  it.push({ z: key, d: gd, c: (o.spare ? [-(cw + 36) / 2, -cy] : [0, -cy]), cs: 22, lab: (o.spare ? "" : (key === "tailgate" ? "Tailgate" : "Boot")), fs: (cw > 70 ? 18 : 16) });
  if (!o.spare) dec.push('<path class="dec" d="M' + P(-30, S.bt + g + 4) + ' L' + P(30, S.bt + g + 4) + ' L' + P(30, S.bt + g + 17) + ' L' + P(-30, S.bt + g + 17) + ' Z"></path>');
  let gh0, gh1, gg;
  if (S.type === "suv") { gh0 = S.belt + g + 2; gh1 = S.roof - 16; gg = trapFR(hw - 14, hw - tb - 8, gh0, gh1); }
  else if (S.type === "sedan") { gh0 = S.deck + g + 2; gh1 = S.roof - 16; gg = trapFR(hw - tb - 4, hw - tb - 16, gh0, gh1); }
  else if (S.type === "coupe") { gh0 = S.deck + g + 2; gh1 = S.roof - 16; gg = trapFR(hw - tb - 10, hw - tb - 24, gh0, gh1); }
  else { gh0 = S.belt + 8; gh1 = S.roof - 24; gg = trapFR(hw - tb - 30, hw - tb - 30, gh0, gh1); }
  it.push({ z: "rear_glass", glass: 1, d: gg, c: [0, -(gh0 + gh1) / 2], cs: 22 });
  it.push({ z: "roof", d: roofFR(S), c: [0, -(S.roof - 6.5)], cs: 10 });
  if (o.spare) {
    const hc = (S.bt + S.belt) / 2;
    it.push({ z: "spare_cover", d: "M" + P(-34, hc) + " A34,34 0 1,0 " + P(34, hc) + " A34,34 0 1,0 " + P(-34, hc) + " Z", c: [0, -hc], cs: 22, lab: "Spare", fs: 14 });
    dec.push('<circle class="dec" cx="0" cy="' + (-hc) + '" r="24"></circle>');
  }
  if (S.type === "coupe") dec.push('<path class="decf" d="M' + P(-40, S.deck) + ' L' + P(-36, S.roof + 2) + ' M' + P(40, S.deck) + ' L' + P(36, S.roof + 2) + ' M' + P(-(hw - 4), S.roof + 2) + ' L' + P(hw - 4, S.roof + 2) + ' L' + P(hw - 4, S.roof + 10) + ' L' + P(-(hw - 4), S.roof + 10) + ' Z"></path>');
  return { pre: tyresFR(S), under, mid: "", items: it, post: dec.join("") };
}

/* ============================================================
   ASSEMBLE THE INSPECTION SHEET
   mode "tablet": in-scope panels tappable, progress-aware, rest very faint
   mode "scope" : Ahmed's editor — every panel tappable, in-scope gold
   mode "ro"    : office / reviewer — read-only
============================================================ */
let clipSeq = 0;
function checkMark(c, cs) {
  const k = (cs || 20) / 20;
  return '<path class="zc" d="M-9,0 L-3,6 L9,-7" transform="translate(' + r1(c[0]) + ',' + r1(c[1]) + ') scale(' + r1(k * 100) / 100 + ')" style="stroke-width:' + r1(40 / k) / 10 + '"></path>';
}
function skipMark(c, cs) {
  const k = (cs || 20) / 20;
  return '<text class="zsk" x="' + r1(c[0]) + '" y="' + r1(c[1]) + '" font-size="' + r1(18 * k) + '">⊘</text>';
}
function renderItems(items, ctx) {
  return items.map((it) => {
    const nm = zoneName(it.z, ctx.shape);
    const attrs = ' data-zone="' + it.z + '" data-name="' + nm + '"' + (ctx.mode === "ro" ? "" : ' tabindex="0" role="button" aria-label="' + nm + '"');
    if (it.glass) {
      if (ctx.mode !== "scope" && ctx.tint) {
        const prog = progressClass(ctx, it.z);
        return '<g class="zone glass' + prog + '"' + attrs + '><path class="zp" d="' + it.d + '"></path>' + progressMark(ctx, it) + '</g>';
      }
      return '<path class="gplain" d="' + it.d + '"></path>';
    }
    const st = ctx.scope[it.z];
    const partial = (st === "partial" && it.cut);
    let s = "", cid = null;
    if (partial) { cid = "cp" + ctx.seed + (++clipSeq); s += '<clipPath id="' + cid + '"><path d="' + it.cut.clip + '"></path></clipPath>'; }
    if (ctx.mode === "scope") {
      s += '<g class="zone sc' + (st ? " in" : "") + (partial ? " part" : "") + '"' + attrs + '><path class="zp" d="' + it.d + '"></path>';
      if (partial) s += '<path class="zpc" d="' + it.d + '" clip-path="url(#' + cid + ')"></path><path class="cutline" d="' + it.cut.line + '"></path><text class="half" x="' + r1(it.cut.c[0]) + '" y="' + r1(it.cut.c[1]) + '" font-size="18">½</text>';
      else if (it.lab) s += '<text class="zl" x="' + r1(it.c[0]) + '" y="' + r1(it.c[1]) + '" font-size="' + it.fs + '">' + it.lab + '</text>';
      return s + "</g>";
    }
    if (!st) return '<path class="zoff" d="' + it.d + '"></path>';
    if (partial) {
      s += '<path class="zrest" d="' + it.d + '"></path>';
      const prog = progressClass(ctx, it.z);
      s += '<g class="zone' + prog + '"' + attrs + '><path class="zp" d="' + it.d + '" clip-path="url(#' + cid + ')"></path><text class="zl" x="' + r1(it.cut.c[0]) + '" y="' + r1(it.cut.c[1]) + '" font-size="18">½</text>' + progressMark(ctx, { c: it.cut.c, cs: it.cs }) + "</g>";
      return s + '<path class="cutline" d="' + it.cut.line + '"></path>';
    }
    const prog = progressClass(ctx, it.z);
    s += '<g class="zone' + prog + '"' + attrs + '><path class="zp" d="' + it.d + '"></path>';
    if (it.lab) s += '<text class="zl" x="' + r1(it.c[0]) + '" y="' + r1(it.c[1]) + '" font-size="' + it.fs + '">' + it.lab + "</text>";
    return s + progressMark(ctx, it) + "</g>";
  }).join("");
}
function progressClass(ctx, key) {
  if (!ctx.progress) return "";
  if (ctx.progress.done && ctx.progress.done.has(key)) return " completed";
  if (ctx.progress.skipped && ctx.progress.skipped.has(key)) return " skipped";
  return "";
}
function progressMark(ctx, it) {
  if (ctx.progress && ctx.progress.skipped && ctx.progress.skipped.has(it.z)) return skipMark(it.c, it.cs);
  return checkMark(it.c, it.cs);
}
function viewSVG(tr, v, ctx, cap, mid, capY) {
  return '<g transform="translate(' + tr + ')">' + v.pre + '<path class="under" d="' + v.under + '"></path>' + v.mid + renderItems(v.items, ctx) + v.post +
    '<text class="cap" x="0" y="' + capY + '"' + (mid ? ' text-anchor="middle"' : "") + '>' + cap + "</text></g>";
}
export function hasSpare(car) { return car.bodyShape === "suv" && !!car.spare; }

let seedSeq = 0;
// mode: "tablet" | "scope" | "ro". progress (optional): { done: Set<string>, skipped: Set<string> }
export function buildSheet(car, mode, progress) {
  const S = SPEC[car.bodyShape];
  if (!S) return "";
  const seed = "s" + (++seedSeq) + "_";
  const ctx = { shape: car.bodyShape, tint: !!car.tintBooked, spare: hasSpare(car), mode, scope: (car.scope && car.scope.z) || {}, progress, seed };
  let h = '<svg class="bp-svg' + (mode === "ro" ? " ro" : "") + '" viewBox="0 0 960 770" role="group" aria-label="Car panels: left, right, top, front, back">';
  h += '<rect x="-3000" y="-2000" width="7000" height="5000" fill="url(#bpMinor)"></rect><rect x="-3000" y="-2000" width="7000" height="5000" fill="url(#bpMajor)"></rect>';
  h += viewSVG("24,248", sideView(S, "l", ctx), ctx, "LEFT SIDE", false, 24);
  h += viewSVG("24,500", sideView(S, "r", ctx), ctx, "RIGHT SIDE", false, 24);
  h += viewSVG("800,26", topView(S, ctx), ctx, "TOP", true, -8);
  h += viewSVG("180,744", frontView(S, ctx), ctx, "FRONT", true, 22);
  h += viewSVG("500,744", rearView(S, ctx), ctx, "BACK", true, 22);
  return h + "</svg>";
}

/* ============================================================
   SCOPE HELPERS — packages, editing, breakdown
============================================================ */
export function allZones(car) {
  const z = (SHAPE_ZONES[car.bodyShape] || []).slice();
  if (hasSpare(car)) z.push("spare_cover");
  return z;
}
export function presetZones(p, car) {
  const out = {}, all = allZones(car);
  if (p === "full_body") all.forEach((k) => { out[k] = "full"; });
  else { const src = (PRESETS[p] || PRESETS.custom).z || {}; Object.keys(src).forEach((k) => { if (all.indexOf(k) > -1) out[k] = src[k]; }); }
  return out;
}
export function makeScope(p, car, zones) {
  return { preset: p, edited: false, z: zones || presetZones(p, car) };
}
// Re-derives scope.z after the car's body shape or spare-wheel flag
// changes (legacy jobs with no bodyType set at intake time) — same rule
// as the mockup's rescope(): presets recompute, custom/edited scopes just
// drop any zone keys that no longer exist for the new shape.
export function rescope(car) {
  if (!car.scope) return;
  if (!car.scope.edited && car.scope.preset !== "custom") car.scope.z = presetZones(car.scope.preset, car);
  else {
    const all = allZones(car);
    Object.keys(car.scope.z || {}).forEach((k) => { if (all.indexOf(k) < 0) delete car.scope.z[k]; });
  }
}
export function scopeKeys(car) {
  const z = (car.scope && car.scope.z) || {};
  return allZones(car).filter((k) => !!z[k]);
}
export function scopeLabel(car) {
  const s = car.scope || {};
  if (s.edited) return "Custom (edited)";
  if (s.preset === "custom") {
    const ks = scopeKeys(car);
    return ks.length === 1 ? "Custom: " + zoneName(ks[0], car.bodyShape) + " only" : "Custom";
  }
  return (PRESETS[s.preset] || PRESETS.custom).label;
}
export function breakdown(car) {
  const order = ["Front", "Upper", "Sides", "Rear"], n = { Front: 0, Upper: 0, Sides: 0, Rear: 0 };
  let part = 0;
  const z = (car.scope && car.scope.z) || {};
  scopeKeys(car).forEach((k) => { n[groupOf(k)]++; if (z[k] === "partial") part++; });
  const s = order.filter((g) => n[g]).map((g) => g + " " + n[g]).join(" · ");
  return (s || "Nothing selected yet") + (part ? " · " + part + " partial" : "");
}
// Off -> Full -> 1/2 (front 40%) -> Off for bonnet/fenders; Off -> Full ->
// Off for everything else — same cycle as the mockup's toggleZone().
export function nextZoneState(car, key) {
  const z = (car.scope && car.scope.z) || {};
  const cur = z[key];
  if (PARTIAL_OK[key]) return !cur ? "full" : (cur === "full" ? "partial" : null);
  return cur ? null : "full";
}
// Every zone key that should count toward "in scope" for the kiosk/office —
// scope panels plus tint glass (if booked) and whole-job extras.
export function zonesFor(car) {
  let z = scopeKeys(car);
  if (car.tintBooked) z = z.concat(TINT_KEYS);
  if (car.extras && car.extras.foilwork) z = z.concat(["foilwork"]);
  if (car.extras && car.extras.doorCups) z = z.concat(["door_cups"]);
  return z;
}
export function isZoneActive(car, k) { return zonesFor(car).indexOf(k) > -1; }
export function computeTotals(car, doneSet, skippedSet) {
  const z = zonesFor(car);
  let d = 0;
  z.forEach((k) => { if ((doneSet && doneSet.has(k)) || (skippedSet && skippedSet.has(k))) d++; });
  return { done: d, total: z.length };
}

/* ============================================================
   SVG DEFS + CSS — inject once per page
============================================================ */
export const PPF_SVG_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="tintHatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" fill="rgba(120,180,240,0.10)"></rect>
      <line x1="1" y1="0" x2="1" y2="10" stroke="rgba(180,215,250,0.6)" stroke-width="2.5"></line>
    </pattern>
    <pattern id="bpMinor" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0 L0 0 0 20" fill="none" stroke="rgba(120,175,235,0.09)" stroke-width="1"></path>
    </pattern>
    <pattern id="bpMajor" width="100" height="100" patternUnits="userSpaceOnUse">
      <path d="M100 0 L0 0 0 100" fill="none" stroke="rgba(120,175,235,0.2)" stroke-width="1.5"></path>
    </pattern>
    <symbol id="icon-shield" viewBox="0 0 24 24"><path d="M12 2 L20 5.2 V11 C20 16.2 16.6 19.8 12 21.5 C7.4 19.8 4 16.2 4 11 V5.2 Z"></path></symbol>
    <symbol id="icon-window" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"></rect><line x1="6" y1="17" x2="17" y2="6" stroke="currentColor" stroke-width="1.6"></line><line x1="10" y1="17" x2="19" y2="8" stroke="currentColor" stroke-width="1.6"></line></symbol>
    <symbol id="icon-sticker" viewBox="0 0 24 24"><path d="M4 4 H15 L20 9 V20 H4 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M15 4 V9 H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></symbol>
    <symbol id="icon-back" viewBox="0 0 24 24"><path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></symbol>
    <symbol id="icon-undo" viewBox="0 0 24 24"><path d="M6 9 H15 A5.5 5.5 0 1 1 10 18.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></path><path d="M6 9 L10.5 5 M6 9 L10.5 13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></symbol>
    <symbol id="icon-check" viewBox="0 0 24 24"><path d="M4 12.5 L9.5 18 L20 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></path></symbol>
    <symbol id="icon-cross" viewBox="0 0 24 24"><path d="M5 5 L19 19 M19 5 L5 19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"></path></symbol>
    <symbol id="icon-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"></circle><line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" stroke-width="2.4"></line></symbol>
    <symbol id="icon-play" viewBox="0 0 24 24"><path d="M6.5 4 L20 12 L6.5 20 Z"></path></symbol>
    <symbol id="icon-chev" viewBox="0 0 24 24"><path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></symbol>
    <symbol id="sil-suv" viewBox="0 0 60 26"><path d="M3 20 L3 12.5 Q3 10.5 6 10 L13 9 L17.5 3.2 Q18.5 2 20.5 2 L53 2 Q55.5 2 56 4.5 L57 10 L57 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M19 9 L30 9 L30 4 L21.5 4 Z M33 9 L45 9 L45 4 L33 4 Z" fill="currentColor" opacity=".35"></path><circle cx="15" cy="20.5" r="4.2" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle><circle cx="46" cy="20.5" r="4.2" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle></symbol>
    <symbol id="sil-sedan" viewBox="0 0 60 26"><path d="M2 20 L2 15.5 Q2 13.5 5 13 L17 11.5 L24 5 Q25.5 4 28 4 L38 4 Q40.5 4 42.5 6 L47 11 L56 12.2 Q58 12.6 58 14.5 L58 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><circle cx="14" cy="20.5" r="3.8" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle><circle cx="47" cy="20.5" r="3.8" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle></symbol>
    <symbol id="sil-coupe" viewBox="0 0 60 26"><path d="M2 20 L2 16.5 Q2.5 14.5 6 14 L20 12.5 L28 7 Q30 6 33 6 L37 6 Q41 6 45 9.5 L55 14 Q58 15 58 17 L58 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M49 10 L57 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><circle cx="13" cy="20.5" r="3.8" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle><circle cx="46" cy="20.5" r="3.8" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle></symbol>
    <symbol id="sil-pickup" viewBox="0 0 60 26"><path d="M3 20 L3 12.5 Q3 10.5 6 10 L12.5 9 L17 3.2 Q18 2 20 2 L34 2 Q35.5 2 35.5 3.5 L35.5 10.5 L57 10.5 L57 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><circle cx="14" cy="20.5" r="4.2" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle><circle cx="47" cy="20.5" r="4.2" fill="#0A0A09" stroke="currentColor" stroke-width="2"></circle></symbol>
  </defs>
</svg>`;

// Ported 1:1 from the mockup's <style> block (diagram-relevant rules
// only — the screen/layout chrome CSS lives in ppfRoom.jsx next to the
// components that use it) plus new .skipped/.zsk rules for "Not needed"
// panels, a state the base mockup didn't have (done/undone only).
export const PPF_DIAGRAM_CSS = `
.zone{ cursor:pointer; outline:none; }
.zp{ fill:rgba(221,232,245,.07); stroke:#DDE8F5; stroke-width:2.2; stroke-linejoin:round; transition:fill .15s ease, stroke .15s ease; }
.zone:hover .zp{ fill:rgba(221,232,245,.2); }
.zone:active .zp{ fill:rgba(232,195,74,.35); }
.zone:focus-visible .zp{ stroke:#E8C34A; stroke-width:4; }
.zone.glass .zp{ fill:url(#tintHatch); stroke:#9CC8F0; stroke-dasharray:7 4; }
.zone.completed .zp{ fill:rgba(63,178,106,.45); stroke:#3FE07A; stroke-width:4; stroke-dasharray:none; }
.zone.skipped .zp{ fill:rgba(140,133,115,.28); stroke:#8C8573; stroke-width:3; stroke-dasharray:4 4; }
.zl{ fill:#DDE8F5; font-family:'IBM Plex Sans Condensed','IBM Plex Sans',sans-serif; font-weight:700; text-anchor:middle; dominant-baseline:central; pointer-events:none; opacity:.9; }
.zc{ fill:none; stroke:#fff; stroke-width:4; stroke-linecap:round; stroke-linejoin:round; opacity:0; pointer-events:none; }
.zsk{ fill:#D8D2C0; font-weight:700; text-anchor:middle; dominant-baseline:central; pointer-events:none; opacity:0; }
.zone.completed .zl, .zone.skipped .zl{ opacity:0; }
.zone.completed .zc{ opacity:1; }
.zone.skipped .zsk{ opacity:1; }
.gplain{ fill:rgba(120,170,220,.13); stroke:rgba(221,232,245,.35); stroke-width:1.5; pointer-events:none; }
.under{ fill:#10284a; stroke:rgba(221,232,245,.3); stroke-width:1.5; pointer-events:none; }
.tyre{ fill:#040a13; stroke:#2a4668; stroke-width:2; pointer-events:none; }
.wheel{ pointer-events:none; }
.wheel .t{ fill:#040a13; stroke:#2a4668; stroke-width:3; }
.wheel .rim{ fill:#0d1f35; stroke:#86a6c8; stroke-width:2; }
.wheel .sp{ stroke:#86a6c8; stroke-width:3.5; stroke-linecap:round; }
.wheel .hub{ fill:#86a6c8; }
.dec{ fill:none; stroke:rgba(221,232,245,.5); stroke-width:1.6; pointer-events:none; }
.decf{ fill:#07111f; stroke:rgba(221,232,245,.45); stroke-width:1.5; pointer-events:none; }
.frame{ fill:none; stroke:#10284a; stroke-width:5; pointer-events:none; }
.cap{ fill:rgba(150,195,240,.6); font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:13px; letter-spacing:.14em; }
.gnd{ stroke:rgba(150,195,240,.28); stroke-width:2; stroke-dasharray:3 7; }
.ro .zone{ cursor:default; pointer-events:none; }
.zoff{ fill:rgba(221,232,245,.02); stroke:rgba(221,232,245,.16); stroke-width:1.2; pointer-events:none; }
.zrest{ fill:rgba(221,232,245,.02); stroke:rgba(221,232,245,.22); stroke-width:1.2; stroke-dasharray:4 5; pointer-events:none; }
.cutline{ fill:none; stroke:#E8C34A; stroke-width:2.5; stroke-dasharray:6 5; pointer-events:none; }
.half{ fill:#E8C34A; font-family:'IBM Plex Sans Condensed','IBM Plex Sans',sans-serif; font-weight:700; text-anchor:middle; dominant-baseline:central; pointer-events:none; }
.flare{ fill:none; stroke:rgba(221,232,245,.62); stroke-width:6; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
.rail{ fill:none; stroke:rgba(221,232,245,.6); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
.chrome-line{ fill:none; stroke:rgba(236,241,248,.88); stroke-width:4.5; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
.chrome-line.thin{ stroke-width:2.5; }
.skid{ fill:rgba(221,232,245,.16); stroke:rgba(221,232,245,.6); stroke-width:1.5; pointer-events:none; }
.zone.sc .zp{ fill:rgba(221,232,245,.03); stroke:rgba(221,232,245,.3); stroke-width:1.6; stroke-dasharray:none; }
.zone.sc .zl{ opacity:.35; }
.zone.sc:hover .zp{ fill:rgba(232,195,74,.14); }
.zone.sc.in .zp{ fill:rgba(232,195,74,.26); stroke:#E8C34A; stroke-width:3; }
.zone.sc.in .zl{ opacity:1; fill:#F6E7B0; }
.zone.sc.in.part .zp{ fill:rgba(221,232,245,.03); stroke:rgba(232,195,74,.5); stroke-width:1.6; stroke-dasharray:4 5; }
.zpc{ fill:rgba(232,195,74,.36); stroke:#E8C34A; stroke-width:3; pointer-events:none; }
.zone.sc:focus-visible .zp{ stroke:#fff; stroke-width:4; }
@media (prefers-reduced-motion:no-preference){
  .zone.just-done .zp{ animation:ppfPopz .3s ease; transform-box:fill-box; transform-origin:center; }
}
@keyframes ppfPopz{ 0%{ transform:scale(1); } 45%{ transform:scale(1.08); } 100%{ transform:scale(1); } }
`;

let stylesInjected = false;
// Call once (e.g. at the top of any PPF component's render) — idempotent,
// safe to call from multiple components.
export function injectPPFDiagramStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  if (document.getElementById("ppf-diagram-styles")) { stylesInjected = true; return; }
  const style = document.createElement("style");
  style.id = "ppf-diagram-styles";
  style.textContent = PPF_DIAGRAM_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}
