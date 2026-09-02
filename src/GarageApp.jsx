import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Plus, ChevronLeft, Camera, Check, Wrench, Car, Search,
  Clock, User, Building2, X, CheckCircle2, Lock, Delete,
  LayoutDashboard, ListChecks, UserPlus, ShieldCheck, Archive, ShieldAlert,
  Users, BarChart3, Phone, Download, Upload, FileText, Send, PauseCircle,
  MessageSquare, TrendingUp, RotateCcw, ExternalLink, Star, AlertCircle
} from "lucide-react";
import { jsPDF } from "jspdf";

/* ---------------------------------------------------------------
   Mr.CAP — Vehicle Workflow Tracker
--------------------------------------------------------------- */

// NOTE: converted from `const` to `let` so an admin can add/edit/retire
// roles and service categories at runtime (see loadDynamicServicesAndRoles
// below) without a code redeploy. This block below is only the FALLBACK
// used before the Supabase fetch resolves (and if that fetch ever fails) —
// once loaded, this object is reassigned in place, so every existing
// `ROLE_DEFS[key]` reference elsewhere in the file keeps working unchanged.
let ROLE_DEFS = {
  admin:      { label: "God's Eye (Admin)", color: "#3C5A78", simplified: false },
  intake:     { label: "Intake",            color: "#C98F00", simplified: false },
  detailing:  { label: "Detailing",         color: "#3F7A54", simplified: true },
  ppf:        { label: "PPF & Films",       color: "#7A4F9E", simplified: true },
  dentrepair: { label: "Dent Repair",       color: "#B37A2E", simplified: true },
  bodyshop:   { label: "Body Work (Smartech)", color: "#B3402B", simplified: true },
  upholstery: { label: "Upholstery (Beneloom)", color: "#A6752C", simplified: true },
};

// Every real, individually-toggleable capability in the app. Admins
// (role "admin") always have every permission — enforced in hasPermission
// below, never stored as individually-off for them, so they can never
// accidentally lock themselves or each other out. Everyone else's access
// is exactly and only what's turned on here, editable any time from the
// Team screen's permissions grid.
const PERMISSIONS = [
  { key: "newJob",     label: "New Job" },
  { key: "editJob",    label: "Edit Job" },
  { key: "sendBack",   label: "Send Back" },
  { key: "delete",     label: "Delete" },
  { key: "archive",    label: "Archive" },
  { key: "customers",  label: "Customers" },
  { key: "quotations", label: "Quotations" },
  { key: "reports",    label: "Reports" },
  { key: "team",       label: "Team" },
  { key: "import",     label: "Import" },
  { key: "services",   label: "Services & Pricing" },
  { key: "googleReview", label: "Google Review Requests" },
  { key: "markupCalc", label: "Markup Calculator" },
  { key: "statusUpdate", label: "Customer Status Updates" },
];

// True/false starting grid per person, matching exactly what each role
// could already do before this system existed — nothing changes for
// anyone on rollout day, admins just gained the ability to adjust it.
// googleReview and markupCalc start off for everyone but the admins (who
// always pass via the role check in hasPermission) — turn them on per
// person from the Team screen as you want to hand that access out.
// statusUpdate defaults on for Ahmed and Laani specifically (the two
// intake staff actually handling customer-facing updates day to day),
// off for everyone else non-admin.
const DEFAULT_TEAM = [
  { id: "owner",  name: "Owner",  role: "admin",    pin: null,
    permissions: { newJob: true, editJob: true, sendBack: true, delete: true, archive: true, customers: true, quotations: true, reports: true, team: true, import: true, googleReview: true, markupCalc: true, statusUpdate: true } },
  { id: "suhail", name: "Suhail", role: "admin",    pin: null,
    permissions: { newJob: true, editJob: true, sendBack: true, delete: true, archive: true, customers: true, quotations: true, reports: true, team: true, import: true, googleReview: true, markupCalc: true, statusUpdate: true } },
  { id: "ahmed",  name: "Ahmed",  role: "intake",   pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: true, customers: true, quotations: true, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: true } },
  { id: "laani",  name: "Laani",  role: "intake",   pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: true, customers: true, quotations: true, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: true } },
  { id: "reagen", name: "Reagen", role: "detailing",pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: false, customers: false, quotations: false, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: false } },
  { id: "noel",   name: "Noel",   role: "detailing",pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: false, customers: false, quotations: false, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: false } },
  { id: "parvez", name: "Parvez", role: "ppf",      pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: false, customers: false, quotations: false, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: false } },
  { id: "fakher", name: "Fakher", role: "dentrepair", pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: false, customers: false, quotations: false, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: false } },
  { id: "jobish", name: "Jobish", role: "bodyshop", pin: null,
    permissions: { newJob: true, editJob: false, sendBack: false, delete: false, archive: false, customers: false, quotations: false, reports: false, team: false, import: false, googleReview: false, markupCalc: false, statusUpdate: false } },
];

// The single source of truth for every permission check in the app.
// Admins always pass, no exceptions, no way to toggle it off — matches
// "God's Eye always has everything" exactly as specified.
function hasPermission(session, team, key) {
  if (!session) return false;
  if (session.role === "admin") return true;
  const member = team.find((m) => m.id === session.id);
  return !!member?.permissions?.[key];
}

// A single named exception outside the permission grid, not a new
// permission key — deliberately Suhail-only, not "any admin," and NOT
// toggleable through the Team permissions screen. Covers the bigger
// stats dashboard and the WhatsApp message editor, both of which the
// shop wants kept off the Owner login specifically.
function isSuperAdmin(session) {
  return !!session && session.id === "suhail";
}

const LOCATIONS = ["Mr CAP (Main)", "Beneloom (Upholstery)", "Smartech (Body & Paint)"];
// Placeholder until the shop's real Terms & Conditions text is provided —
// swap this single constant, nothing else needs to change.
const TERMS_AND_CONDITIONS_TEXT = `The Customer has agreed with the below terms and conditions to perform the Service Program mentioned in the Vehicle receipt with Z Cars Technologies (Master Franchisee of Mr CAP in the UAE) hereafter will be mentioned as the Company.

Valuables:
The Company does not bear any responsibility for any valuables left inside the vehicle. The Customer is required to take out all valuable items from the Vehicle before the Company start to perform the Service Program.

Delivery time:
The vehicle is ready for delivery on the agreed date and time in the Vehicle receipt. Agreed delivery time can be extended upon agreement with the customer in case of any hidden defects noted after vehicle collection on the car's exterior or interior which require extra time to guarantee Mr CAP quality standard.

Vehicle collection:
Vehicle is to be collected by the Customer within max 48 hours after the Service Program completion and the Customer informing by the Company by any means of communication like telephone, SMS, e-mail. Vehicles collected after 48 hours will be charged 100 AED per working day for overstay.

Payment:
The agreed amount for the Service Program should be paid in full. No extra reductions can be availed after signing the vehicle receipt. The amount can be increased upon agreement with the customer in case of adding extra services and treatments from the Service Program by the Customer or if the vehicle requires Extended type of the chosen Service Program which required more working time.

The Company responsibility:
The company is not responsible to any breakdown of any exterior or interior parts or any electronical and mechanical modules and blocks which happened in the process of their normal usage and performing their normal functions and could happen due to hidden defects or wear and tear.
The company liability in front of the vehicle owner or customer is limited with the total invoice amount for the company services for the vehicle.

The Service Program responsibilities and quality result:
The customer is informed about the result and quality level of each ordered Service Program.

MachineClean™ & Dressing™
The Company is not responsible for any damages occurred to vehicle's electronics or engine due to MachineClean™ & Dressing™ treatment. The treatment will be done in the most careful way to ensure as less as possible affect by water to electronical blocks and engine but the Company is taking off the responsibility for any faults happen after this treatment.

GlassRepair™
The Company is not taking the responsibility if the windshield damage expands in the process of repair.
The Customer was informed that possible aesthetic result will be from 50% to 90% depending on the damage - that means the repaired damage may be visible from certain vision angles.
The Company gives the Warranty that the damage will not expand after the performed repair in case if the damage was a stone chip NOT a crack and if there were no any excessive or continuous mechanical or other type of impact, for example, overheating on "a spot" by a heat gun during window film installation process. In case if the repaired stone chip by any means during normal usage of the glass expands the Company by its cost has to repair the damage but the Company does not take any responsibility and costs for damaged window replacement.
The Company does not give any Warranty to repaired cracks. The repair of cracks is giving only aesthetic result but does not ensure the safety of the glass anymore and does not guarantee that the crack will not expand. Crack repairs are done on the risk and responsibility of the Customer.

Deoxidizing™
It was explained to the Customer about the result of the Deoxidizing™ treatment (included in FormulaU™, MasterTreatment™, TuneUp™, FormulaU™-Resealant™, MasterResealant™). There are some specific damages which will remain (or become less visible) on the paint such as deep scratches on the clear coat or damages which already reached the paint or base coat. Deep scratches can be removed upon request of the Customer and with the Customer responsibility in case of damaging the clear coat of the paint.

WindowTinting™
The Customer is informed about the current UAE Federal Law regarding window tinting regulation. The Customer is notified about allowed types of films to be installed in the UAE. The Customer is taking full legal responsibility for paying fines and communicating with the government structures if the chosen type of film to be installed on the Customer's vehicle does not comply with the current Federal Law of the UAE.
The Company takes off any responsibilities in case if any failure to electronic modules and blocks happen after film installation process.
The Customer is warned that in case of having any glass damages like cracks or stone chips (repaired or not) the Company will not carry any responsibility if these damages will expand during or after film installation process.

Amount to be paid by the Customer upon vehicle delivery: AED + 5% VAT

CUSTOMER SIGNS BY THIS AGREES WITH THE ABOVE MENTIONED TERMS AND CONDITIONS AS WRITTEN ON THE BACK SIDE OF THIS VEHICLE RECEIPT.`;

// The 13 standard car panels for Body Work damage marking — a fixed
// checklist so every job uses the same real terms Jobish/Smartech
// recognize, rather than free text.
const CAR_PANELS = [
  "Bonnet", "Roof", "Front Bumper", "Rear Bumper",
  "Front-Left Door", "Front-Right Door", "Rear-Left Door", "Rear-Right Door",
  "Left Fender", "Right Fender", "Left Quarter Panel", "Right Quarter Panel", "Trunk/Boot",
];
const PRIORITIES = ["Low", "Medium", "High"];

// Rebuilt from the shop's actual paper job card (Aug 2026): 5 real
// categories tied to specific people, not a generic 4-bucket guess.
// PPF/Films carries an extra reviewer step — Parvez does the work,
// Ahmed signs off — modeled via `reviewerRole`, distinct from `role`
// (the doer) so the app can show Ahmed a dedicated review queue.
// Each treatment carries its verified retail/B2B reference price where we
// have real numbers from the shop's price list (Aug 2026 photo). `null`
// means no price was given — those stay manual-entry, never auto-filled
// with a guessed number. B2B price is a REFERENCE only; staff can still
// discount further per job (both B2B and walk-in use the same discount
// field for that reason — see job.discountPercent).
// Same pattern as ROLE_DEFS above: `let` instead of `const` so this is the
// fallback/seed shape, reassigned in place once the real data loads from
// Supabase's service_categories/service_treatments tables.
let SERVICES = [
  { key: "detailing",  label: "Detailing",        role: "detailing",
    treatments: [
      { name: "Deoxidising & ShineAll", retail: 1500, b2b: 750 },
      { name: "MasterTreatment (New car)", retail: 3000, b2b: 2300 },
      { name: "MasterTreatment (Used car)", retail: 3500, b2b: 2500 },
      { name: "FormulaU (New car)", retail: 2500, b2b: 2000 },
      { name: "FormulaU (Used car)", retail: 2700, b2b: 2200 },
      { name: "TuneUp", retail: 1800, b2b: 900 },
      { name: "InteriorService", retail: 1000, b2b: 700 },
      { name: "LeatherCare & InteriorService", retail: null, b2b: null },
      { name: "WashAll-FormulaU treated", retail: null, b2b: null },
      { name: "MasterResealant", retail: 1250, b2b: 1000 },
      { name: "FormulaU resealant", retail: null, b2b: null },
      { name: "LeatherRestore", retail: 500, b2b: 300 },
      { name: "SmellStop", retail: null, b2b: null },
      { name: "Glass Repair / Replacement", retail: 300, b2b: 200 },
    ] },
  { key: "ppf",        label: "PPF & Films",      role: "ppf", reviewerRole: "intake", reviewerNote: "Reviewed by Ahmed",
    treatments: [
      { name: "AntiGravel PPF - SUV (10yr)", retail: 18000, b2b: 14000 },
      { name: "AntiGravel PPF - Saloon (10yr)", retail: 14000, b2b: 12000 },
      { name: "FoilWork", retail: null, b2b: null },
      { name: "Window Tinting - SUV (10yr)", retail: 1800, b2b: 1300 },
      { name: "Window Tinting - Saloon", retail: 1500, b2b: 1000 },
      { name: "Window Tinting - Windshield", retail: 700, b2b: 500 },
    ] },
  { key: "dentrepair", label: "Dent Repair",      role: "dentrepair",
    // Genuinely size-dependent per the shop — no auto-fill for this one at all.
    treatments: [{ name: "Dent Removal", retail: null, b2b: null }] },
  { key: "bodyshop",   label: "Body Work (Smartech)", role: "bodyshop",
    treatments: [
      { name: "BodyWorks (Smart Paint)", retail: 1000, b2b: 700 },
      { name: "BodyWorks (min charge)", retail: 800, b2b: 600 },
      { name: "RimRepair - Painted", retail: 500, b2b: 250 },
      { name: "RimRepair - Diamond cut", retail: 600, b2b: 300 },
      { name: "Panels", retail: null, b2b: null },
    ] },
  { key: "upholstery", label: "Upholstery (Beneloom)", role: "upholstery",
    // No prices were given for any Beneloom treatment — all manual-entry.
    treatments: ["Upholstery", "RoofLifting", "SteerRefresh", "QuietCar", "CarbonFiber", "StarLiner", "DashRenew"]
      .map((name) => ({ name, retail: null, b2b: null })) },
];

// UAE plate reference data. Dubai and Abu Dhabi are precisely confirmed
// (RTA/DMT public sources, Aug 2026). The other five emirates' full code
// lists are not fully verified — each carries a "Type manually" fallback
// in the picker so an uncommon code never gets blocked, it just skips the
// fast-tap path. This is a deliberate accuracy tradeoff, not an oversight.
const EMIRATES = [
  { code: "DXB", name: "Dubai", categoryType: "letters", categories: [
    "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
    "AA","BB","CC","DD","EE","FF","HH","II","MM",
  ] },
  { code: "AUH", name: "Abu Dhabi", categoryType: "numbers", categories: Array.from({ length: 50 }, (_, i) => String(i + 1)) },
  { code: "SHJ", name: "Sharjah", categoryType: "numbers", categories: ["1", "2", "3", "4"] },
  { code: "AJM", name: "Ajman", categoryType: "letters", categories: ["A", "B", "C", "D", "E", "H"] },
  { code: "RAK", name: "Ras Al Khaimah", categoryType: "letters", categories: ["A", "C", "D", "I", "K", "M", "N"] },
  { code: "FUJ", name: "Fujairah", categoryType: "letters", categories: ["A", "B", "C", "D", "E", "F", "G", "K", "M", "P", "R", "S"] },
  { code: "UAQ", name: "Umm Al Quwain", categoryType: "letters", categories: ["A", "B", "C", "D", "E", "F", "G"] },
];

const STAGES = [
  { key: "intake",        label: "Intake" },
  { key: "parts_removal", label: "Parts Removal" },
  { key: "service",       label: "Service" },
  { key: "qc",             label: "QC" },
  { key: "ready",          label: "Ready for Collection" },
  { key: "collected",      label: "Collected" },
];

// Quick-pick lines for the customer tracking page — more specific than
// the 6-stage strip alone (e.g. distinguishing "in polish" from "PPF
// being applied" when both fall under the same Service stage). Ahmed
// and Laani pick from these day to day; free text is also allowed for
// anything that doesn't fit.
const CUSTOMER_STATUS_PRESETS = [
  "Vehicle received, inspection underway",
  "Parts being removed",
  "Waiting on parts",
  "In bodywork",
  "In detailing / polish",
  "PPF being applied",
  "Ceramic coating curing",
  "Waiting on diagnostic report",
  "Quality check in progress",
  "Final touches — almost ready",
];

const COLORS = {
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
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');`;
const DISPLAY_FONT = "'Playfair Display', serif";
const MONO_FONT = "'IBM Plex Mono', monospace";

const LOGO_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGgAAACMCAIAAAAfq3tiAAACcUlEQVR4nO3bQW4TQRCF4WeLTcTKFqwTKednheA0kZIVV8jKDIsgIMGxx88z3VXV/3+AUulT9bI30zSJLm/be4GsAWcGnBlwZsCZAWcGnBlwZsCZAWcGnBlwZsCZAWcGnBlwZsCZAWcGnBlwZsCZAWcGnBlwZsCZAWcGnBlwZsCZAWcGnNnm/vau9w6te3h6vH4IF2cGnBlwZqPA7XeH/e6w4MAh4Pa7w7cvP25ufi44sz7ci9rnT0uem8rDraSm2nDrqakw3Kpqqgq3tppKwjVQUz24NmoqBtdMTZXgWqqpDFxjNdWAa6+mAnBd1JQdrpeaUsN1VFNeuL5qSgrXXU0Z4SKoKR1cEDXlgoujpkRwodSUBS6amlLABVRTfLiYagoOF1ZNkeEiqyksXHA1xYSLr6aAcCnUFA0ui5pCwSVSUxy4XGoKApdOTRHgMqqpO1xSNfWFy6umjnCp1dQLLruausAVUFN7uBpqagxXRk0t4SqpqRlcMTW1gaunpgZwJdW0NlxVNa0KV1hN68HVVtNKcOXVtAbcCGpaHG4QNS0LN46aFoQbSk1LwY2mpkXgBlTT9XBjqulKuGHVdA3cyGqy4QZXkweHmgw41F66DA61P10Ah9q/zYVD7U2z4FD7v/NwqB3tDBxq73UKDrUTvQuH2umOw6F2tiNwqM3pLRxqM3sFh9r8/sKhdlG/4VC7tK1Qs9qi5rVFzWuLmlf/34NJA84MODPgzIAzA84MODPgzIAzA84MODPgzIAzA84MODPgzIAzA84MOLMPX79/7L1Do56fl7ySzf3t3YLjUvTw9Hj9EJ6qGXBmm2maeu+Qsl9egXXyVu3qYwAAAABJRU5ErkJggg==";
const LOGO_LOCKUP_SRC = "data:image/png;base64,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";

// Multi-brand letterhead strip (Quiet Cabin / Mr.CAP / Beneloom) drawn
// top-right on official PDFs, matching the shop's actual letterhead
// design. Kept separate from LOGO_SRC (the compact Mr.CAP-only mark
// used in-app and everywhere space is tight) since the two ratios and
// use cases don't overlap. Caller leaves room above their own header
// content — see LETTERHEAD_BANNER_H below.
const LETTERHEAD_BANNER_W = 130;
const LETTERHEAD_BANNER_H = LETTERHEAD_BANNER_W / (1480 / 480);
function drawLetterheadBanner(doc, pageW, margin) {
  try { doc.addImage(LOGO_LOCKUP_SRC, "PNG", pageW - margin - LETTERHEAD_BANNER_W, 14, LETTERHEAD_BANNER_W, LETTERHEAD_BANNER_H); } catch (e) { /* banner optional — never block the PDF over an image error */ }
}
const CAR_DIAGRAM_SRC = "data:image/jpeg;base64,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";


function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
// A collected job stays on the main board through the end of the calendar
// day it was collected on, then becomes Archive-only from the next day on.
// "updatedAt" is used as the collection timestamp — it's set the moment a
// job's stage advances to "collected" and not touched again after that.
function isRecentlyCollected(job) {
  if (job.stageKey ? job.stageKey !== "collected" : STAGES[job.stageIndex]?.key !== "collected") return false;
  const collectedAt = new Date(job.updatedAt);
  const now = new Date();
  return (
    collectedAt.getFullYear() === now.getFullYear() &&
    collectedAt.getMonth() === now.getMonth() &&
    collectedAt.getDate() === now.getDate()
  );
}
// WhatsApp's wa.me links need a full international number with no
// leading zero — a local UAE number like 0501234567 has to become
// 971501234567, or WhatsApp won't recognize it at all. Handles the
// common real-world variants: plain local (0501234567), already
// international (971501234567 or +971501234567), and the 00-prefixed
// dialing format (00971501234567).
function toWhatsAppNumber(phone) {
  let digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00971")) return digits.slice(2);
  if (digits.startsWith("971")) return digits;
  if (digits.startsWith("0")) return "971" + digits.slice(1);
  if (digits.length === 9) return "971" + digits; // bare local number, no leading 0
  return digits;
}

function compressImage(file, maxW = 1000, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- Supabase client (real relational schema) ---------------- */
const SUPABASE_URL = "https://naweqyzfrxhmpvnlznbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hd2VxeXpmcnhobXB2bmx6bmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjA1ODQsImV4cCI6MjEwMjE5NjU4NH0.bVI4jYdPC1ri9irI6LGICO0gJOJZYdLD6jay8aWxdR4";
// Every write (POST/PATCH/DELETE) goes through this instead of hitting
// Supabase directly. It holds the powerful service_role key server-side
// (never in this bundle) and is the one thing standing between "anyone
// who opens dev tools" and the database, once RLS denies anon writes
// directly. Reads (GET) are unaffected and still go straight to Supabase.
const GATEKEEPER_URL = `${SUPABASE_URL}/functions/v1/db-gatekeeper`;

// Who's currently logged in, for the audit log — set on login/logout,
// read by sbFetch on every write. Same mutable-global pattern already
// used for SERVICES/ROLE_DEFS: one place to update, every call site
// downstream picks it up automatically with no other changes needed.
let currentActor = null;
function setCurrentActor(session) {
  currentActor = session ? { id: session.id, name: session.name, role: session.role } : null;
}
// Optional per-call human-readable summary for the activity log (e.g.
// "Edited job DXB-41929: added part Kings Shocks") — set right before a
// write, read once by sbFetch, then cleared, so it never leaks onto an
// unrelated later call if a caller forgets to pass one.
let nextActivitySummary = null;
function withActivitySummary(summary) { nextActivitySummary = summary; }


// Last real error text from a storage call, surfaced in the UI so a failed
// save is visible instead of silently looking fine — same discipline as
// the previous key-value version, now applied to real table operations.
let lastStorageError = null;

async function sbFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isWrite = method !== "GET";
  try {
    let res;
    if (isWrite) {
      // options.body is always a JSON string at every existing call site
      // (json.stringify'd by the caller) — parsed back to a real value
      // here so it nests correctly inside the gatekeeper's envelope
      // instead of being double-encoded as a string-within-a-string.
      let parsedBody;
      if (options.body !== undefined) {
        try { parsedBody = JSON.parse(options.body); } catch { parsedBody = options.body; }
      }
      res = await fetch(GATEKEEPER_URL, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, method, body: parsedBody, headers: options.headers || {}, actor: currentActor, summary: nextActivitySummary || undefined }),
      });
      nextActivitySummary = null;
    } else {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastStorageError = `${method} ${path.split("?")[0]} ${res.status}: ${body.slice(0, 200)}`;
      return { ok: false, data: null };
    }
    lastStorageError = null;
    const text = await res.text();
    return { ok: true, data: text ? JSON.parse(text) : null };
  } catch (e) {
    lastStorageError = `${method} ${path.split("?")[0]} threw: ${String(e && e.message || e).slice(0, 200)}`;
    return { ok: false, data: null };
  }
}

// Supabase/PostgREST hard-caps every response at 1000 rows server-side
// (db-max-rows) — a `limit=` in the URL above that is silently ignored,
// not an error, so this is easy to miss until row counts pass 1000.
// Anything that needs the FULL table (reports, dashboards, exports)
// must page through with offset= instead of trusting a single request.
// `path` must not already contain its own limit=/offset=.
async function sbFetchAll(path, pageSize = 1000) {
  const sep = path.includes("?") ? "&" : "?";
  let offset = 0;
  let all = [];
  while (true) {
    const { ok, data } = await sbFetch(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (!ok) return { ok: false, data: null };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return { ok: true, data: all };
}

// Explicit activity log entries for things that aren't a table write —
// logins and opening a job/quote. Goes through the same gatekeeper path
// (activity_log is in its allowlist) rather than a separate mechanism.
async function logEvent(actionType, detail, actorOverride) {
  const actor = actorOverride || currentActor;
  await sbFetch("activity_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      actor_id: actor?.id || null,
      actor_name: actor?.name || null,
      actor_role: actor?.role || null,
      action_type: actionType,
      detail,
    }]),
  });
}

/* ---------------- Team ---------------- */
async function loadTeam() {
  const { ok, data } = await sbFetch("team_members?select=*&order=created_at.asc");
  if (!ok) return DEFAULT_TEAM;
  if (!data || data.length === 0) {
    // First run ever: seed the table with the full default roster.
    await sbFetch("team_members", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(DEFAULT_TEAM.map((m) => ({ id: m.id, name: m.name, role: m.role, pin: m.pin, permissions: m.permissions }))),
    });
    return DEFAULT_TEAM;
  }
  // Table already has real data (PINs already set, etc.) — only add
  // brand-new default members that don't exist yet (e.g. Fakher, added
  // after go-live), never overwrite or duplicate existing ones.
  const existingIds = new Set(data.map((m) => m.id));
  const missing = DEFAULT_TEAM.filter((m) => !existingIds.has(m.id));
  if (missing.length) {
    await sbFetch("team_members", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(missing.map((m) => ({ id: m.id, name: m.name, role: m.role, pin: m.pin, permissions: m.permissions }))),
    });
    return [...data.map((m) => ({ id: m.id, name: m.name, role: m.role, pin: m.pin, permissions: m.permissions || {} })), ...missing];
  }
  return data.map((m) => ({ id: m.id, name: m.name, role: m.role, pin: m.pin, permissions: m.permissions || {} }));
}
async function saveTeam(team) {
  const { ok } = await sbFetch("team_members?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(team.map((m) => ({ id: m.id, name: m.name, role: m.role, pin: m.pin, permissions: m.permissions || {}, updated_at: new Date().toISOString() }))),
  });
  return ok;
}

/* ---------------- Services & Roles (admin-editable, DB-backed) ----------------
   Loads service_roles / service_categories / service_treatments from
   Supabase and reshapes them into the exact ROLE_DEFS / SERVICES shape the
   rest of the app already expects, then reassigns those two `let`
   module-level variables in place. Every existing ROLE_DEFS[...] /
   SERVICES.filter(...) call site elsewhere in the file needs zero changes.

   Retiring a category or treatment only hides it from NEW job/quote
   pickers (see visibleServices() below) — old jobs/quotes store the
   service `key` and treatment `name` as plain text, not an array index or
   foreign key, so they keep displaying correctly forever even after the
   thing they used is retired. This was a deliberate, confirmed decision. */
async function loadDynamicServicesAndRoles() {
  const [rolesRes, catsRes, treatsRes] = await Promise.all([
    sbFetch("service_roles?select=*&order=sort_order.asc"),
    sbFetch("service_categories?select=*&order=sort_order.asc"),
    sbFetch("service_treatments?select=*&order=sort_order.asc"),
  ]);

  // Safety: never overwrite good in-memory defaults with nothing just
  // because a fetch failed or the tables are still empty (e.g. migration
  // not run yet) — the hardcoded fallback keeps the app fully usable.
  if (!rolesRes.ok || !catsRes.ok || !treatsRes.ok) return false;
  if (!rolesRes.data?.length || !catsRes.data?.length) return false;

  const nextRoleDefs = {};
  for (const r of rolesRes.data) {
    nextRoleDefs[r.id] = { label: r.label, color: r.color, simplified: !!r.simplified, active: r.active !== false };
  }

  const treatsByCategory = {};
  for (const t of treatsRes.data || []) {
    (treatsByCategory[t.category_key] ||= []).push({ name: t.name, retail: t.retail, b2b: t.b2b, active: t.active !== false, id: t.id });
  }

  const nextServices = catsRes.data.map((c) => ({
    key: c.id,
    label: c.label,
    role: c.role,
    reviewerRole: c.reviewer_role || undefined,
    reviewerNote: c.reviewer_note || undefined,
    active: c.active !== false,
    treatments: treatsByCategory[c.id] || [],
  }));

  ROLE_DEFS = nextRoleDefs;
  SERVICES = nextServices;
  VALID_SERVICE_KEYS = new Set(SERVICES.map((s) => s.key));
  return true;
}

// Used by every "select services" picker (new/edit job, new/edit quote) —
// shows active categories, plus anything already picked on this
// job/quote even if it has since been retired, so an in-progress
// selection never silently loses an item out from under the user.
function visibleServices(selectedKeys) {
  const sel = new Set(selectedKeys || []);
  return SERVICES.filter((s) => s.active !== false || sel.has(s.key));
}

/* ---------------- App settings (generic key/value, e.g. WhatsApp templates) ---------------- */
// Same shape as everything else in this file that needs to be editable
// without a redeploy — one small table, read on boot, written through
// the gatekeeper, cached in a mutable module-level global so any
// component (e.g. the wa.me link deep inside JobDetail) can read the
// current value without prop-drilling it through the whole tree.
const DEFAULT_WHATSAPP_TEMPLATES = {
  ready_for_collection: "Hi {customerName}, your {makeModel} ({plate}) is ready for collection at Mr.CAP. Thank you! Track it anytime: {trackingLink}",
  job_started: "Hi {customerName}, we've received your {makeModel} ({plate}) at Mr.CAP and work is underway. Track progress here: {trackingLink}",
  quote_sent: "Hi {customerName}, here's your quote from Mr.CAP for your {makeModel} ({plate}): AED {total}. View and accept it here: {quoteLink}",
  follow_up: "Hi {customerName}, just checking in on your {makeModel} ({plate}) — {reason}. Let us know if you'd like to book it in with Mr.CAP.",
  warranty_reminder: "Hi {customerName}, a friendly reminder that the warranty on your {makeModel} ({plate}) work with Mr.CAP expires on {expiryDate}. Reach out if you'd like it looked at before then.",
  google_review: "Hi {customerName}, thank you for trusting Mr.CAP with your {makeModel}! If you had a great experience, we'd really appreciate a quick Google review: {reviewLink}",
};
let WHATSAPP_TEMPLATES = { ...DEFAULT_WHATSAPP_TEMPLATES };
let GOOGLE_REVIEW_LINK = "";
let PILOT_BASELINE = null; // { date, revenue, jobCount, collectedCount } | null

async function loadAppSettings() {
  const { ok, data } = await sbFetch("app_settings?select=*");
  if (!ok || !data) return;
  const templatesRow = data.find((r) => r.key === "whatsapp_templates");
  if (templatesRow?.value) {
    try {
      WHATSAPP_TEMPLATES = { ...DEFAULT_WHATSAPP_TEMPLATES, ...JSON.parse(templatesRow.value) };
    } catch { /* keep defaults if stored value is somehow malformed */ }
  }
  const reviewRow = data.find((r) => r.key === "google_review_link");
  if (reviewRow?.value) GOOGLE_REVIEW_LINK = reviewRow.value;
  const baselineRow = data.find((r) => r.key === "pilot_baseline");
  if (baselineRow?.value) {
    try { PILOT_BASELINE = JSON.parse(baselineRow.value); } catch { /* leave null */ }
  }
}

async function savePilotBaseline(baseline, session) {
  const { ok } = await sbFetch("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: "pilot_baseline", value: JSON.stringify(baseline), updated_by: session?.id || null, updated_at: new Date().toISOString() }]),
  });
  if (ok) PILOT_BASELINE = baseline;
  return ok;
}

async function saveWhatsAppTemplates(templates, session) {
  const { ok } = await sbFetch("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: "whatsapp_templates", value: JSON.stringify(templates), updated_by: session?.id || null, updated_at: new Date().toISOString() }]),
  });
  if (ok) WHATSAPP_TEMPLATES = { ...DEFAULT_WHATSAPP_TEMPLATES, ...templates };
  return ok;
}

async function saveGoogleReviewLink(link, session) {
  const { ok } = await sbFetch("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: "google_review_link", value: link, updated_by: session?.id || null, updated_at: new Date().toISOString() }]),
  });
  if (ok) GOOGLE_REVIEW_LINK = link;
  return ok;
}

// {token} substitution — unknown tokens resolve to empty string rather
// than being left in the message, so a typo'd token silently disappears
// instead of getting sent to a real customer verbatim.
function renderTemplate(str, vars) {
  return (str || "").replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ""));
}

// Shared WhatsApp send button — every new send point (job intake, quote
// sent, follow-up, warranty reminder) reuses this instead of repeating
// the wa.me/encodeURIComponent boilerplate at each call site.
function WhatsAppSendButton({ phone, templateKey, vars, label, small }) {
  if (!phone) return null;
  const text = renderTemplate(WHATSAPP_TEMPLATES[templateKey], vars);
  return (
    <a
      href={`https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(text)}`}
      target="_blank" rel="noopener noreferrer"
      className="mrcap-press"
      style={small
        ? { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: "none", background: "#25D366", color: "#0D2A17", fontWeight: 700, fontSize: 11, cursor: "pointer", textDecoration: "none", flexShrink: 0 }
        : { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#25D366", color: "#0D2A17", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12, textDecoration: "none" }}
      onClick={(e) => e.stopPropagation()}
    >
      <Send size={small ? 12 : 15} /> {label}
    </a>
  );
}

async function saveServiceRole(role) {
  // role: { id, label, color, simplified, sort_order, active }
  const { ok } = await sbFetch("service_roles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ ...role, updated_at: new Date().toISOString() }]),
  });
  if (ok) await loadDynamicServicesAndRoles();
  return ok;
}

async function saveServiceCategory(cat) {
  // cat: { id, label, role, reviewer_role, reviewer_note, sort_order, active }
  const { ok } = await sbFetch("service_categories?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ ...cat, updated_at: new Date().toISOString() }]),
  });
  if (ok) await loadDynamicServicesAndRoles();
  return ok;
}

async function setServiceCategoryActive(id, active) {
  const { ok } = await sbFetch(`service_categories?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ active, updated_at: new Date().toISOString() }),
  });
  if (ok) await loadDynamicServicesAndRoles();
  return ok;
}

async function saveServiceTreatment(treatment) {
  // treatment: { id?, category_key, name, retail, b2b, sort_order, active }
  const isNew = !treatment.id;
  const { ok } = await sbFetch(isNew ? "service_treatments" : `service_treatments?id=eq.${encodeURIComponent(treatment.id)}`, {
    method: isNew ? "POST" : "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isNew
      ? [{ category_key: treatment.category_key, name: treatment.name, retail: treatment.retail, b2b: treatment.b2b, sort_order: treatment.sort_order ?? 0, active: true }]
      : { name: treatment.name, retail: treatment.retail, b2b: treatment.b2b, updated_at: new Date().toISOString() }),
  });
  if (ok) await loadDynamicServicesAndRoles();
  return ok;
}

async function setServiceTreatmentActive(id, active) {
  const { ok } = await sbFetch(`service_treatments?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ active, updated_at: new Date().toISOString() }),
  });
  if (ok) await loadDynamicServicesAndRoles();
  return ok;
}

// For the Services admin screen only — fetches EVERYTHING including
// retired items, so admins can see and un-retire things. The app's
// normal SERVICES/ROLE_DEFS (used everywhere else) always come from
// loadDynamicServicesAndRoles() above, which is the same data, just
// reshaped; this fetch is separate so the admin screen can show retired
// rows without changing what the rest of the app treats as "current".
async function loadAllServiceData() {
  const [rolesRes, catsRes, treatsRes] = await Promise.all([
    sbFetch("service_roles?select=*&order=sort_order.asc"),
    sbFetch("service_categories?select=*&order=sort_order.asc"),
    sbFetch("service_treatments?select=*&order=sort_order.asc"),
  ]);
  return {
    roles: rolesRes.ok ? (rolesRes.data || []) : [],
    categories: catsRes.ok ? (catsRes.data || []) : [],
    treatments: treatsRes.ok ? (treatsRes.data || []) : [],
  };
}

/* ---------------- Customers & Vehicles (CRM layer) ---------------- */
// Finds an existing customer by phone (or exact name if no phone given),
// or creates a new one — called on job creation so history links up
// automatically without asking the intake person to manage IDs.
async function findOrCreateCustomer(name, phone, customerType) {
  if (phone && phone.trim()) {
    const { ok, data } = await sbFetch(`customers?phone=eq.${encodeURIComponent(phone.trim())}&select=*&limit=1`);
    if (ok && data && data.length) return data[0];
  }
  const { ok: created, data } = await sbFetch("customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ name: name.trim(), phone: phone ? phone.trim() : null, customer_type: customerType === "b2b" ? "b2b" : "walkin" }]),
  });
  return created && data ? data[0] : null;
}
async function findOrCreateVehicle(customerId, plate, makeModel) {
  const { ok, data } = await sbFetch(`vehicles?plate=eq.${encodeURIComponent(plate)}&select=*&limit=1`);
  if (ok && data && data.length) {
    // Ownership is only ever changed when the person at intake has
    // explicitly confirmed it (via the "different owner now" choice in the
    // form) — never silently, since a typo'd plate could otherwise
    // reassign someone else's car without anyone noticing.
    return data[0];
  }
  const { ok: created, data: createdData } = await sbFetch("vehicles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ customer_id: customerId, plate, make_model: makeModel }]),
  });
  return created && createdData ? createdData[0] : null;
}
async function reassignVehicleOwner(vehicleId, customerId) {
  const { ok } = await sbFetch(`vehicles?id=eq.${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify({ customer_id: customerId, updated_at: new Date().toISOString() }),
  });
  return ok;
}
async function searchCustomers(query) {
  const q = encodeURIComponent(`%${query}%`);
  const { ok, data } = await sbFetch(`customers?or=(name.ilike.${q},phone.ilike.${q})&select=*&order=name.asc&limit=50`);
  return ok && data ? data : [];
}
async function loadCustomerHistory(customerId) {
  const [vehiclesRes, jobsRes] = await Promise.all([
    sbFetch(`vehicles?customer_id=eq.${customerId}&select=*`),
    sbFetch(`jobs?customer_id=eq.${customerId}&select=*&order=created_at.desc`),
  ]);
  return {
    vehicles: vehiclesRes.ok && vehiclesRes.data ? vehiclesRes.data : [],
    jobs: jobsRes.ok && jobsRes.data ? jobsRes.data.map(rowToJob) : [],
  };
}

/* ---------------- Jobs ---------------- */
// Converts a Supabase row (snake_case, flat) into the app's job shape
// (camelCase, nested photos/history) so the rest of the app is unchanged.
function rowToJob(r) {
  return {
    id: r.id, customerId: r.customer_id, vehicleId: r.vehicle_id,
    plate: r.plate, makeModel: r.make_model, customerName: r.customer_name, customerPhone: r.customer_phone,
    description: r.description, damageNotes: r.damage_notes, priority: r.priority, location: r.location,
    serviceTypes: r.service_types || [], serviceDone: r.service_done || {}, assignedTo: r.assigned_to || {},
    serviceNotes: r.service_notes || {}, serviceReviewed: r.service_reviewed || {}, treatments: r.treatments || {},
    treatmentPrices: r.treatment_prices || {}, discountPercent: r.discount_percent || 0, priceHistory: r.price_history || [],
    parts: r.parts || [], markupEntries: r.markup_entries || [],
    stageIndex: r.stage_index, photos: r.photos || { intake: [], parts_removal: [], service: {} },
    startTime: r.start_time ? new Date(r.start_time).getTime() : null,
    stopTime: r.stop_time ? new Date(r.stop_time).getTime() : null,
    invoiceAmount: r.invoice_amount, invoiceNo: r.invoice_no, signature: r.signature, signedAt: r.signed_at ? new Date(r.signed_at).getTime() : null,
    damagePanels: r.damage_panels || [], damageDiagramImage: r.damage_diagram_image, history: r.history || [],
    onHold: !!r.on_hold, onHoldNote: r.on_hold_note || null, onHoldSince: r.on_hold_since ? new Date(r.on_hold_since).getTime() : null,
    warrantyExpiry: r.warranty_expiry || null, followupDate: r.followup_date || null, followupNote: r.followup_note || null,
    customerStatusNote: r.customer_status_note || null, customerStatusUpdatedAt: r.customer_status_updated_at ? new Date(r.customer_status_updated_at).getTime() : null,
    createdBy: r.created_by, createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(),
  };
}
function jobToRow(job) {
  return {
    id: job.id, customer_id: job.customerId || null, vehicle_id: job.vehicleId || null,
    plate: job.plate, make_model: job.makeModel, customer_name: job.customerName, customer_phone: job.customerPhone,
    description: job.description, damage_notes: job.damageNotes, priority: job.priority, location: job.location,
    service_types: job.serviceTypes || [], service_done: job.serviceDone || {}, assigned_to: job.assignedTo || {},
    service_notes: job.serviceNotes || {}, service_reviewed: job.serviceReviewed || {}, treatments: job.treatments || {},
    treatment_prices: job.treatmentPrices || {}, discount_percent: job.discountPercent || 0, price_history: job.priceHistory || [],
    parts: job.parts || [], markup_entries: job.markupEntries || [],
    stage_index: job.stageIndex, photos: job.photos,
    start_time: job.startTime ? new Date(job.startTime).toISOString() : null,
    stop_time: job.stopTime ? new Date(job.stopTime).toISOString() : null,
    invoice_amount: job.invoiceAmount || null, invoice_no: job.invoiceNo || null,
    signature: job.signature || null, signed_at: job.signedAt ? new Date(job.signedAt).toISOString() : null,
    damage_panels: job.damagePanels || [], damage_diagram_image: job.damageDiagramImage || null, history: job.history,
    on_hold: !!job.onHold, on_hold_note: job.onHoldNote || null, on_hold_since: job.onHoldSince ? new Date(job.onHoldSince).toISOString() : null,
    warranty_expiry: job.warrantyExpiry || null, followup_date: job.followupDate || null, followup_note: job.followupNote || null,
    customer_status_note: job.customerStatusNote || null, customer_status_updated_at: job.customerStatusUpdatedAt ? new Date(job.customerStatusUpdatedAt).toISOString() : null,
    created_by: job.createdBy, updated_at: new Date().toISOString(),
  };
}
/* ---------------- device-local session (which login this phone remembers) ---------------- */
// Not shared/business data — just "who's logged in on this device" — so a
// plain localStorage read/write is the right tool, not a Supabase round-trip.
function loadLocalSession() {
  try {
    const raw = window.localStorage.getItem("mrcap_session");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveLocalSession(session) {
  try {
    if (session) window.localStorage.setItem("mrcap_session", JSON.stringify(session));
    else window.localStorage.removeItem("mrcap_session");
  } catch (e) { /* ignore — worst case, they log in again next visit */ }
}

// "New since I last opened" tracking — keyed per person (not per device),
// so it's a genuine "what's happened since I checked" signal rather than
// tied to a specific phone. Local only; not worth a Supabase round-trip
// for a lightweight badge.
function getLastSeen(memberId) {
  try {
    const raw = window.localStorage.getItem(`mrcap_lastseen_${memberId}`);
    return raw ? Number(raw) : 0;
  } catch (e) {
    return 0;
  }
}
function setLastSeen(memberId, ts) {
  try {
    window.localStorage.setItem(`mrcap_lastseen_${memberId}`, String(ts));
  } catch (e) { /* ignore */ }
}

/* ---------------- Tax Invoice PDF (real Z Cars Technologies format) ---------------- */
// Matches the shop's actual FirstBIT-generated tax invoice exactly:
// issuer block (Z Cars Technologies + bank details), Bill To, Car Info,
// a real VAT line-item table (Qty/UOM/Price/Discount/Amount/VAT%/VAT
// Amount/Total), and totals. One line per treatment picked on the job —
// same treatments already tracked, now formatted as real invoice rows.
const INVOICE_ISSUER = {
  name: "Z Cars Technologies",
  department: "Z Cars Technologies (Branch)",
  address: "Warehouse 2, Plot no -2051-0, Nad Al Hamar, Dubai, UAE",
  tel: "04-2886550",
  trn: "100309311700003",
  bankName: "Emirates ENBD",
  iban: "AE240260001014220307001",
  swift: "EBILAEAD",
  beneficiary: "Z Cars Technologies",
};
const VAT_RATE = 0.05;

function numberToWordsAED(n) {
  // Minimal English number-to-words for the "TOTAL OF SUPPLY" line, AED
  // only (no fils spelled out) — matches the reference invoice's style
  // ("Three thousand eight hundred eighty five AED ONLY").
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const chunk = (num) => {
    let s = "";
    if (num >= 100) { s += ones[Math.floor(num / 100)] + " Hundred "; num %= 100; }
    if (num >= 20) { s += tens[Math.floor(num / 10)] + " "; num %= 10; }
    if (num > 0) s += ones[num] + " ";
    return s.trim();
  };
  const whole = Math.round(n);
  if (whole === 0) return "Zero AED ONLY";
  let words = "";
  const thousands = Math.floor(whole / 1000);
  const rest = whole % 1000;
  if (thousands) words += chunk(thousands) + " Thousand ";
  if (rest) words += chunk(rest);
  return `${words.trim()} AED ONLY`;
}

function generateJobCardPDF(job) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  let y = 82;
  const DARK = [20, 20, 20], GREY = [110, 110, 110], LINE = [180, 180, 180];

  const box = (x, bw, bh) => { doc.setDrawColor(...LINE); doc.rect(x, y, bw, bh); };
  const label = (text, x, ty) => { doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...GREY); doc.text(text, x, ty); };
  const value = (text, x, ty, size = 10) => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...DARK); doc.text(String(text || ""), x, ty); };

  drawLetterheadBanner(doc, pageW, margin);

  // ---- Logo header — Mr.CAP branding visible on every invoice, matching
  // the shop's own physical job card, so clients recognize it immediately.
  try { doc.addImage(LOGO_SRC, "PNG", margin, y, 31, 42); } catch (e) { /* logo optional — never block the PDF over an image error */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...DARK);
  doc.text("Mr.CAP", margin + 50, y + 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("The Car Appearance & Restyling Experts", margin + 50, y + 30);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...DARK);
  doc.text("TAX INVOICE", pageW - margin, y + 22, { align: "right" });
  y += 56;

  // ---- Issued By / Bank Details header block ----
  const headerH = 90;
  box(margin, pageW - margin * 2, headerH);
  const midX = margin + (pageW - margin * 2) / 2;
  doc.setDrawColor(...LINE);
  doc.line(midX, y, midX, y + headerH);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text("Issued By:", margin + 8, y + 14);
  label("Department:", margin + 8, y + 28); value(INVOICE_ISSUER.department, margin + 70, y + 28, 8.5);
  label("Address:", margin + 8, y + 42);
  const addrLines = doc.splitTextToSize(INVOICE_ISSUER.address, midX - margin - 78);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...DARK);
  doc.text(addrLines, margin + 70, y + 42);
  label("Tel:", margin + 8, y + 42 + addrLines.length * 10 + 8); value(INVOICE_ISSUER.tel, margin + 70, y + 42 + addrLines.length * 10 + 8, 8.5);
  label("TRN:", margin + 8, y + 42 + addrLines.length * 10 + 20); value(INVOICE_ISSUER.trn, margin + 70, y + 42 + addrLines.length * 10 + 20, 8.5);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text("Bank Details:", midX + 8, y + 14);
  label(INVOICE_ISSUER.bankName, midX + 8, y + 28);
  label("IBAN:", midX + 8, y + 42); value(INVOICE_ISSUER.iban, midX + 45, y + 42, 8);
  label("SWIFT:", midX + 8, y + 56); value(INVOICE_ISSUER.swift, midX + 50, y + 56, 8.5);
  label("Beneficiary:", midX + 8, y + 70); value(INVOICE_ISSUER.beneficiary, midX + 65, y + 70, 8.5);

  y += headerH + 4;

  // ---- Bill To / Car Info block ----
  const billH = 90;
  box(margin, pageW - margin * 2, billH);
  doc.line(midX, y, midX, y + billH);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text("Bill To:", margin + 8, y + 14);
  value(job.customerName, margin + 8, y + 28, 10);
  label("Tel.:", margin + 8, y + 44); value(job.customerPhone, margin + 45, y + 44, 8.5);
  label("Payment Terms:", margin + 8, y + 78); value("Payment on Delivery", margin + 100, y + 78, 8.5);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text("Car Info", midX + 8, y + 14);
  const carRows = [["Make:", (job.makeModel || "").split(" ")[0] || ""], ["Model:", (job.makeModel || "").split(" ").slice(1).join(" ") || ""], ["Plate:", job.plate], ["Job Card:", job.id ? job.id.slice(0, 8).toUpperCase() : ""]];
  carRows.forEach((row, i) => { label(row[0], midX + 8, y + 30 + i * 14); value(row[1], midX + 60, y + 30 + i * 14, 8.5); });

  y += billH + 14;

  // ---- Line items table ----
  const activeServices = SERVICES.filter((s) => (job.serviceTypes || []).includes(s.key));
  const rows = [];
  activeServices.forEach((s) => {
    const picks = (job.treatments || {})[s.key] || [];
    picks.forEach((name) => {
      const priceKey = `${s.key}::${name}`;
      const price = Number((job.treatmentPrices || {})[priceKey]) || 0;
      const discountPct = job.discountPercent || 0;
      const excl = price;
      const amountExcl = excl * (1 - discountPct / 100);
      const vatAmount = amountExcl * VAT_RATE;
      rows.push({ desc: name, qty: 1, price: excl, discount: discountPct, amountExcl, vatAmount, amountIncl: amountExcl + vatAmount });
    });
  });
  // External parts and fees (windshields, rims, off-road lights, a tow
  // truck recovery fee, etc.) get their own line, own quantity, and their
  // own optional per-line discount — matching how the shop's existing
  // First Bit invoices break these out, separate from the job's overall
  // service discount.
  (job.parts || []).forEach((p) => {
    const qty = Number(p.qty) || 1;
    const price = Number(p.price) || 0;
    const discountPct = Number(p.discountPercent) || 0;
    const excl = price * qty;
    const amountExcl = excl * (1 - discountPct / 100);
    const vatAmount = amountExcl * VAT_RATE;
    rows.push({ desc: p.description || (p.type === "fee" ? "Fee" : "Part"), qty, price, discount: discountPct, amountExcl, vatAmount, amountIncl: amountExcl + vatAmount });
  });

  const colX = [margin, margin + 22, margin + 200, margin + 232, margin + 262, margin + 335, margin + 400, margin + 425, margin + 470];
  const tableRight = pageW - margin;
  const headerRowH = 26;
  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y, tableRight - margin, headerRowH, "F");
  doc.setDrawColor(...LINE);
  doc.rect(margin, y, tableRight - margin, headerRowH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...DARK);
  const headers = ["#", "Description", "Qty", "UOM", "Price\n(Excl.VAT)", "Disc.\n%", "Amount\n(Excl.VAT)", "VAT\n%", "Total\n(Incl.VAT)"];
  const colPositions = [margin + 4, margin + 26, margin + 205, margin + 235, margin + 270, margin + 345, margin + 385, margin + 445, margin + 470];
  headers.forEach((h, i) => { const lines = h.split("\n"); doc.text(lines, colPositions[i], y + 10); });
  y += headerRowH;

  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  let subtotal = 0, totalDiscount = 0, totalVat = 0;
  rows.forEach((r, i) => {
    const rowH = 18;
    if (y + rowH > 780) { doc.addPage(); y = 40; }
    doc.setDrawColor(...LINE);
    doc.rect(margin, y, tableRight - margin, rowH);
    doc.setTextColor(...DARK);
    doc.text(String(i + 1), margin + 6, y + 12);
    const descLines = doc.splitTextToSize(r.desc, 165);
    doc.text(descLines[0], margin + 26, y + 12);
    doc.text(Number(r.qty || 1).toFixed(3), margin + 205, y + 12);
    doc.text("Pcs", margin + 235, y + 12);
    doc.text(r.price.toFixed(2), margin + 270, y + 12);
    doc.text(r.discount.toFixed(2), margin + 350, y + 12);
    doc.text(r.amountExcl.toFixed(2), margin + 385, y + 12);
    doc.text("5", margin + 452, y + 12);
    doc.text(r.amountIncl.toFixed(2), margin + 470, y + 12);
    subtotal += r.amountExcl;
    totalDiscount += r.price - r.amountExcl;
    totalVat += r.vatAmount;
    y += rowH;
  });

  const grandTotal = subtotal + totalVat;

  y += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...DARK);
  const wordsLines = doc.splitTextToSize(`TOTAL OF SUPPLY: ${numberToWordsAED(grandTotal)}`, 300);
  doc.text(wordsLines, margin, y);

  const totalsX = pageW - margin - 170;
  let ty = y - 4;
  const totalLine = (lbl, val, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(lbl, totalsX, ty);
    doc.text(val, pageW - margin, ty, { align: "right" });
    ty += 15;
  };
  totalLine("Total Discount, AED", totalDiscount.toFixed(2));
  totalLine("Sub Total, AED", subtotal.toFixed(2));
  totalLine("Total VAT, AED", totalVat.toFixed(2));
  totalLine("Total, AED", grandTotal.toFixed(2), true);

  y += Math.max(wordsLines.length * 11, 60) + 20;

  y = Math.max(y, 660);
  // Real captured signature, if there is one — placed above the
  // "Received By" line it corresponds to, rather than just a blank line.
  if (job.signature) {
    try { doc.addImage(job.signature, "PNG", pageW - margin - 175, y - 55, 170, 50); } catch (e) { /* signature optional if it fails to embed */ }
  }
  doc.setDrawColor(...LINE);
  doc.line(margin, y, margin + 180, y);
  doc.text("Released By", margin, y + 14);
  doc.line(pageW - margin - 180, y, pageW - margin, y);
  doc.text("Received By", pageW - margin - 180, y + 14);
  if (job.signature && job.signedAt) {
    doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text(`Signed ${new Date(job.signedAt).toLocaleString()}`, pageW - margin - 180, y + 24);
  }

  // Terms & Conditions on their own page(s), with real pagination — the
  // full text is long (real UAE service-shop terms, not a placeholder)
  // and previously would have run straight off the bottom of the first
  // page. Line-by-line height checking here, not a fixed guess.
  doc.addPage();
  let termsY = 40;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...DARK);
  doc.text("Terms and Conditions", margin, termsY);
  termsY += 22;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
  const termsLines = doc.splitTextToSize(TERMS_AND_CONDITIONS_TEXT, pageW - margin * 2);
  const lineHeight = 11;
  const pageBottom = 800;
  termsLines.forEach((line) => {
    if (termsY > pageBottom) { doc.addPage(); termsY = 40; }
    doc.text(line, margin, termsY);
    termsY += lineHeight;
  });

  return doc;
}

// Same visual language as the tax invoice, but clearly marked as a
// Quotation (not a tax document — no VAT collected on a proposal that
// hasn't been accepted), with prices shown but no signature lines since
// nothing has happened yet.
function generateQuotePDF(quote) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 86;

  drawLetterheadBanner(doc, pageW, margin);

  try { doc.addImage(LOGO_SRC, "PNG", margin, y, 37, 50); } catch (e) { /* logo optional */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(20);
  doc.text("Mr.CAP", margin + 60, y + 22);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text("The Car Appearance & Restyling Experts", margin + 60, y + 36);
  doc.setFontSize(8);
  doc.text("Al Hammar, Dubai", margin + 60, y + 48);

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(20);
  doc.text("QUOTATION", pageW - margin, y + 18, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`No. ${quote.id ? quote.id.slice(0, 8).toUpperCase() : ""}`, pageW - margin, y + 32, { align: "right" });
  doc.text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`, pageW - margin, y + 44, { align: "right" });
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(180, 130, 30);
  doc.text("Not a tax invoice — prices subject to confirmation", pageW - margin, y + 56, { align: "right" });

  y += 78;
  doc.setDrawColor(180); doc.line(margin, y, pageW - margin, y);
  y += 20;

  const field = (label, value, x) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(20);
    doc.text(String(value || "—"), x, y + 14);
  };
  const colW = (pageW - margin * 2) / 2;
  field("CUSTOMER", quote.customerName, margin);
  field("PHONE", quote.customerPhone, margin + colW);
  y += 32;
  field("PLATE", quote.plate || "—", margin);
  field("VEHICLE", quote.makeModel, margin + colW);
  y += 40;

  doc.setDrawColor(180); doc.line(margin, y, pageW - margin, y);
  y += 20;

  if (quote.description) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20);
    doc.text("Requested work:", margin, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(quote.description, pageW - margin * 2 - 100);
    doc.text(lines, margin + 100, y);
    y += lines.length * 12 + 16;
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
  doc.text("Proposed Services", margin, y);
  y += 8;
  doc.setDrawColor(200, 160, 40); doc.setLineWidth(1.5);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(1);
  y += 20;

  const activeServices = SERVICES.filter((s) => (quote.serviceTypes || []).includes(s.key));
  let total = 0;
  activeServices.forEach((s) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text(s.label, margin, y);
    y += 4;
    const picks = (quote.treatments || {})[s.key] || [];
    picks.forEach((name) => {
      y += 14;
      const price = (quote.treatmentPrices || {})[`${s.key}::${name}`];
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40);
      doc.text(`•  ${name}`, margin + 10, y);
      if (price) { doc.text(`AED ${Number(price).toLocaleString()}`, pageW - margin, y, { align: "right" }); total += Number(price) || 0; }
    });
    y += 16;
  });

  // Parts & fees — same idea as the job invoice's separate rows, each
  // with its own qty and optional per-line discount, distinct from the
  // overall services discount above.
  const quoteParts = quote.parts || [];
  let partsTotal = 0;
  if (quoteParts.length) {
    y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
    doc.text("Parts & Fees", margin, y);
    y += 8;
    doc.setDrawColor(200, 160, 40); doc.setLineWidth(1.5);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineWidth(1);
    y += 20;
    quoteParts.forEach((p) => {
      const qty = Number(p.qty) || 1;
      const price = Number(p.price) || 0;
      const discountPct = Number(p.discountPercent) || 0;
      const lineTotal = price * qty * (1 - discountPct / 100);
      partsTotal += lineTotal;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40);
      const label = `•  ${p.description || (p.type === "fee" ? "Fee" : "Part")}${qty > 1 ? ` (x${qty})` : ""}${discountPct > 0 ? ` — ${discountPct}% off` : ""}`;
      doc.text(label, margin + 10, y);
      doc.text(`AED ${Math.round(lineTotal).toLocaleString()}`, pageW - margin, y, { align: "right" });
      y += 14;
    });
    y += 8;
  }

  const grandTotal = total * (1 - (quote.discountPercent || 0) / 100) + partsTotal;
  if (total > 0 || partsTotal > 0) {
    doc.setDrawColor(180); doc.line(margin, y, pageW - margin, y);
    y += 18;
    const discount = quote.discountPercent || 0;
    if (discount > 0 && total > 0) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(80);
      doc.text("Services Subtotal", margin, y); doc.text(`AED ${total.toLocaleString()}`, pageW - margin, y, { align: "right" });
      y += 14;
      doc.text(`Discount (${discount}%)`, margin, y); doc.text(`- AED ${Math.round(total * discount / 100).toLocaleString()}`, pageW - margin, y, { align: "right" });
      y += 16;
    }
    if (partsTotal > 0) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(80);
      doc.text("Parts & Fees", margin, y); doc.text(`AED ${Math.round(partsTotal).toLocaleString()}`, pageW - margin, y, { align: "right" });
      y += 16;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20);
    doc.text("Estimated Total", margin, y);
    doc.text(`AED ${Math.round(grandTotal).toLocaleString()}`, pageW - margin, y, { align: "right" });
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(150);
  doc.text("Mr.CAP — The Car Appearance & Restyling Experts — Al Hammar, Dubai", margin, 812);
  return doc;
}

function summaryOf(job) {
  const stage = STAGES[job.stageIndex];
  return {
    id: job.id, plate: job.plate, makeModel: job.makeModel, customerName: job.customerName, customerPhone: job.customerPhone,
    priority: job.priority, location: job.location, stageKey: stage.key, stageLabel: stage.label,
    onHold: !!job.onHold, onHoldNote: job.onHoldNote || null, onHoldSince: job.onHoldSince || null,
    followupDate: job.followupDate || null, followupNote: job.followupNote || null, warrantyExpiry: job.warrantyExpiry || null,
    updatedAt: job.updatedAt, createdAt: job.createdAt,
  };
}
async function loadIndex() {
  // 900, not 500 — Supabase's PostgREST hard-caps any single response at
  // 1000 rows server-side regardless of what's requested (the bug that
  // broke the Admin Dashboard earlier), so 900 is the most headroom
  // available while staying safely under that ceiling for a 3-month
  // pilot where job volume keeps climbing. Still ordered newest-first,
  // so the jobs that actually matter for the working list are never
  // the ones that would get dropped if this cap is ever hit.
  const { ok, data } = await sbFetch("jobs?select=id,plate,make_model,customer_name,customer_phone,priority,location,stage_index,service_types,service_done,service_reviewed,history,on_hold,on_hold_note,on_hold_since,followup_date,followup_note,warranty_expiry,created_at,updated_at&order=updated_at.desc&limit=900");
  if (!ok || !data) return [];
  return data.map((r) => {
    const stage = STAGES[r.stage_index] || STAGES[0];
    return {
      id: r.id, plate: r.plate, makeModel: r.make_model, customerName: r.customer_name, customerPhone: r.customer_phone,
      priority: r.priority, location: r.location, stageKey: stage.key, stageLabel: stage.label,
      serviceTypes: r.service_types || [], serviceDone: r.service_done || {}, serviceReviewed: r.service_reviewed || {},
      history: r.history || [],
      onHold: !!r.on_hold, onHoldNote: r.on_hold_note || null, onHoldSince: r.on_hold_since ? new Date(r.on_hold_since).getTime() : null,
      followupDate: r.followup_date || null, followupNote: r.followup_note || null, warrantyExpiry: r.warranty_expiry || null,
      updatedAt: new Date(r.updated_at).getTime(), createdAt: new Date(r.created_at).getTime(),
    };
  });
}
async function loadJob(id) {
  const { ok, data } = await sbFetch(`jobs?id=eq.${id}&select=*&limit=1`);
  if (!ok || !data || !data.length) return null;
  return rowToJob(data[0]);
}
// Creates a job: links/creates the customer + vehicle records first (this
// is what powers CRM history), then inserts the job with real foreign
// keys. Returns the job with its real database-assigned id attached.
/* ---------------- CSV import (historical data) ---------------- */
// A small, dependency-free CSV parser — handles quoted fields containing
// commas, which a naive split(",") would break on.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && next === "\n") i++;
        row.push(field); field = "";
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
    return obj;
  });
}

let VALID_SERVICE_KEYS = new Set(SERVICES.map((s) => s.key));
const VALID_LOCATIONS = new Set(LOCATIONS);
const VALID_PRIORITIES = new Set(PRIORITIES);

// Imports one CSV row as a fully-collected historical job. Reuses the same
// findOrCreateCustomer/findOrCreateVehicle matching the live app uses, so
// a customer already in the system (or appearing twice in the CSV itself)
// gets linked, not duplicated.
async function importRow(row, importedBy) {
  const name = (row.customer_name || "").trim();
  const plate = (row.plate || "").trim().toUpperCase();
  if (!name || !plate) return { ok: false, reason: "Missing customer name or plate", skipped: false };

  const invoiceNo = (row.invoice_no || "").trim();

  // Resume support: if this exact invoice was already imported in a
  // previous (possibly interrupted) run, skip it instead of creating a
  // duplicate job. Rows without an invoice number can't be de-duplicated
  // this way and will always be (re-)imported — that's a known limit,
  // not a silent gap, and it's surfaced in the results screen as "skipped".
  if (invoiceNo) {
    const { ok, data } = await sbFetch(`jobs?invoice_no=eq.${encodeURIComponent(invoiceNo)}&select=id&limit=1`);
    if (ok && data && data.length) {
      return { ok: true, reason: null, skipped: true };
    }
  }

  const phone = (row.customer_phone || "").trim();
  const serviceTypes = (row.service_types || "")
    .split(";").map((s) => s.trim()).filter((s) => VALID_SERVICE_KEYS.has(s));
  const priority = VALID_PRIORITIES.has(row.priority) ? row.priority : "Medium";
  const location = VALID_LOCATIONS.has(row.location) ? row.location : LOCATIONS[0];

  let jobDate = Date.now();
  if (row.job_date) {
    const parsed = new Date(row.job_date);
    if (!isNaN(parsed.getTime())) jobDate = parsed.getTime();
  }

  const collectedStageIndex = STAGES.length - 1; // "Collected" — historical, already done
  const serviceDone = {};
  serviceTypes.forEach((s) => { serviceDone[s] = true; });

  const job = {
    plate, makeModel: row.make_model || "",
    customerName: name, customerPhone: phone,
    description: row.description || "",
    damageNotes: row.damage_notes || "",
    priority, location, serviceTypes, serviceDone,
    assignedTo: {},
    stageIndex: collectedStageIndex,
    photos: { intake: [], parts_removal: [], service: {} },
    startTime: null, stopTime: null,
    invoiceAmount: row.total_aed || "",
    invoiceNo: invoiceNo || null,
    history: [
      { stage: "intake", label: "Intake", by: importedBy, role: "admin", note: `Imported from historical records${invoiceNo ? ` (Invoice ${invoiceNo})` : ""}`, at: jobDate },
      { stage: "collected", label: "Collected", by: importedBy, role: "admin", note: "Historical record", at: jobDate },
    ],
    createdAt: jobDate, updatedAt: jobDate, createdBy: importedBy,
  };

  const result = await createJob(job);
  return { ok: result.ok, reason: result.ok ? null : (lastStorageError || "Unknown error"), skipped: false };
}

/* ---------------- Quotations (fully parallel to jobs) ---------------- */
// Not a job — no stage tracking, no team assignment. Just a priced
// proposal that becomes a real job only via explicit conversion.
function rowToQuote(r) {
  return {
    id: r.id, customerId: r.customer_id, vehicleId: r.vehicle_id,
    plate: r.plate, makeModel: r.make_model, customerName: r.customer_name, customerPhone: r.customer_phone,
    description: r.description,
    serviceTypes: r.service_types || [], treatments: r.treatments || {}, treatmentPrices: r.treatment_prices || {},
    discountPercent: r.discount_percent || 0, parts: r.parts || [],
    status: r.status || "draft", convertedJobId: r.converted_job_id,
    acceptedAt: r.accepted_at ? new Date(r.accepted_at).getTime() : null,
    createdBy: r.created_by, createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(),
  };
}
function quoteToRow(q) {
  return {
    id: q.id, customer_id: q.customerId || null, vehicle_id: q.vehicleId || null,
    plate: q.plate || null, make_model: q.makeModel, customer_name: q.customerName, customer_phone: q.customerPhone,
    description: q.description,
    service_types: q.serviceTypes || [], treatments: q.treatments || {}, treatment_prices: q.treatmentPrices || {},
    discount_percent: q.discountPercent || 0, parts: q.parts || [],
    status: q.status || "draft", converted_job_id: q.convertedJobId || null,
    accepted_at: q.acceptedAt ? new Date(q.acceptedAt).toISOString() : null,
    created_by: q.createdBy, updated_at: new Date().toISOString(),
  };
}
async function loadQuoteIndex() {
  const { ok, data } = await sbFetch("quotes?select=id,plate,make_model,customer_name,status,created_at,updated_at&order=updated_at.desc&limit=500");
  if (!ok || !data) return [];
  return data.map((r) => ({
    id: r.id, plate: r.plate, makeModel: r.make_model, customerName: r.customer_name,
    status: r.status, updatedAt: new Date(r.updated_at).getTime(), createdAt: new Date(r.created_at).getTime(),
  }));
}
async function loadQuote(id) {
  const { ok, data } = await sbFetch(`quotes?id=eq.${id}&select=*&limit=1`);
  if (!ok || !data || !data.length) return null;
  return rowToQuote(data[0]);
}
async function createQuote(quote, customerType) {
  const customer = await findOrCreateCustomer(quote.customerName, quote.customerPhone, customerType);
  const vehicle = customer && quote.plate ? await findOrCreateVehicle(customer.id, quote.plate, quote.makeModel) : null;
  const withLinks = { ...quote, customerId: customer ? customer.id : null, vehicleId: vehicle ? vehicle.id : null };
  const row = quoteToRow(withLinks);
  delete row.id;
  const { ok, data } = await sbFetch("quotes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([row]),
  });
  if (ok && data && data.length) return { ok: true, quote: rowToQuote(data[0]) };
  return { ok: false, quote: withLinks };
}
async function saveQuote(quote) {
  const { ok } = await sbFetch(`quotes?id=eq.${quote.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(quoteToRow(quote)),
  });
  return ok;
}
async function deleteQuote(id) {
  const { ok } = await sbFetch(`quotes?id=eq.${id}`, { method: "DELETE" });
  return ok;
}
// One-tap conversion: builds a real job from the quote's customer/vehicle/
// services/prices, marks the quote "converted" and links it to the new
// job — the quote record stays as history, it doesn't disappear.
async function convertQuoteToJob(quote, session) {
  const now = Date.now();
  const serviceDone = {};
  const job = {
    plate: quote.plate || "", makeModel: quote.makeModel || "",
    customerName: quote.customerName, customerPhone: quote.customerPhone,
    description: quote.description || "", damageNotes: "",
    priority: "Medium", location: LOCATIONS[0],
    serviceTypes: quote.serviceTypes, treatments: quote.treatments,
    treatmentPrices: quote.treatmentPrices, discountPercent: quote.discountPercent, parts: quote.parts || [],
    serviceDone, assignedTo: {}, stageIndex: 0,
    photos: { intake: [], parts_removal: [], service: {} },
    startTime: null, stopTime: null, invoiceAmount: "",
    history: [{ stage: "intake", label: "Intake", by: session.name, role: session.role, note: `Converted from quote`, at: now }],
    createdAt: now, updatedAt: now, createdBy: session.name,
  };
  const result = await createJob(job);
  if (!result.ok || !result.job.id) return { ok: false };
  const updatedQuote = { ...quote, status: "converted", convertedJobId: result.job.id, updatedAt: now };
  await saveQuote(updatedQuote);
  return { ok: true, job: result.job, quote: updatedQuote };
}

async function createJob(job, { reassignVehicle = false, customerType = null } = {}) {
  const customer = await findOrCreateCustomer(job.customerName, job.customerPhone, customerType);
  const vehicle = customer ? await findOrCreateVehicle(customer.id, job.plate, job.makeModel) : null;
  // Ownership only changes here, explicitly, when intake staff confirmed
  // via the "New owner now" choice — never inferred automatically.
  if (vehicle && reassignVehicle && customer && vehicle.customer_id !== customer.id) {
    await reassignVehicleOwner(vehicle.id, customer.id);
  }
  const withLinks = { ...job, customerId: customer ? customer.id : null, vehicleId: vehicle ? vehicle.id : null };
  const row = jobToRow(withLinks);
  delete row.id; // let Postgres assign the real uuid
  const { ok, data } = await sbFetch("jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([row]),
  });
  if (ok && data && data.length) {
    return { ok: true, job: rowToJob(data[0]) };
  }
  return { ok: false, job: withLinks };
}
// Updates an existing job in place (stage advances, reassignment, etc).
async function saveJob(job) {
  const { ok } = await sbFetch(`jobs?id=eq.${job.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(jobToRow(job)),
  });
  return ok;
}

// Permanently deletes a job. Since the job row (and its own history log)
// disappears with it, the fact of the deletion is recorded in a SEPARATE
// table first — deletion_log — so "who deleted what, when" survives even
// though the job itself is gone, exactly as required.
async function deleteJob(job, deletedBy) {
  await sbFetch("deletion_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      job_id: job.id, plate: job.plate, customer_name: job.customerName,
      deleted_by: deletedBy.name, deleted_at: new Date().toISOString(),
    }]),
  });
  const { ok } = await sbFetch(`jobs?id=eq.${job.id}`, { method: "DELETE" });
  return ok;
}

/* ---------------- UI atoms ---------------- */
function Pill({ children, tone = "default", bg, fg }) {
  const tones = {
    default: { bg: COLORS.panel2, fg: COLORS.ink },
    yellow: { bg: "rgba(201,162,39,0.18)", fg: COLORS.gold },
    green: { bg: "rgba(74,122,87,0.22)", fg: "#7BC494" },
    red: { bg: "rgba(168,64,47,0.22)", fg: "#E08A78" },
    blue: { bg: "rgba(74,100,120,0.28)", fg: "#8FB4CC" },
    purple: { bg: "rgba(154,122,201,0.2)", fg: "#B79EE0" },
  };
  const t = bg ? { bg, fg } : (tones[tone] || tones.default);
  return (
    <span style={{ background: t.bg, color: t.fg, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: 0.3, padding: "4px 9px", borderRadius: 999, textTransform: "uppercase", whiteSpace: "nowrap", display: "inline-block" }}>
      {children}
    </span>
  );
}
function stageTone(k) {
  if (k === "collected") return "green";
  if (k === "qc") return "blue";
  if (k === "service") return "purple";
  return "yellow";
}
function priorityTone(p) { return p === "High" ? "red" : p === "Medium" ? "yellow" : "default"; }

const labelStyle = { fontSize: 12, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 };
const inputStyle = { width: "100%", marginTop: 8, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, background: COLORS.panel2, fontSize: 15, fontFamily: "Inter, sans-serif", boxSizing: "border-box", color: COLORS.ink };
const textareaStyle = { ...inputStyle, minHeight: 72, resize: "vertical" };
const primaryBtnStyle = { padding: "13px", borderRadius: 10, border: "none", background: COLORS.gold, color: COLORS.darkText, fontWeight: 700, fontSize: 14.5, cursor: "pointer" };
const secondaryBtnStyle = { padding: "13px", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, background: COLORS.panel2, color: COLORS.ink, fontWeight: 600, fontSize: 14.5, cursor: "pointer" };
const cameraBtnStyle = { display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9, border: `1.5px dashed ${COLORS.muted}`, background: "transparent", color: COLORS.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 };
const iconBtnStyle = { width: 36, height: 36, borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.panel2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };

const GLOBAL_STYLES = `
${FONT_IMPORT}
@keyframes mrcapFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mrcapFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes mrcapGoldSweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes mrcapDialSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes mrcapPulseRing {
  0% { box-shadow: 0 0 0 0 rgba(201,162,39,0.45); }
  100% { box-shadow: 0 0 0 14px rgba(201,162,39,0); }
}
@keyframes mrcapFlash {
  0% { background: ${COLORS.panel2}; }
  40% { background: rgba(201,162,39,0.28); }
  100% { background: ${COLORS.panel2}; }
}
.mrcap-view { animation: mrcapFadeUp 0.32s cubic-bezier(0.22,0.61,0.36,1) both; }
.mrcap-fade { animation: mrcapFadeIn 0.4s ease both; }
.mrcap-press { transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease; }
.mrcap-press:active { transform: scale(0.96); }
.mrcap-sweep {
  background: linear-gradient(100deg, transparent 40%, rgba(232,195,74,0.5) 50%, transparent 60%);
  background-size: 250% 100%;
  animation: mrcapGoldSweep 2.8s ease-in-out infinite;
}
.mrcap-card {
  transition: transform 0.22s cubic-bezier(0.22,0.61,0.36,1), background 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}
.mrcap-card:hover {
  transform: translateY(-2px);
  background: #1A1815;
  box-shadow: 0 14px 28px -14px rgba(0,0,0,0.55);
}
`;

function Shell({ children }) {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: COLORS.paper, minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", paddingTop: "env(safe-area-inset-top)", paddingBottom: 24 }}>
      <style>{GLOBAL_STYLES}</style>
      {children}
    </div>
  );
}

// Desktop "back office" shell — a persistent sidebar + wider content frame,
// used instead of the mobile single-column Shell when someone logged in
// with PC mode selected (admin/intake only — see LoginScreen). It wraps
// the exact same screens/components the mobile view uses (Dashboard,
// JobDetail, TeamScreen, etc.) — only the surrounding navigation chrome
// is different, so every existing screen keeps working unchanged.
function DesktopShell({ session, team, view, setView, onLogout, canArchive, children }) {
  const navItem = (key, label, Icon, onClick, permitted = true) => {
    if (!permitted) return null;
    const active = view === key || (key === "list" && view === "list");
    return (
      <button
        key={key}
        onClick={onClick}
        className="mrcap-press"
        style={{
          display: "flex", alignItems: "center", gap: 11, width: "100%",
          padding: "11px 14px", borderRadius: 9, border: "none", cursor: "pointer",
          background: active ? "rgba(201,162,39,0.14)" : "transparent",
          color: active ? COLORS.gold : "#B9BFC7",
          fontSize: 13.5, fontWeight: active ? 700 : 500, textAlign: "left",
        }}
      >
        <Icon size={16} />
        {label}
      </button>
    );
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: COLORS.paper, minHeight: "100vh", display: "flex" }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ width: 232, flexShrink: 0, background: "#15181C", minHeight: "100vh", display: "flex", flexDirection: "column", padding: "20px 12px", position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div style={{ padding: "6px 10px 22px" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 18, color: COLORS.gold, letterSpacing: 0.5 }}>Mr.CAP</div>
          <div style={{ fontSize: 10, color: "#7A828C", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Back Office</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          {navItem("list", "Dashboard", LayoutDashboard, () => setView("list"))}
          {navItem("customers", "Customers", Users, () => setView("customers"), hasPermission(session, team, "customers"))}
          {navItem("quotes", "Quotations", FileText, () => setView("quotes"), hasPermission(session, team, "quotations"))}
          {navItem("reports", "Reports", BarChart3, () => setView("reports"), hasPermission(session, team, "reports"))}
          {navItem("archive", "Archive", Archive, () => setView("archive"), canArchive)}
          {navItem("team", "Team", ShieldCheck, () => setView("team"), hasPermission(session, team, "team"))}
          {navItem("import", "Import Data", Upload, () => setView("import"), hasPermission(session, team, "import"))}
          {navItem("dispatch", "Dispatch Board", ListChecks, () => setView("dispatch"))}
          {navItem("admindash", "Admin Dashboard", TrendingUp, () => setView("admindash"), isSuperAdmin(session))}
          {navItem("msgtemplates", "WhatsApp Messages", MessageSquare, () => setView("msgtemplates"), isSuperAdmin(session))}
          {navItem("issues", "Issue Reports", AlertCircle, () => setView("issues"), isSuperAdmin(session))}
        </div>
        <div style={{ borderTop: "1px solid #262A30", paddingTop: 12, marginTop: 12 }}>
          <div style={{ padding: "0 10px 10px", fontSize: 11.5, color: "#8A919B" }}>{session.name} · {ROLE_DEFS[session.role]?.label || session.role}</div>
          <button onClick={onLogout} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", color: "#B9BFC7", fontSize: 13, cursor: "pointer" }}>
            <Lock size={14} /> Log out
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px 60px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}


// Fixed, thumb-reachable "New Job" button — replaces the old small
// top-corner icon. Sits above the safe-area on mobile, large enough to
// hit reliably on a work-floor phone.
function FloatingNewJobButton({ onClick, label = "New Job" }) {
  return (
    <button
      onClick={onClick}
      className="mrcap-press"
      style={{
        position: "fixed", left: "50%", bottom: "max(22px, env(safe-area-inset-bottom))",
        transform: "translateX(-50%)", zIndex: 50,
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 28px", borderRadius: 999, border: "none",
        background: `linear-gradient(135deg, ${COLORS.goldBright}, ${COLORS.gold} 55%, ${COLORS.goldDeep})`, color: COLORS.darkText,
        fontSize: 15.5, fontWeight: 700, cursor: "pointer",
        boxShadow: "0 10px 30px -8px rgba(201,162,39,0.55), 0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      <Plus size={22} strokeWidth={2.6} /> {label}
    </button>
  );

}
function SectionTitle({ children }) {
  return <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 19, color: COLORS.ink, margin: "12px 0 16px" }}>{children}</div>;
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 14 }}><label style={labelStyle}>{label}</label><div style={{ marginTop: 6 }}>{children}</div></div>;
}
function PhotoGrid({ photos, onRemove, onView }) {
  if (!photos.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
      {photos.map((src, i) => (
        <div key={i} style={{ position: "relative", width: 68, height: 68 }}>
          <img src={src} alt="" onClick={() => onView && onView(i)} style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}`, cursor: onView ? "pointer" : "default" }} />
          {onRemove && (
            <button onClick={() => onRemove(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#000", border: "2px solid #fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Full-screen photo viewer with real download — the "pull the file a week
// later" requirement. src is a base64 data URL, so downloading it doesn't
// need a network request; it's a real file save straight from the string
// already in memory.
function PhotoViewer({ photos, index, onClose, onNavigate }) {
  if (index == null || !photos[index]) return null;
  const photo = photos[index];

  const download = () => {
    const a = document.createElement("a");
    a.href = photo.src;
    const label = (photo.label || "photo").toLowerCase().replace(/\s+/g, "-");
    a.download = `mrcap-${label}-${index + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="mrcap-fade" style={{ position: "fixed", inset: 0, background: "rgba(6,6,5,0.96)", zIndex: 1000, display: "flex", flexDirection: "column" }} onClick={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", paddingTop: "max(16px, env(safe-area-inset-top))" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: COLORS.muted, fontSize: 12.5 }}>{photo.label} · {index + 1} of {photos.length}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={download} className="mrcap-press" style={{ ...iconBtnStyle, background: COLORS.gold, border: "none" }} title="Save to device">
            <Download size={17} color={COLORS.darkText} />
          </button>
          <button onClick={onClose} className="mrcap-press" style={iconBtnStyle}><X size={18} color={COLORS.ink} /></button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px", position: "relative" }} onClick={(e) => e.stopPropagation()}>
        {index > 0 && (
          <button onClick={() => onNavigate(index - 1)} className="mrcap-press" style={{ ...iconBtnStyle, position: "absolute", left: 10 }}><ChevronLeft size={20} color={COLORS.ink} /></button>
        )}
        <img src={photo.src} alt="" style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 6 }} />
        {index < photos.length - 1 && (
          <button onClick={() => onNavigate(index + 1)} className="mrcap-press" style={{ ...iconBtnStyle, position: "absolute", right: 10 }}><ChevronLeft size={20} color={COLORS.ink} style={{ transform: "rotate(180deg)" }} /></button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Plate picker (guided, not free-typed) ---------------- */
// Outputs a single formatted string (e.g. "DXB A 12345" or a raw VIN),
// same as the old plain text field expected — so nothing downstream
// (job.plate, matching logic, display) needs to change.
/* ---------------- Signature pad ---------------- */
// A real finger-drawn signature captured on an HTML canvas — pointer
// events cover touch (phone) and mouse (desktop testing) with one
// listener set. Exports as a PNG data URL, stored the same way photos
// already are — no new storage mechanism needed.
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const getCanvas = () => canvasRef.current;

  const getPos = (e) => {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    const canvas = getCanvas();
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = getCanvas();
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  // Redraw the stored signature (e.g. re-opening a form) — canvases don't
  // persist their pixels across re-renders on their own.
  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <div style={{ border: `1.5px dashed ${COLORS.line}`, borderRadius: 10, background: "#fff", overflow: "hidden", touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={340}
          height={140}
          style={{ width: "100%", height: 140, display: "block", cursor: "crosshair" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 10.5, color: COLORS.muted }}>Customer signs here to confirm the job and terms</span>
        <button onClick={clear} className="mrcap-press" style={{ fontSize: 11, color: COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>Clear</button>
      </div>
    </div>
  );
}

/* ---------------- Panel damage marker (Body Work) ---------------- */
// The 13-panel checklist plus a drawing canvas over the shop's real
// vehicle inspection diagram. Ticking a panel selects it as "active" —
// strokes drawn while a panel is active are tagged with that panel's
// name, and a small text label is stamped near the stroke so the
// picture and the checklist visibly agree, per the shop's requirement.
// Exports as one flattened PNG (diagram + all marks + labels) stored on
// the job, same pattern as the signature.
function PanelDamageMarker({ selectedPanels, onTogglePanel, marks, onMarksChange, onImageChange }) {
  const canvasRef = useRef(null);
  const bgImgRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [activePanel, setActivePanel] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const CANVAS_W = 640, CANVAS_H = 428; // matches CAR_DIAGRAM_SRC's ~3:2 aspect

  // Load the diagram once, keep it in a ref so redraws don't re-fetch it.
  useEffect(() => {
    const img = new Image();
    img.onload = () => { bgImgRef.current = img; setImgLoaded(true); };
    img.src = CAR_DIAGRAM_SRC;
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImgRef.current) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImgRef.current, 0, 0, canvas.width, canvas.height);
    // Replay every stored mark's strokes.
    marks.forEach((mark) => {
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      mark.strokes.forEach((stroke) => {
        if (stroke.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
      // Label near the first point of the first stroke.
      if (mark.strokes[0] && mark.strokes[0][0]) {
        const p = mark.strokes[0][0];
        ctx.font = "bold 11px Arial";
        const textW = ctx.measureText(mark.panel).width;
        ctx.fillStyle = "rgba(220,60,40,0.92)";
        ctx.fillRect(p.x + 6, p.y - 14, textW + 8, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(mark.panel, p.x + 10, p.y - 2);
      }
    });
    if (onImageChange) onImageChange(marks.length > 0 ? canvas.toDataURL("image/png") : null);
  }, [marks, onImageChange]);

  useEffect(() => { if (imgLoaded) redraw(); }, [imgLoaded, redraw]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const currentStrokeRef = useRef([]);

  const start = (e) => {
    if (!activePanel) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pos = getPos(e);
    lastPointRef.current = pos;
    currentStrokeRef.current = [pos];
  };
  const move = (e) => {
    if (!drawingRef.current || !activePanel) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    currentStrokeRef.current.push(pos);
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentStrokeRef.current.length < 2) { redraw(); return; } // ignore accidental taps
    const existingMark = marks.find((m) => m.panel === activePanel);
    let nextMarks;
    if (existingMark) {
      nextMarks = marks.map((m) => (m.panel === activePanel ? { ...m, strokes: [...m.strokes, currentStrokeRef.current] } : m));
    } else {
      nextMarks = [...marks, { panel: activePanel, strokes: [currentStrokeRef.current] }];
    }
    onMarksChange(nextMarks);
    currentStrokeRef.current = [];
  };

  const clearPanelMark = (panel) => {
    onMarksChange(marks.filter((m) => m.panel !== panel));
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>Tick a panel, then draw on the diagram to mark exactly where.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {CAR_PANELS.map((panel) => {
          const selected = selectedPanels.includes(panel);
          const marked = marks.some((m) => m.panel === panel);
          return (
            <button
              key={panel}
              onClick={() => {
                onTogglePanel(panel);
                setActivePanel(selected ? null : panel);
                if (selected) clearPanelMark(panel);
              }}
              className="mrcap-press"
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "6px 9px", borderRadius: 999,
                border: `1.5px solid ${activePanel === panel ? COLORS.red : selected ? COLORS.gold : COLORS.line}`,
                background: activePanel === panel ? "rgba(168,64,47,0.18)" : selected ? "rgba(201,162,39,0.12)" : COLORS.panel2,
                color: selected ? COLORS.ink : COLORS.muted, fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              {selected && (marked ? <CheckCircle2 size={11} color={COLORS.gold} /> : <div style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${COLORS.red}` }} />)}
              {panel}
            </button>
          );
        })}
      </div>

      {selectedPanels.length > 0 && (
        <div style={{ fontSize: 10.5, color: activePanel ? COLORS.red : COLORS.muted, marginBottom: 6 }}>
          {activePanel ? `Drawing on: ${activePanel} — tap it again to switch panels` : "Tap a highlighted panel above to start drawing its location"}
        </div>
      )}

      <div style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 10, overflow: "hidden", touchAction: "none", background: "#fff" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ width: "100%", height: "auto", display: "block", cursor: activePanel ? "crosshair" : "default" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      {marks.length > 0 && (
        <button onClick={() => { onMarksChange([]); }} className="mrcap-press" style={{ marginTop: 8, fontSize: 11, color: COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>
          Clear all marks
        </button>
      )}
    </div>
  );
}

/* ---------------- Discount picker (quick-select + exact manual entry) ---------------- */
// Quick-tap buttons for the common cases (0/10/20/30%), plus a real
// number input right next to them for anything exact like 12.5% — either
// one sets the same value, matching the shop's real workflow where most
// discounts are round numbers but not always.
const DISCOUNT_QUICK_VALUES = [0, 10, 20, 30];
function DiscountPicker({ value, onChange, subtotal = 0 }) {
  const isQuickValue = DISCOUNT_QUICK_VALUES.includes(value);
  // "Enter final price" mode: the owner sometimes just decides a flat/
  // rounded number for the whole job rather than a percentage — this
  // works out the discount % that produces that exact price, instead of
  // making anyone do that math by hand. The underlying stored value is
  // still just discountPercent, same as always — this is purely an
  // alternate way to arrive at it.
  const [priceMode, setPriceMode] = useState(false);
  const currentFinalPrice = subtotal > 0 ? subtotal * (1 - value / 100) : 0;
  const [finalPriceInput, setFinalPriceInput] = useState(() => (currentFinalPrice ? currentFinalPrice.toFixed(0) : ""));

  const applyFinalPrice = (raw) => {
    setFinalPriceInput(raw);
    const finalPrice = Number(raw);
    if (!subtotal || !raw || Number.isNaN(finalPrice)) return;
    const pct = Math.max(0, Math.min(100, (1 - finalPrice / subtotal) * 100));
    onChange(Math.round(pct * 100) / 100); // 2 decimal places — precise without being silly
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => setPriceMode(false)}
          className="mrcap-press"
          style={{ flex: 1, padding: "6px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${!priceMode ? COLORS.gold : COLORS.line}`, background: !priceMode ? "rgba(201,162,39,0.15)" : COLORS.panel2, color: !priceMode ? COLORS.gold : COLORS.muted }}
        >
          By discount %
        </button>
        <button
          onClick={() => { setPriceMode(true); setFinalPriceInput(currentFinalPrice ? currentFinalPrice.toFixed(0) : ""); }}
          className="mrcap-press"
          style={{ flex: 1, padding: "6px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${priceMode ? COLORS.gold : COLORS.line}`, background: priceMode ? "rgba(201,162,39,0.15)" : COLORS.panel2, color: priceMode ? COLORS.gold : COLORS.muted }}
          disabled={!subtotal}
        >
          By final price
        </button>
      </div>

      {priceMode ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: COLORS.muted }}>Final price (AED)</span>
            <input
              type="number" min="0" step="1"
              value={finalPriceInput}
              onChange={(e) => applyFinalPrice(e.target.value)}
              style={{ width: 100, background: "rgba(201,162,39,0.12)", border: `1.5px solid ${COLORS.gold}`, borderRadius: 6, padding: "6px 8px", fontSize: 12.5, color: COLORS.ink, fontFamily: MONO_FONT, textAlign: "right" }}
            />
          </div>
          <div style={{ fontSize: 10.5, color: COLORS.muted }}>Works out to {value.toFixed(1)}% off</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {DISCOUNT_QUICK_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => onChange(v)}
                className="mrcap-press"
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1.5px solid ${isQuickValue && value === v ? COLORS.gold : COLORS.line}`,
                  background: isQuickValue && value === v ? COLORS.gold : COLORS.panel2,
                  color: isQuickValue && value === v ? COLORS.darkText : COLORS.ink,
                }}
              >
                {v}%
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: COLORS.muted }}>Exact %</span>
            <input
              type="number" min="0" max="100" step="0.1"
              value={value}
              onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              style={{ width: 70, background: !isQuickValue ? "rgba(201,162,39,0.12)" : COLORS.panel2, border: `1.5px solid ${!isQuickValue ? COLORS.gold : COLORS.line}`, borderRadius: 6, padding: "6px 8px", fontSize: 12.5, color: COLORS.ink, fontFamily: MONO_FONT, textAlign: "right" }}
            />
          </div>
          {subtotal > 0 && <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 6 }}>= AED {currentFinalPrice.toFixed(0)}</div>}
        </>
      )}
    </div>
  );
}

function PlatePicker({ value, onChange, onModeChange, onVinPhotosChange }) {
  const [mode, setModeRaw] = useState("plate"); // 'plate' | 'vin'
  const [emirate, setEmirate] = useState(null);
  const [category, setCategory] = useState(null);
  const [manualCategory, setManualCategory] = useState(false);
  const [number, setNumber] = useState("");
  const [vin, setVin] = useState("");
  const [vinPhotos, setVinPhotos] = useState([]);
  const [uploadingVinPhoto, setUploadingVinPhoto] = useState(false);
  const vinFileRef = useRef(null);

  const setMode = (m) => { setModeRaw(m); onModeChange?.(m); };

  const addVinPhotos = async (files) => {
    setUploadingVinPhoto(true);
    const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    const next = [...vinPhotos, ...compressed];
    setVinPhotos(next);
    onVinPhotosChange?.(next);
    setUploadingVinPhoto(false);
  };
  const removeVinPhoto = (i) => {
    const next = vinPhotos.filter((_, idx) => idx !== i);
    setVinPhotos(next);
    onVinPhotosChange?.(next);
  };

  // Keep the parent's plain string in sync whenever any piece changes.
  useEffect(() => {
    if (mode === "vin") { onChange(vin.trim()); return; }
    if (emirate && category && number) onChange(`${emirate.code} ${category} ${number}`.trim());
    else onChange("");
    // eslint-disable-next-line
  }, [mode, emirate, category, number, vin]);

  const reset = () => { setEmirate(null); setCategory(null); setManualCategory(false); setNumber(""); };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setMode("plate")} className="mrcap-press" style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${mode === "plate" ? COLORS.gold : COLORS.line}`, background: mode === "plate" ? COLORS.gold : COLORS.panel2, color: mode === "plate" ? COLORS.darkText : COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Plate</button>
        <button onClick={() => setMode("vin")} className="mrcap-press" style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${mode === "vin" ? COLORS.gold : COLORS.line}`, background: mode === "vin" ? COLORS.gold : COLORS.panel2, color: mode === "vin" ? COLORS.darkText : COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>No plate — use VIN</button>
      </div>

      {mode === "vin" ? (
        <div>
          <input style={{ ...inputStyle, marginTop: 0, fontFamily: MONO_FONT, letterSpacing: 0.5 }} value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Chassis / VIN number" />
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6, marginBottom: 10 }}>
            VINs can occasionally repeat or be entered inconsistently — a photo of the chassis plate is the real record here.
          </div>
          {onVinPhotosChange && (
            <>
              <PhotoGrid photos={vinPhotos} onRemove={removeVinPhoto} />
              <input ref={vinFileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addVinPhotos(e.target.files)} />
              <button
                onClick={() => vinFileRef.current.click()}
                className="mrcap-press"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "9px", borderRadius: 9, border: `1.5px dashed ${COLORS.line}`, background: "transparent", color: COLORS.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
              >
                <Camera size={13} /> {uploadingVinPhoto ? "Uploading…" : vinPhotos.length ? "Add Another Photo" : "Attach Chassis / VIN Photo"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ background: COLORS.panel2, borderRadius: 10, padding: 12, border: `1px solid ${COLORS.line}` }}>
          {/* Step 1: emirate */}
          {!emirate && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
              {EMIRATES.map((em) => (
                <button key={em.code} onClick={() => setEmirate(em)} className="mrcap-press" style={{ padding: "10px 4px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.panel, color: COLORS.ink, fontFamily: MONO_FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{em.code}</button>
              ))}
            </div>
          )}

          {/* Step 2: category */}
          {emirate && !category && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, color: COLORS.muted }}>{emirate.name} · category</span>
                <button onClick={reset} className="mrcap-press" style={{ fontSize: 11, color: COLORS.gold, background: "none", border: "none", cursor: "pointer" }}>Change emirate</button>
              </div>
              {!manualCategory ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                    {emirate.categories.map((c) => (
                      <button key={c} onClick={() => setCategory(c)} className="mrcap-press" style={{ padding: "8px 2px", borderRadius: 7, border: `1px solid ${COLORS.line}`, background: COLORS.panel, color: COLORS.ink, fontFamily: MONO_FONT, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c}</button>
                    ))}
                  </div>
                  <button onClick={() => setManualCategory(true)} className="mrcap-press" style={{ marginTop: 8, fontSize: 11.5, color: COLORS.gold, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Type it manually instead</button>
                </>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input autoFocus style={{ ...inputStyle, marginTop: 0, flex: 1 }} placeholder="e.g. 7 or C" onChange={(e) => setCategory(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter" && e.target.value) setCategory(e.target.value.toUpperCase()); }} />
                  <button onClick={() => setManualCategory(false)} className="mrcap-press" style={{ ...secondaryBtnStyle, padding: "0 12px", fontSize: 12 }}>Back</button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: number */}
          {emirate && category && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: MONO_FONT }}>{emirate.code} {category} · number</span>
                <button onClick={() => { setCategory(null); setManualCategory(false); }} className="mrcap-press" style={{ fontSize: 11, color: COLORS.gold, background: "none", border: "none", cursor: "pointer" }}>Change category</button>
              </div>
              <input autoFocus inputMode="numeric" style={{ ...inputStyle, marginTop: 0, fontFamily: MONO_FONT, fontSize: 18, letterSpacing: 1, textAlign: "center" }} value={number} onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))} placeholder="12345" />
            </div>
          )}
        </div>
      )}

      {value && <div style={{ marginTop: 8, fontFamily: MONO_FONT, fontSize: 13, color: COLORS.gold, textAlign: "center" }}>{value}</div>}
    </div>
  );
}

/* ================= APP ================= */

export default function GarageApp() {
  const [ready, setReady] = useState(false);
  const [team, setTeam] = useState(DEFAULT_TEAM);
  const [session, setSession] = useState(null); // {id, name, role}
  const [view, setViewRaw] = useState("list");
  // Every existing `setView("xyz")` call site elsewhere in this file keeps
  // working completely unchanged — this wraps the raw state setter once,
  // here, so browser back/forward steps through in-app screens instead of
  // leaving the app. The optional second argument carries whatever extra
  // id a screen needs restored (e.g. which job) — see openJob/openQuote.
  const setView = useCallback((nextView, extra = {}) => {
    setViewRaw(nextView);
    window.history.pushState({ mrcapView: nextView, ...extra }, "");
  }, []);

  // Browser/device back button: restore whichever screen history says we
  // were on, instead of the old behaviour of just leaving the app. Detail
  // screens force a fresh fetch by id (activeJob: null) rather than trust
  // whatever job object happened to still be in memory, so going back to
  // "detail" always shows the right car even after opening several.
  useEffect(() => {
    const onPopState = (e) => {
      const state = e.state || {};
      setViewRaw(state.mrcapView || "list");
      if (state.mrcapView === "detail" && state.activeId) {
        setActiveId(state.activeId);
        setActiveJob(null);
      }
      if (state.mrcapView === "quotedetail" && state.activeQuoteId) {
        setActiveQuoteId(state.activeQuoteId);
      }
    };
    window.addEventListener("popstate", onPopState);
    // Seed the initial entry once, so the very first back-press has a
    // real state object to restore rather than undefined.
    if (!window.history.state || !window.history.state.mrcapView) {
      window.history.replaceState({ mrcapView: "list" }, "");
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [activeId, setActiveId] = useState(null);
  const [activeJob, setActiveJob] = useState(null); // full job object, when we already have it in memory
  const [index, setIndex] = useState([]);
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | ok | failed
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const refreshIndex = useCallback(async () => {
    setSyncState("syncing");
    const idx = await loadIndex();
    idx.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setIndex(idx);
    setSyncState("ok");
    setLastSyncedAt(Date.now());
  }, []);

  // Updates the in-memory list immediately from a full job object, without
  // waiting on a storage round-trip — keeps the UI correct even when
  // persistent storage isn't live yet (unpublished / free plan).
  const upsertIndex = useCallback((job) => {
    setIndex((prev) => {
      const next = prev.filter((j) => j.id !== job.id);
      next.unshift(summaryOf(job));
      next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return next;
    });
  }, []);
  const removeFromIndex = useCallback((jobId) => {
    setIndex((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  useEffect(() => {
    (async () => {
      const [t] = await Promise.all([loadTeam(), loadDynamicServicesAndRoles(), loadAppSettings()]);
      setTeam(t);
      const raw = loadLocalSession();
      if (raw) {
        const s = raw;
        if (t.find((m) => m.id === s.id)) { setSession(s); setCurrentActor(s); }
      }
      await refreshIndex();
      setReady(true);
    })();
  }, [refreshIndex]);

  // Auto-refresh, so nobody has to remember to pull down/reload: a
  // background poll every 45s, plus an immediate refresh the moment the
  // tab/app comes back into focus (e.g. someone switches back to it after
  // a few minutes on another app). Only runs once logged in — no point
  // polling the login screen. This only re-fetches the lightweight
  // dashboard list, not whatever job someone might be mid-edit on, so it
  // can't clobber in-progress work.
  useEffect(() => {
    if (!ready || !session) return;
    const interval = setInterval(() => { refreshIndex(); }, 45000);
    const onVisible = () => { if (document.visibilityState === "visible") refreshIndex(); };
    const onFocus = () => { refreshIndex(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, session, refreshIndex]);

  const onLogin = async (member, viewMode = "phone") => {
    const s = { id: member.id, name: member.name, role: member.role, viewMode };
    setSession(s);
    saveLocalSession(s);
    setCurrentActor(s);
    logEvent("login", `${member.name} logged in`, s);
  };
  const onLogout = () => {
    if (session) logEvent("login", `${session.name} logged out`);
    setSession(null);
    saveLocalSession(null);
    setCurrentActor(null);
  };

  const openJob = (id, job) => { setActiveId(id); setActiveJob(job || null); setView("detail", { activeId: id }); logEvent("view", `Viewed job${job?.plate ? ` ${job.plate}` : ""} (${id.slice(0, 8)})`); };
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const openQuote = (id) => { setActiveQuoteId(id); setView("quotedetail", { activeQuoteId: id }); logEvent("view", `Viewed quote (${id.slice(0, 8)})`); };
  const canArchive = hasPermission(session, team, "archive");

  if (!ready) return <Shell><div style={{ padding: 40, textAlign: "center", color: COLORS.muted }}>Loading…</div></Shell>;

  if (!session) {
    return <Shell><LoginScreen team={team} setTeam={setTeam} onLogin={onLogin} /></Shell>;
  }

  // Desktop back-office mode: only offered at login to admin/intake (see
  // LoginScreen), and only takes effect for those roles even if the flag
  // is somehow set — shop-floor roles always get the normal mobile Shell.
  const isDesktop = session.viewMode === "pc" && (session.role === "admin" || session.role === "intake");
  const ActiveShell = isDesktop ? DesktopShell : Shell;

  // Same "attention needed" definition as the Follow-ups Due banner and
  // Warranty Expiring Soon banner on the dashboard itself — the egg's
  // badge is just a glanceable preview of those two counts from
  // anywhere in the app, not a separate source of truth.
  const eggTodayStr = new Date().toISOString().slice(0, 10);
  const eggIn30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const eggAttentionCount = index.filter((j) => j.followupDate && j.followupDate <= eggTodayStr).length
    + index.filter((j) => j.warrantyExpiry && j.warrantyExpiry >= eggTodayStr && j.warrantyExpiry <= eggIn30DaysStr).length;

  return (
    <ActiveShell session={session} team={team} view={view} setView={setView} onLogout={onLogout} canArchive={canArchive}>
      {isSuperAdmin(session) && <DraggablePorscheEgg badgeCount={eggAttentionCount} onTap={() => setView("admindash")} />}
      <ReportIssueButton session={session} view={view} />
      <TopBar session={session} team={team} onLogout={onLogout} onNew={() => setView("new")} view={view} onBack={() => window.history.back()} onTeam={() => setView("team")} onArchive={() => setView("archive")} onCustomers={() => setView("customers")} onReports={() => setView("reports")} onQuotes={() => setView("quotes")} canArchive={canArchive} onAdminDash={() => setView("admindash")} onMsgTemplates={() => setView("msgtemplates")} onIssues={() => setView("issues")} onDispatch={() => setView("dispatch")} />
      {view === "list" && (
        ROLE_DEFS[session.role]?.simplified
          ? <SimplifiedDashboard index={index} session={session} onOpen={openJob} onRefresh={refreshIndex} syncState={syncState} lastSyncedAt={lastSyncedAt} />
          : <Dashboard index={index} session={session} onOpen={openJob} canArchive={canArchive} onRefresh={refreshIndex} syncState={syncState} lastSyncedAt={lastSyncedAt} />
      )}
      {view === "list" && hasPermission(session, team, "newJob") && (
        <FloatingNewJobButton onClick={() => setView("new")} />
      )}
      {view === "list" && (session.role === "admin" || session.role === "intake") && (
        <button
          onClick={() => setView("park")}
          className="mrcap-press"
          style={{
            position: "fixed", left: "50%", bottom: "max(78px, calc(env(safe-area-inset-bottom) + 78px))",
            transform: "translateX(-50%)", zIndex: 50,
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 999, border: `1.5px solid ${COLORS.gold}`,
            background: COLORS.paper, color: COLORS.gold,
            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          <PauseCircle size={14} /> Park a Vehicle
        </button>
      )}
      {view === "new" && hasPermission(session, team, "newJob") && (
        <NewJobForm session={session} team={team} onCreated={(job, saved) => { upsertIndex(job); setSyncState(saved ? "ok" : "failed"); if (saved) setLastSyncedAt(Date.now()); openJob(job.id, job); }} onCancel={() => window.history.back()} />
      )}
      {view === "new" && !hasPermission(session, team, "newJob") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "park" && (session.role === "admin" || session.role === "intake") && (
        <ParkVehicleForm session={session} onCreated={(job, saved) => { upsertIndex(job); setSyncState(saved ? "ok" : "failed"); if (saved) setLastSyncedAt(Date.now()); openJob(job.id, job); }} onCancel={() => window.history.back()} />
      )}
      {view === "park" && !(session.role === "admin" || session.role === "intake") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "detail" && activeId && (
        <JobDetail id={activeId} initialJob={activeJob} session={session} team={team} onChanged={(job, saved) => { upsertIndex(job); setActiveJob(job); setSyncState(saved ? "ok" : "failed"); if (saved) setLastSyncedAt(Date.now()); }} onBack={() => window.history.back()} canArchive={canArchive} onDeleted={(jobId) => { removeFromIndex(jobId); window.history.back(); }} />
      )}
      {view === "team" && hasPermission(session, team, "team") && (
        <TeamScreen team={team} setTeam={setTeam} session={session} onBack={() => window.history.back()} onImport={() => setView("import")} onServices={() => setView("services")} canServices={hasPermission(session, team, "services")} onActivityLog={() => setView("activitylog")} />
      )}
      {view === "team" && !hasPermission(session, team, "team") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "services" && hasPermission(session, team, "services") && (
        <ServicesManagementScreen onBack={() => window.history.back()} />
      )}
      {view === "services" && !hasPermission(session, team, "services") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "activitylog" && session.id === "owner" && (
        <ActivityLogScreen onBack={() => window.history.back()} />
      )}
      {view === "activitylog" && session.id !== "owner" && <AccessDenied onBack={() => window.history.back()} />}
      {view === "archive" && canArchive && (
        <ArchiveScreen index={index} onOpen={openJob} onBack={() => window.history.back()} />
      )}
      {view === "archive" && !canArchive && <AccessDenied onBack={() => window.history.back()} />}
      {view === "customers" && hasPermission(session, team, "customers") && (
        <CustomersScreen onBack={() => window.history.back()} onOpenJob={openJob} />
      )}
      {view === "customers" && !hasPermission(session, team, "customers") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "reports" && hasPermission(session, team, "reports") && (
        <ReportsScreen onBack={() => window.history.back()} />
      )}
      {view === "reports" && !hasPermission(session, team, "reports") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "dispatch" && <DispatchBoard team={team} session={session} />}
      {view === "admindash" && isSuperAdmin(session) && (
        <AdminStatsScreen team={team} onBack={() => window.history.back()} />
      )}
      {view === "admindash" && !isSuperAdmin(session) && <AccessDenied onBack={() => window.history.back()} />}
      {view === "msgtemplates" && isSuperAdmin(session) && (
        <MessageTemplatesScreen onBack={() => window.history.back()} />
      )}
      {view === "msgtemplates" && !isSuperAdmin(session) && <AccessDenied onBack={() => window.history.back()} />}
      {view === "issues" && isSuperAdmin(session) && (
        <IssueReportsScreen onBack={() => window.history.back()} />
      )}
      {view === "issues" && !isSuperAdmin(session) && <AccessDenied onBack={() => window.history.back()} />}
      {view === "import" && hasPermission(session, team, "import") && (
        <ImportScreen session={session} onBack={() => window.history.back()} />
      )}
      {view === "import" && !hasPermission(session, team, "import") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "quotes" && hasPermission(session, team, "quotations") && (
        <QuotesScreen onBack={() => window.history.back()} onOpen={openQuote} onNew={() => setView("newquote")} />
      )}
      {view === "newquote" && hasPermission(session, team, "quotations") && (
        <NewQuoteForm session={session} onCreated={(quote) => { setActiveQuoteId(quote.id); setView("quotedetail", { activeQuoteId: quote.id }); }} onCancel={() => window.history.back()} />
      )}
      {(view === "quotes" || view === "newquote") && !hasPermission(session, team, "quotations") && <AccessDenied onBack={() => window.history.back()} />}
      {view === "quotedetail" && activeQuoteId && hasPermission(session, team, "quotations") && (
        <QuoteDetail id={activeQuoteId} session={session} team={team} onBack={() => window.history.back()} onConverted={(job) => { upsertIndex(job); openJob(job.id, job); }} />
      )}
      {view === "quotedetail" && !hasPermission(session, team, "quotations") && <AccessDenied onBack={() => window.history.back()} />}
    </ActiveShell>
  );
}

/* ---------------- Login (name grid + PIN) ---------------- */

function LoginScreen({ team, setTeam, onLogin }) {
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState(null); // 'set' | 'enter'
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false); // success flash before handoff
  // PC/Phone view choice — only offered to admin/intake, chosen fresh at
  // every login (not remembered) since the same person may use both a
  // shop phone and the office computer on different days.
  const [viewMode, setViewMode] = useState("phone");

  const pick = (member) => {
    setPicked(member);
    setPin("");
    setError("");
    setMode(member.pin ? "enter" : "set");
  };

  const press = (d) => { if (pin.length < 4) setPin((p) => p + d); };
  const backspace = () => setPin((p) => p.slice(0, -1));
  const dialRotation = pin.length * 90; // one quarter-turn per digit — the dial "clicks" shut

  useEffect(() => {
    if (pin.length !== 4 || !picked) return;
    (async () => {
      if (mode === "set") {
        const next = team.map((m) => (m.id === picked.id ? { ...m, pin } : m));
        setTeam(next);
        await saveTeam(next);
        setFlash(true);
        setTimeout(() => onLogin({ ...picked, pin }, viewMode), 420);
      } else {
        if (pin === picked.pin) {
          setFlash(true);
          setTimeout(() => onLogin(picked, viewMode), 420);
        } else {
          setError("Wrong PIN");
          setTimeout(() => setPin(""), 260);
        }
      }
    })();
    // eslint-disable-next-line
  }, [pin]);

  if (picked) {
    return (
      <div className="mrcap-view" style={{ padding: "48px 22px", textAlign: "center" }}>
        <button onClick={() => setPicked(null)} style={{ ...iconBtnStyle, marginBottom: 24 }} className="mrcap-press"><ChevronLeft size={18} color={COLORS.ink} /></button>

        {/* Signature element: a mechanical vault dial. Each digit rotates the
            ring a quarter-turn — a locking-into-place gesture rather than a
            generic dot-pad, matching the "briefing case" motif. */}
        <div style={{ position: "relative", width: 148, height: 148, margin: "0 auto 22px" }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: `1px solid ${COLORS.line}`,
            background: `conic-gradient(from 0deg, ${COLORS.panel2}, ${COLORS.panel} 60%, ${COLORS.panel2})`,
          }} />
          <div style={{
            position: "absolute", inset: 10, borderRadius: "50%",
            border: `2px solid ${flash ? COLORS.goldBright : COLORS.gold}`,
            transform: `rotate(${dialRotation}deg)`,
            transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), border-color 0.3s ease",
            boxShadow: flash ? `0 0 0 0 rgba(201,162,39,0.45)` : "none",
            animation: flash ? "mrcapPulseRing 0.6s ease-out" : "none",
          }}>
            <div style={{ position: "absolute", top: -3, left: "50%", marginLeft: -3, width: 6, height: 6, borderRadius: "50%", background: COLORS.gold }} />
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <Lock size={18} color={flash ? COLORS.goldBright : COLORS.muted} style={{ transition: "color 0.3s ease" }} />
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i < pin.length ? COLORS.gold : "transparent", border: `1.5px solid ${i < pin.length ? COLORS.gold : COLORS.muted}`, transition: "all 0.2s ease" }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 20, color: COLORS.ink }}>{picked.name}</div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3, marginBottom: 22, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {flash ? "Access granted" : mode === "set" ? "Set a 4-digit PIN" : "Enter your PIN"}
        </div>

        {error && <div className="mrcap-fade" style={{ color: COLORS.red, fontSize: 12.5, marginBottom: 12, letterSpacing: 0.3, textTransform: "uppercase" }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 240, margin: "0 auto" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} onClick={() => press(String(n))} style={keyBtnStyle} className="mrcap-press">{n}</button>
          ))}
          <div />
          <button onClick={() => press("0")} style={keyBtnStyle} className="mrcap-press">0</button>
          <button onClick={backspace} style={keyBtnStyle} className="mrcap-press"><Delete size={17} color={COLORS.ink} /></button>
        </div>

        {(picked.role === "admin" || picked.role === "intake") && (
          <div style={{ marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 9.5, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase" }}>View as</div>
            <div style={{ display: "flex", gap: 6, background: COLORS.panel2, borderRadius: 10, padding: 4 }}>
              <button onClick={() => setViewMode("phone")} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", background: viewMode === "phone" ? COLORS.gold : "transparent", color: viewMode === "phone" ? COLORS.darkText : COLORS.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                Phone
              </button>
              <button onClick={() => setViewMode("pc")} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", background: viewMode === "pc" ? COLORS.gold : "transparent", color: viewMode === "pc" ? COLORS.darkText : COLORS.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                PC
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mrcap-view" style={{ padding: "44px 22px" }}>
      <div style={{ textAlign: "center", marginBottom: 34 }}>
        <div style={{ width: 88, height: 88, borderRadius: 16, background: "#fff", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center", padding: 9, boxSizing: "border-box", border: `1px solid ${COLORS.line}`, boxShadow: `0 0 0 1px rgba(201,162,39,0.15), 0 12px 30px -12px rgba(0,0,0,0.6)` }}>
          <img src={LOGO_SRC} alt="Mr.CAP" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div style={{ fontSize: 10.5, color: COLORS.gold, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>Field Access</div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 25, color: COLORS.ink }}>Who's this?</div>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 6, letterSpacing: 0.2 }}>Mr.CAP — Al Hammar, Dubai</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.map((m, i) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            className="mrcap-press mrcap-fade"
            style={{ animationDelay: `${i * 40}ms`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", boxSizing: "border-box", padding: "14px 15px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.panel, cursor: "pointer" }}
          >
            <span style={{ fontFamily: MONO_FONT, fontWeight: 500, fontSize: 14, color: COLORS.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{m.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <Pill bg={`${ROLE_DEFS[m.role].color}33`} fg={ROLE_DEFS[m.role].color}>{ROLE_DEFS[m.role].label}</Pill>
              <Lock size={12} color={COLORS.muted} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
const keyBtnStyle = { height: 54, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: COLORS.panel2, fontFamily: MONO_FONT, fontSize: 18, fontWeight: 500, color: COLORS.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };


/* ---------------- Top bar ---------------- */

function TopBar({ session, team, onLogout, onNew, view, onBack, onTeam, onArchive, onCustomers, onReports, onQuotes, canArchive, onAdminDash, onMsgTemplates, onIssues, onDispatch }) {
  const isSimplified = !!ROLE_DEFS[session.role]?.simplified;
  return (
    <div className="mrcap-view">
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)` }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {view !== "list" ? (
            <button onClick={onBack} style={iconBtnStyle} className="mrcap-press"><ChevronLeft size={20} color={COLORS.ink} /></button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 3, boxSizing: "border-box", flexShrink: 0, border: `1px solid ${COLORS.line}` }}>
                <img src={LOGO_SRC} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 16, color: COLORS.ink, lineHeight: 1.1 }}>MR.CAP</div>
                <div style={{ fontSize: 9.5, color: COLORS.gold, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1.3 }}>Job Tracker</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {view === "list" && hasPermission(session, team, "customers") && (
            <button onClick={onCustomers} style={iconBtnStyle} className="mrcap-press" title="Customers"><Users size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && hasPermission(session, team, "quotations") && (
            <button onClick={onQuotes} style={iconBtnStyle} className="mrcap-press" title="Quotations"><FileText size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && hasPermission(session, team, "archive") && (
            <button onClick={onArchive} style={iconBtnStyle} className="mrcap-press" title="Archive"><Archive size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && hasPermission(session, team, "reports") && (
            <button onClick={onReports} style={iconBtnStyle} className="mrcap-press" title="Reports"><BarChart3 size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && hasPermission(session, team, "team") && (
            <button onClick={onTeam} style={iconBtnStyle} className="mrcap-press" title="Team"><ShieldCheck size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && (
            <button onClick={onDispatch} style={iconBtnStyle} className="mrcap-press" title="Dispatch Board"><ListChecks size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && isSuperAdmin(session) && (
            <button onClick={onAdminDash} style={iconBtnStyle} className="mrcap-press" title="Admin Dashboard"><LayoutDashboard size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && isSuperAdmin(session) && (
            <button onClick={onMsgTemplates} style={iconBtnStyle} className="mrcap-press" title="WhatsApp Messages"><MessageSquare size={16} color={COLORS.ink} /></button>
          )}
          {view === "list" && isSuperAdmin(session) && (
            <button onClick={onIssues} style={iconBtnStyle} className="mrcap-press" title="Issue Reports"><AlertCircle size={16} color={COLORS.ink} /></button>
          )}
        </div>
      </div>
      {view === "list" && (
        <button onClick={onLogout} style={{ margin: "0 18px 10px", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <User size={13} color={COLORS.muted} />
          <span style={{ fontSize: 12.5, color: COLORS.muted }}>{session.name} · {ROLE_DEFS[session.role].label} · tap to switch</span>
        </button>
      )}
    </div>
  );
}

/* ---------------- Dashboard / Board ---------------- */

function SyncBar({ syncState, lastSyncedAt, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  if (syncState === "failed") {
    return (
      <div style={{ background: "#3A2420", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.red, fontWeight: 600 }}>Didn't save to the shared server</span>
          <button onClick={doRefresh} style={{ fontSize: 11.5, color: "#fff", background: COLORS.red, border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>{refreshing ? "…" : "Retry"}</button>
        </div>
        {lastStorageError && (
          <div style={{ fontSize: 10.5, color: "#E8A99B", marginTop: 6, fontFamily: "monospace", wordBreak: "break-word" }}>{lastStorageError}</div>
        )}
      </div>
    );
  }
  return (
    <button onClick={doRefresh} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8, background: "none", border: "none", padding: "0 2px 12px", cursor: "pointer" }}>
      <span style={{ fontSize: 11, color: COLORS.muted }}>
        {refreshing || syncState === "syncing" ? "Checking server…" : lastSyncedAt ? `Synced ${fmtTime(lastSyncedAt)}` : "Not synced yet"}
      </span>
      <span style={{ fontSize: 11, color: COLORS.goldDeep, fontWeight: 600 }}>Refresh</span>
    </button>
  );
}

/* ---------------- Simplified board (shop-floor roles) ---------------- */
// A deliberately different, smaller screen — not a filtered version of
// the admin board. Only what's assigned to this person, big tap targets,
// one action per job, nothing to configure or navigate away to.
function SimplifiedDashboard({ index, session, onOpen, onRefresh, syncState, lastSyncedAt }) {
  const [tab, setTab] = useState("waiting"); // 'waiting' | 'cleared'
  const myServiceKeys = SERVICES.filter((s) => s.role === session.role).map((s) => s.key);

  // "New since I last checked" — read once on mount so today's newly
  // created jobs still show their badge during this visit, then update
  // lastSeen so next visit starts fresh.
  const [lastSeen] = useState(() => getLastSeen(session.id));
  useEffect(() => { setLastSeen(session.id, Date.now()); }, [session.id]);

  // A job belongs on this person's board if it has one of their services,
  // it isn't done yet, and the job itself isn't archived.
  const myJobs = index.filter((j) => {
    if (j.stageKey === "collected") return false;
    return myServiceKeys.some((key) => (j.serviceTypes || []).includes(key) && !j.serviceDone?.[key]);
  });
  const newCount = myJobs.filter((j) => j.createdAt > lastSeen).length;

  // "Cleared by me" — jobs where THIS person's history log shows they
  // personally marked one of their services done, in the last 3 days
  // only; older entries drop off even from this view, per the shop's
  // explicit request (not a permanent personal record, just a short
  // look-back).
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const myServiceLabels = new Set(SERVICES.filter((s) => s.role === session.role).map((s) => s.label));
  const clearedByMe = index.filter((j) =>
    (j.history || []).some((h) => h.by === session.name && h.at >= threeDaysAgo && h.note === "Marked done" && myServiceLabels.has(h.label))
  );

  const list = tab === "waiting" ? myJobs : clearedByMe;

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 90px" }}>
      <SyncBar syncState={syncState} lastSyncedAt={lastSyncedAt} onRefresh={onRefresh} />

      <div style={{ textAlign: "center", padding: "10px 0 16px" }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 20, color: COLORS.ink }}>Hi, {session.name}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("waiting")} className="mrcap-press" style={{ flex: 1, position: "relative", padding: "10px", borderRadius: 10, border: `1.5px solid ${tab === "waiting" ? COLORS.gold : COLORS.line}`, background: tab === "waiting" ? COLORS.gold : COLORS.panel2, color: tab === "waiting" ? COLORS.darkText : COLORS.ink, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Waiting on me ({myJobs.length})
          {newCount > 0 && (
            <span style={{ position: "absolute", top: -6, right: -6, background: COLORS.red, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 6px", border: `2px solid ${COLORS.paper}` }}>{newCount} new</span>
          )}
        </button>
        <button onClick={() => setTab("cleared")} className="mrcap-press" style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${tab === "cleared" ? COLORS.gold : COLORS.line}`, background: tab === "cleared" ? COLORS.gold : COLORS.panel2, color: tab === "cleared" ? COLORS.darkText : COLORS.ink, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Cleared by me
        </button>
      </div>

      {list.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 10px", color: COLORS.muted }}>
          <CheckCircle2 size={32} color={COLORS.green} style={{ opacity: 0.6, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>{tab === "waiting" ? "All caught up" : "Nothing cleared in the last 3 days"}</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {list.map((j) => (
          <button key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press" style={{ textAlign: "left", width: "100%", boxSizing: "border-box", background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderLeft: `4px solid ${tab === "waiting" ? COLORS.gold : COLORS.green}`, borderRadius: "6px 14px 14px 6px", padding: "18px 16px", cursor: "pointer", position: "relative" }}>
            {tab === "waiting" && j.createdAt > lastSeen && (
              <span style={{ position: "absolute", top: 10, right: 12, fontSize: 10, fontWeight: 700, color: COLORS.gold, textTransform: "uppercase", letterSpacing: 0.5 }}>New</span>
            )}
            <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 22, color: COLORS.ink, letterSpacing: 0.5 }}>{j.plate}</div>
            <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 4 }}>{j.makeModel}</div>
            {tab === "waiting" && j.priority === "High" && (
              <div style={{ marginTop: 8 }}><Pill tone="red">Urgent</Pill></div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ index, session, onOpen, canArchive, onRefresh, syncState, lastSyncedAt }) {
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const isAdmin = session.role === "admin";

  // Jobs with at least one service where this person is the reviewer,
  // that service is marked done by the doer, but not yet reviewed —
  // Ahmed's "don't let a tint job slip through" queue.
  const reviewQueue = index.filter((j) => {
    if (j.stageKey === "collected") return false;
    return (j.serviceTypes || []).some((key) => {
      const svc = SERVICES.find((s) => s.key === key);
      if (!svc || !svc.reviewerRole || svc.reviewerRole !== session.role) return false;
      return j.serviceDone?.[key] && !j.serviceReviewed?.[key];
    });
  });

  // Two separate rules stack here:
  // 1. Only archive-access people (you, Suhail, Ahmed, Laani) ever see
  //    collected cards on the board at all — everyone else never does.
  // 2. Even for those people, a collected card only stays on the board
  //    through the end of its collection day — after that it's Archive-only,
  //    for everyone, permanently.
  const visible = index.filter((j) => j.stageKey !== "collected" || (canArchive && isRecentlyCollected(j)));

  const active = visible.filter((j) => j.stageKey !== "collected");
  const highPriority = active.filter((j) => j.priority === "High");
  const readyForQC = visible.filter((j) => j.stageKey === "qc");

  const filtered = visible.filter((j) => {
    if (filter === "open" && j.stageKey === "collected") return false;
    if (filter === "mine" && j.stageKey !== "service") return false;
    if (filter === "collected" && j.stageKey !== "collected") return false;
    if (search) {
      const q = search.toLowerCase();
      return (j.plate || "").toLowerCase().includes(q) || (j.customerName || "").toLowerCase().includes(q) || (j.makeModel || "").toLowerCase().includes(q);
    }
    return true;
  });

  const filterTabs = [["open", "Open"], ["mine", "In Service"], ["all", "All"]];
  if (canArchive) filterTabs.splice(2, 0, ["collected", "Collected"]);

  const grouped = STAGES.map((s) => ({ stage: s, jobs: filtered.filter((j) => j.stageKey === s.key && !j.onHold) })).filter((g) => g.jobs.length || filter !== "open" || g.stage.key !== "collected");
  // On Hold is shown as its own section regardless of which pipeline stage
  // the job is parked at — it's a parking-lot category (a car just sitting
  // at the shop, sometimes for months), not a step in the normal workflow,
  // so it's pulled out of the stage groups above and always surfaced here.
  const onHoldJobs = filtered.filter((j) => j.onHold);

  // Follow-ups due: pulled from the FULL index, not the tab-filtered
  // subset, since a follow-up (e.g. "ceramic reapplication in 6 months")
  // is often set on a job that's already collected — it should still
  // surface here regardless of which dashboard tab is selected.
  const todayStr = new Date().toISOString().slice(0, 10);
  const followupsDue = index.filter((j) => j.followupDate && j.followupDate <= todayStr);

  // Warranty expiring soon: next 30 days, same full-index reasoning as
  // follow-ups above — a warranty is almost always on an already-
  // collected job, so it must not depend on which tab is active.
  const in30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const warrantiesExpiringSoon = index
    .filter((j) => j.warrantyExpiry && j.warrantyExpiry >= todayStr && j.warrantyExpiry <= in30DaysStr)
    .sort((a, b) => (a.warrantyExpiry < b.warrantyExpiry ? -1 : 1));

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 90px" }}>
      <SyncBar syncState={syncState} lastSyncedAt={lastSyncedAt} onRefresh={onRefresh} />

      {/* The one number the boss actually wants: how many cars are
          physically in the shop right now. Counts everything not yet
          collected — on-hold cars included, since they're still here. */}
      <div style={{ position: "relative", background: COLORS.panel, border: `1.5px solid ${COLORS.gold}`, borderRadius: 14, padding: "20px", marginBottom: 18, textAlign: "center", overflow: "hidden", boxShadow: "0 10px 28px -14px rgba(0,0,0,0.65)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(201,162,39,0.10), transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", fontFamily: MONO_FONT, fontWeight: 700, fontSize: 44, color: COLORS.gold, lineHeight: 1, textShadow: "0 0 24px rgba(201,162,39,0.25)" }}>{active.length}</div>
        <div style={{ position: "relative", fontSize: 11.5, color: COLORS.muted, marginTop: 7, textTransform: "uppercase", letterSpacing: 1.2 }}>Cars In The Shop Right Now</div>
        {onHoldJobs.length > 0 && (
          <div style={{ position: "relative", fontSize: 11, color: COLORS.gold, marginTop: 6 }}>{onHoldJobs.length} of those on hold</div>
        )}
      </div>

      {followupsDue.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <Clock size={14} color={COLORS.red} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Follow-ups Due</div>
            <Pill tone="red">{followupsDue.length}</Pill>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {followupsDue.map((j) => (
              <div key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press" style={{ textAlign: "left", background: "rgba(168,64,47,0.08)", border: `1.5px solid ${COLORS.red}`, borderRadius: 10, padding: "12px 13px", cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{j.plate || "—"} · {j.makeModel}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{j.followupNote || "Follow-up due"} — {j.followupDate}</div>
                  </div>
                  {j.customerPhone && (
                    <WhatsAppSendButton
                      phone={j.customerPhone}
                      templateKey="follow_up"
                      vars={{ customerName: j.customerName || "", makeModel: j.makeModel || "vehicle", plate: j.plate || "", reason: j.followupNote || "a follow-up" }}
                      label="Message"
                      small
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {warrantiesExpiringSoon.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <ShieldCheck size={14} color={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Warranty Expiring Soon</div>
            <Pill tone="yellow">{warrantiesExpiringSoon.length}</Pill>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {warrantiesExpiringSoon.map((j) => (
              <div key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press" style={{ textAlign: "left", background: "rgba(201,162,39,0.08)", border: `1.5px solid ${COLORS.gold}`, borderRadius: 10, padding: "12px 13px", cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{j.plate || "—"} · {j.makeModel}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>Warranty expires {j.warrantyExpiry}</div>
                  </div>
                  {j.customerPhone && (
                    <WhatsAppSendButton
                      phone={j.customerPhone}
                      templateKey="warranty_reminder"
                      vars={{ customerName: j.customerName || "", makeModel: j.makeModel || "vehicle", plate: j.plate || "", expiryDate: j.warrantyExpiry }}
                      label="Message"
                      small
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewQueue.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <ShieldAlert size={15} color={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.gold }}>Needs Your Review</div>
            <Pill tone="yellow">{reviewQueue.length}</Pill>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reviewQueue.map((j) => (
              <button key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press" style={{ textAlign: "left", width: "100%", boxSizing: "border-box", background: "rgba(201,162,39,0.12)", border: `1.5px solid ${COLORS.gold}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
                <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 14, color: COLORS.ink }}>{j.plate}</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>{j.customerName} · ready for your sign-off</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
          <StatCard label="Active" value={active.length} />
          <StatCard label="High priority" value={highPriority.length} tone={highPriority.length ? COLORS.red : undefined} />
          <StatCard label="Ready for QC" value={readyForQC.length} tone={readyForQC.length ? COLORS.blue : undefined} />
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} color={COLORS.muted} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plate, customer, model…" style={{ ...inputStyle, marginTop: 0, paddingLeft: 34 }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
        {filterTabs.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className="mrcap-press" style={{ padding: "7px 13px", borderRadius: 999, border: `1.5px solid ${filter === k ? COLORS.gold : COLORS.line}`, background: filter === k ? COLORS.gold : COLORS.panel2, color: filter === k ? COLORS.darkText : COLORS.ink, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0 }}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 10px", color: COLORS.muted }}>
          <Car size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 14 }}>No job cards here yet.</div>
        </div>
      )}

      {grouped.map(({ stage, jobs }) => jobs.length > 0 && (
        <div key={stage.key} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{stage.label}</div>
            <Pill tone={stageTone(stage.key)}>{jobs.length}</Pill>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {jobs.map((j) => (
              <button key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press mrcap-card" style={{ textAlign: "left", background: COLORS.panel, borderTop: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}`, borderLeft: `3px solid ${COLORS.gold}`, borderRadius: "4px 10px 10px 4px", padding: "13px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, width: "100%", boxSizing: "border-box", boxShadow: "0 6px 16px -10px rgba(0,0,0,0.6)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.ink, letterSpacing: 1.1 }}>{j.plate || "—"}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 1 }}>{j.makeModel} · {j.customerName}</div>
                  </div>
                  <Pill tone={priorityTone(j.priority)}>{j.priority}</Pill>
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={11} /> {fmtTime(j.updatedAt)} · <Building2 size={11} /> {j.location}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* On Hold now renders last, deliberately below every active stage —
          these are the "sitting for months" cars, not day-to-day work, so
          they shouldn't push the actually-moving jobs further down the
          screen. Still its own clearly-labeled section, never mixed in. */}
      {onHoldJobs.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <PauseCircle size={15} color={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.gold }}>On Hold</div>
            <Pill tone="yellow">{onHoldJobs.length}</Pill>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {onHoldJobs.map((j) => (
              <button key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press mrcap-card" style={{ textAlign: "left", background: "rgba(201,162,39,0.08)", border: `1.5px solid ${COLORS.gold}`, borderRadius: 10, padding: "13px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, width: "100%", boxSizing: "border-box", boxShadow: "0 6px 16px -10px rgba(0,0,0,0.6)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.ink, letterSpacing: 1.1 }}>{j.plate || "—"}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 1 }}>{j.makeModel} · {j.customerName}</div>
                  </div>
                  <Pill tone="yellow">On Hold</Pill>
                </div>
                {j.onHoldNote && <div style={{ fontSize: 12, color: COLORS.ink, fontStyle: "italic" }}>"{j.onHoldNote}"</div>}
                <div style={{ fontSize: 11, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={11} /> Since {fmtTime(j.onHoldSince)} · <Building2 size={11} /> {j.location}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className="mrcap-fade" style={{ background: COLORS.panel, border: `1px solid ${tone || COLORS.line}`, borderRadius: 10, padding: "13px 11px", position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 9.5, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 24, color: tone || COLORS.gold, marginTop: 3 }}>{String(value).padStart(2, "0")}</div>
    </div>
  );
}

/* ---------------- New Job Form ---------------- */

/* ---------------- New Quote (fully parallel to NewJobForm, no team/stage) ---------------- */
function NewQuoteForm({ session, onCreated, onCancel }) {
  const [plate, setPlate] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [customerType, setCustomerType] = useState(null);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [treatments, setTreatments] = useState({});
  const [treatmentPrices, setTreatmentPrices] = useState({});
  const [discountPercent, setDiscountPercent] = useState(0);
  const [parts, setParts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const toggleService = (key) => setServiceTypes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  const toggleTreatment = (serviceKey, t) => {
    const name = t.name;
    setTreatments((cur) => {
      const list = cur[serviceKey] || [];
      const next = list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
      return { ...cur, [serviceKey]: next };
    });
    const priceKey = `${serviceKey}::${name}`;
    setTreatmentPrices((p) => {
      const already = (treatments[serviceKey] || []).includes(name);
      if (already) { const next = { ...p }; delete next[priceKey]; return next; }
      const listPrice = customerType === "b2b" ? t.b2b : t.retail;
      return { ...p, [priceKey]: listPrice != null ? listPrice : "" };
    });
  };

  const submit = async () => {
    if (!customerName.trim()) return;
    setSaving(true);
    const now = Date.now();
    const quote = {
      plate: plate.trim().toUpperCase(), makeModel: makeModel.trim(),
      customerName: customerName.trim(), customerPhone: customerPhone.trim(),
      description: description.trim(),
      serviceTypes, treatments, treatmentPrices, discountPercent, parts,
      status: "draft", convertedJobId: null,
      createdAt: now, updatedAt: now, createdBy: session.name,
    };
    const result = await createQuote(quote, customerType);
    setSaving(false);
    if (!result.ok || !result.quote.id) { setSaveError(true); return; }
    onCreated(result.quote);
  };

  return (
    <div className="mrcap-view" style={{ padding: "4px 18px 30px" }}>
      <SectionTitle>New Quotation</SectionTitle>
      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: -10, marginBottom: 16 }}>Not a job yet — nothing gets assigned or tracked until this is converted.</div>

      <Field label="Plate number (optional)"><PlatePicker value={plate} onChange={setPlate} /></Field>
      <Field label="Make / model"><input style={inputStyle} value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="e.g. Prado" /></Field>
      <Field label="Customer name"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer full name" /></Field>
      <Field label="Customer phone"><input type="tel" inputMode="numeric" style={inputStyle} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, ""))} placeholder="050 xxx xxxx" /></Field>

      <Field label="Customer type">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setCustomerType("retail")} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${customerType === "retail" ? COLORS.gold : COLORS.line}`, background: customerType === "retail" ? COLORS.gold : COLORS.panel2, color: customerType === "retail" ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Retail / Walk-in</button>
          <button onClick={() => setCustomerType("b2b")} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${customerType === "b2b" ? COLORS.gold : COLORS.line}`, background: customerType === "b2b" ? COLORS.gold : COLORS.panel2, color: customerType === "b2b" ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>B2B</button>
        </div>
      </Field>

      <Field label="Proposed services & treatments">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleServices(serviceTypes).map((s) => (
            <div key={s.key}>
              <button onClick={() => toggleService(s.key)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.line}`, background: serviceTypes.includes(s.key) ? "rgba(74,122,87,0.18)" : COLORS.panel2, cursor: "pointer", width: "100%" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.muted}`, background: serviceTypes.includes(s.key) ? COLORS.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {serviceTypes.includes(s.key) && <Check size={12} color="#fff" />}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</span>
              </button>
              {serviceTypes.includes(s.key) && s.treatments && (
                <div style={{ padding: "8px 4px 4px 4px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {s.treatments.map((t) => {
                    const picked = (treatments[s.key] || []).includes(t.name);
                    const priceKey = `${s.key}::${t.name}`;
                    return (
                      <div key={t.name}>
                        <button onClick={() => toggleTreatment(s.key, t)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 7, border: `1px solid ${picked ? COLORS.gold : COLORS.line}`, background: picked ? "rgba(201,162,39,0.12)" : COLORS.panel, cursor: "pointer", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${picked ? COLORS.gold : COLORS.muted}`, background: picked ? COLORS.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {picked && <Check size={9} color={COLORS.darkText} />}
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.ink }}>{t.name}</span>
                        </button>
                        {picked && (
                          <div style={{ padding: "5px 9px 0 30px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10.5, color: COLORS.muted }}>AED</span>
                              <input type="number" value={treatmentPrices[priceKey] ?? ""} onChange={(e) => setTreatmentPrices((p) => ({ ...p, [priceKey]: e.target.value }))} style={{ width: 90, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 11.5, color: COLORS.gold, fontFamily: MONO_FONT }} />
                              {t.retail != null && Number(treatmentPrices[priceKey]) !== t.retail && (
                                <span style={{ fontSize: 10, color: COLORS.muted, textDecoration: "line-through", fontFamily: MONO_FONT }}>AED {t.retail.toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Field>

      <Field label="Parts & fees (sourced externally — doors, windshields, rims, tow recovery, etc.)">
        <PartsEditor parts={parts} onChange={setParts} />
      </Field>

      {(Object.keys(treatmentPrices).length > 0 || parts.length > 0) && (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginBottom: 8 }}>
            <span>Services Subtotal</span>
            <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>AED {Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0).toLocaleString()}</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <DiscountPicker value={discountPercent} onChange={setDiscountPercent} subtotal={Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0)} />
          </div>
          {parts.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginTop: 8 }}>
              <span>Parts & Fees</span>
              <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>AED {Math.round(parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)).toLocaleString()}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.line}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>Estimated Total</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.gold }}>
              AED {Math.round(
                Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0) * (1 - discountPercent / 100)
                + parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)
              ).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <Field label="Notes">
        <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the customer is asking about" />
      </Field>

      {saveError && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#E08A78" }}>
          Couldn't save to the server. {lastStorageError && <span style={{ fontFamily: "monospace", display: "block", marginTop: 4, fontSize: 10.5 }}>{lastStorageError}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={!customerName.trim() || saving} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2, opacity: !customerName.trim() ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Create Quotation"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Park a Vehicle (admin/intake — a car just sitting at the
   shop, not going through service; created directly On Hold, e.g. the
   owner's own car parked at the office for weeks) ---------------- */
function ParkVehicleForm({ session, onCreated, onCancel }) {
  const [plate, setPlate] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [location, setLocation] = useState("Showroom");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const now = Date.now();
    const job = {
      plate: plate.trim().toUpperCase(), makeModel: makeModel.trim(),
      customerName: customerName.trim() || "—", customerPhone: "",
      description: "", damageNotes: "", priority: "Low", location: location.trim() || "Showroom",
      serviceTypes: [], serviceDone: {}, assignedTo: {}, serviceNotes: {}, serviceReviewed: {},
      treatments: {}, treatmentPrices: {}, discountPercent: 0, priceHistory: [],
      stageIndex: 0, photos: { intake: [], parts_removal: [], service: {} },
      onHold: true, onHoldNote: note.trim(), onHoldSince: now,
      history: [{ stage: "onhold", label: "On Hold", by: session.name, role: session.role, note: note.trim(), at: now }],
      createdBy: session.name, createdAt: now, updatedAt: now,
    };
    const result = await createJob(job);
    setSaving(false);
    if (!result.ok || !result.job.id) { setSaveError(true); return; }
    onCreated(result.job, result.ok);
  };

  return (
    <div className="mrcap-view" style={{ padding: "4px 18px 30px" }}>
      <SectionTitle>Park a Vehicle</SectionTitle>
      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: -10, marginBottom: 16 }}>
        For a car that's just sitting at the shop — not being serviced — so it still shows up on the daily report. It's created straight into On Hold.
      </div>

      <Field label="Plate number"><PlatePicker value={plate} onChange={setPlate} /></Field>
      <Field label="Make / model"><input style={inputStyle} value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="e.g. Prado" /></Field>
      <Field label="Whose car (optional)"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Owner, or a customer's name" /></Field>
      <Field label="Where it's parked"><input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Showroom" /></Field>
      <Field label="Why it's on hold"><textarea style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Owner's car, parked at the office for a few weeks" /></Field>

      {saveError && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#E08A78" }}>
          Couldn't save to the server. {lastStorageError && <span style={{ fontFamily: "monospace", display: "block", marginTop: 4, fontSize: 10.5 }}>{lastStorageError}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={!note.trim() || saving} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2, opacity: !note.trim() ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Park Vehicle (On Hold)"}
        </button>
      </div>
    </div>
  );
}

function NewJobForm({ session, team, onCreated, onCancel }) {
  const [plate, setPlate] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [damageNotes, setDamageNotes] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [treatments, setTreatments] = useState({}); // serviceKey -> [treatment names]
  const [assignedTo, setAssignedTo] = useState({}); // serviceKey -> team member id
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [signature, setSignature] = useState(null);
  const [damagePanels, setDamagePanels] = useState([]);
  const [damageMarks, setDamageMarks] = useState([]);
  const [damageDiagramImage, setDamageDiagramImage] = useState(null); // flattened PNG export, kept in sync by PanelDamageMarker
  const toggleDamagePanel = (panel) => setDamagePanels((p) => (p.includes(panel) ? p.filter((x) => x !== panel) : [...p, panel]));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmNoSignature, setConfirmNoSignature] = useState(false); // warning shown once, if they try to submit without signing
  const fileRef = useRef(null);

  // Duplicate-customer detection: as the person types, check for existing
  // customers/vehicles that might be the same one, so intake staff get a
  // visible flag instead of silently creating a second profile for someone
  // already in the system.
  const [possibleMatches, setPossibleMatches] = useState([]);
  const [matchDismissed, setMatchDismissed] = useState(false);
  const [plateMatch, setPlateMatch] = useState(null);
  const [ownerChoice, setOwnerChoice] = useState(null); // 'same' | 'different' | null (undecided)

  // VIN entries aren't guaranteed unique the way a plate is — staff have
  // flagged that two different cars can legitimately end up with the same
  // (or an incomplete) VIN on file. The "on file for" duplicate warning
  // below is only meaningful for real plates, so it's skipped entirely
  // in VIN mode; the chassis photo captured by PlatePicker is the actual
  // record in that case, not a database match.
  const [isVinMode, setIsVinMode] = useState(false);
  const [vinPhotos, setVinPhotos] = useState([]);

  // Pricing: which price list applies (known from an existing customer's
  // tag, or chosen fresh for a new one), the per-treatment prices (auto-
  // filled, editable), and a discount % applied on top — the single
  // mechanism covering both "walk-in discount up to 15%" and "B2B can go
  // lower than the reference price", per the shop's actual pricing model.
  const [customerType, setCustomerType] = useState(null); // 'retail' | 'b2b' | null (unset — new customer, not yet chosen)

  const [treatmentPrices, setTreatmentPrices] = useState({}); // "serviceKey::treatmentName" -> number
  const [discountPercent, setDiscountPercent] = useState(0);

  // If customer type is picked (or changed) AFTER a treatment was already
  // ticked, re-fill that treatment's price to match — otherwise a price
  // auto-filled before the type was known could silently stay wrong
  // (e.g. retail price left in place after switching to B2B).
  const prevCustomerType = useRef(customerType);
  useEffect(() => {
    if (prevCustomerType.current === customerType) return;
    prevCustomerType.current = customerType;
    setTreatmentPrices((p) => {
      const next = { ...p };
      Object.entries(treatments).forEach(([serviceKey, names]) => {
        const svc = SERVICES.find((s) => s.key === serviceKey);
        names.forEach((name) => {
          const t = svc?.treatments?.find((tr) => tr.name === name);
          if (!t) return;
          const priceKey = `${serviceKey}::${name}`;
          const listPrice = customerType === "b2b" ? t.b2b : t.retail;
          // Only auto-correct if the current value still matches what the
          // OTHER type's list price would have been — if staff manually
          // typed a custom number, leave their number alone.
          const otherListPrice = customerType === "b2b" ? t.retail : t.b2b;
          if (listPrice != null && String(next[priceKey]) === String(otherListPrice)) {
            next[priceKey] = listPrice;
          }
        });
      });
      return next;
    });
  }, [customerType]);

  useEffect(() => {
    setMatchDismissed(false);
    const query = customerPhone.trim() || customerName.trim();
    if (query.length < 3) { setPossibleMatches([]); return; }
    const t = setTimeout(async () => {
      const results = await searchCustomers(query);
      setPossibleMatches(results.slice(0, 3));
    }, 350);
    return () => clearTimeout(t);
  }, [customerName, customerPhone]);

  useEffect(() => {
    const p = plate.trim().toUpperCase();
    if (isVinMode || p.length < 3) { setPlateMatch(null); setOwnerChoice(null); return; }
    const t = setTimeout(async () => {
      const { ok, data } = await sbFetch(`vehicles?plate=eq.${encodeURIComponent(p)}&select=*,customers(name,phone,customer_type)&limit=1`);
      setPlateMatch(ok && data && data.length ? data[0] : null);
      setOwnerChoice(null);
    }, 350);
    return () => clearTimeout(t);
  }, [plate, isVinMode]);

  const toggleService = (key) => setServiceTypes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  const toggleTreatment = (serviceKey, treatmentObj) => {
    const name = treatmentObj.name;
    setTreatments((t) => {
      const current = t[serviceKey] || [];
      const next = current.includes(name) ? current.filter((x) => x !== name) : [...current, name];
      return { ...t, [serviceKey]: next };
    });
    const priceKey = `${serviceKey}::${name}`;
    setTreatmentPrices((p) => {
      const already = (treatments[serviceKey] || []).includes(name);
      if (already) {
        // Un-ticking: drop its price too.
        const next = { ...p };
        delete next[priceKey];
        return next;
      }
      // Ticking: auto-fill from the price list if we have one for this
      // customer type. No guess when we don't have a real number — stays
      // blank for manual entry, exactly as agreed.
      const listPrice = customerType === "b2b" ? treatmentObj.b2b : treatmentObj.retail;
      return { ...p, [priceKey]: listPrice != null ? listPrice : "" };
    });
  };
  const assign = (key, memberId) => setAssignedTo((a) => ({ ...a, [key]: a[key] === memberId ? undefined : memberId }));
  const addPhotos = async (files) => {
    const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    setPhotos((p) => [...p, ...compressed]);
  };

  const hasUnresolvedMismatch = !!(
    plateMatch && plateMatch.customers?.name && customerName.trim() &&
    customerName.trim().toLowerCase() !== plateMatch.customers.name.trim().toLowerCase() &&
    !ownerChoice
  );

  const submit = async () => {
    if (!plate.trim() || !customerName.trim() || hasUnresolvedMismatch || !termsAccepted) return;
    // Signature is encouraged, not required — but don't let it slip
    // through silently. First tap with no signature shows a one-time
    // warning; tapping again proceeds without it.
    if (!signature && !confirmNoSignature) { setConfirmNoSignature(true); return; }
    setSaving(true);
    const now = Date.now();
    const job = {
      // No client-side id here — the database assigns a real UUID on
      // insert (jobs.id defaults to gen_random_uuid()). We read the
      // assigned id back from Supabase's response after saving.
      plate: plate.trim().toUpperCase(),
      makeModel: makeModel.trim(),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      description: description.trim(),
      damageNotes: damageNotes.trim(),
      priority, location, serviceTypes, treatments,
      treatmentPrices, discountPercent, priceHistory: [],
      serviceDone: {},
      assignedTo,
      stageIndex: 0,
      photos: { intake: [...photos, ...vinPhotos], parts_removal: [], service: {}, },
      startTime: null, stopTime: null, invoiceAmount: "",
      signature, signedAt: signature ? now : null,
      damagePanels, damageDiagramImage,
      history: [{ stage: "intake", label: "Intake", by: session.name, role: session.role, note: "Job card opened — customer signed", at: now }],
      createdAt: now, updatedAt: now, createdBy: session.name,
    };
    const result = await createJob(job, { reassignVehicle: ownerChoice === "different", customerType });
    setSaving(false);
    if (!result.ok || !result.job.id) { setSaveError(true); return; }
    onCreated(result.job, result.ok);
  };

  return (
    <div className="mrcap-view" style={{ padding: "4px 18px 30px" }}>
      <SectionTitle>New Job Card</SectionTitle>
      <Field label="Plate number"><PlatePicker value={plate} onChange={setPlate} onModeChange={setIsVinMode} onVinPhotosChange={setVinPhotos} /></Field>

      {plateMatch && (
        <div className="mrcap-fade" style={{ background: "rgba(201,162,39,0.12)", border: `1px solid ${COLORS.gold}`, borderRadius: 10, padding: "11px 12px", marginTop: -8, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: COLORS.gold, fontWeight: 600, marginBottom: 3 }}>This plate is already on file</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>
            {plateMatch.make_model || "Vehicle"} — on file for: {plateMatch.customers?.name || "unknown"}{plateMatch.customers?.phone ? ` · ${plateMatch.customers.phone}` : ""}
          </div>

          {plateMatch.customers?.name && !customerName.trim() && (
            <button onClick={() => { setCustomerName(plateMatch.customers.name); setCustomerPhone(plateMatch.customers.phone || ""); setCustomerType(plateMatch.customers.customer_type === "b2b" ? "b2b" : "retail"); setOwnerChoice("same"); }} className="mrcap-press" style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: COLORS.darkText, background: COLORS.gold, border: "none", borderRadius: 7, padding: "6px 10px", cursor: "pointer" }}>
              Fill in {plateMatch.customers.name}'s details
            </button>
          )}

          {/* Real mismatch: a name was typed and it doesn't match the car's
              current owner on file — could be a typo, could be the car
              genuinely changed hands. Never guess; make staff choose. */}
          {plateMatch.customers?.name && customerName.trim() && customerName.trim().toLowerCase() !== plateMatch.customers.name.trim().toLowerCase() && (
            <div style={{ marginTop: 9 }}>
              <div style={{ fontSize: 11.5, color: "#E08A78", marginBottom: 6 }}>
                Name doesn't match the owner on file — is this the same customer, or has the car changed hands?
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setOwnerChoice("same")} className="mrcap-press" style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: "7px 8px", borderRadius: 7, cursor: "pointer", border: `1.5px solid ${ownerChoice === "same" ? COLORS.gold : COLORS.line}`, background: ownerChoice === "same" ? COLORS.gold : COLORS.panel2, color: ownerChoice === "same" ? COLORS.darkText : COLORS.ink }}>
                  Same customer (typo)
                </button>
                <button onClick={() => setOwnerChoice("different")} className="mrcap-press" style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: "7px 8px", borderRadius: 7, cursor: "pointer", border: `1.5px solid ${ownerChoice === "different" ? COLORS.gold : COLORS.line}`, background: ownerChoice === "different" ? COLORS.gold : COLORS.panel2, color: ownerChoice === "different" ? COLORS.darkText : COLORS.ink }}>
                  New owner now
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Field label="Make / model"><input style={inputStyle} value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="e.g. Prado" /></Field>
      <Field label="Customer name"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer full name" /></Field>
      <Field label="Customer phone"><input type="tel" inputMode="numeric" style={inputStyle} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, ""))} placeholder="050 xxx xxxx" /></Field>

      <Field label="Customer type">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setCustomerType("retail")} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${customerType === "retail" ? COLORS.gold : COLORS.line}`, background: customerType === "retail" ? COLORS.gold : COLORS.panel2, color: customerType === "retail" ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Retail / Walk-in</button>
          <button onClick={() => setCustomerType("b2b")} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${customerType === "b2b" ? COLORS.gold : COLORS.line}`, background: customerType === "b2b" ? COLORS.gold : COLORS.panel2, color: customerType === "b2b" ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>B2B</button>
        </div>
      </Field>

      {possibleMatches.length > 0 && !matchDismissed && (
        <div className="mrcap-fade" style={{ background: "rgba(201,162,39,0.12)", border: `1px solid ${COLORS.gold}`, borderRadius: 10, padding: "11px 12px", marginTop: -8, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: COLORS.gold, fontWeight: 600, marginBottom: 6 }}>Possible existing customer{possibleMatches.length > 1 ? "s" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {possibleMatches.map((c) => (
              <button key={c.id} onClick={() => { setCustomerName(c.name); if (c.phone) setCustomerPhone(c.phone); setCustomerType(c.customer_type === "b2b" ? "b2b" : "retail"); setMatchDismissed(true); }} className="mrcap-press" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.panel2, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 12.5, color: COLORS.ink }}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</span>{c.customer_type === "b2b" && <Pill tone="purple">B2B</Pill>}
                <span style={{ fontSize: 10.5, color: COLORS.gold, fontWeight: 600 }}>Use this</span>
              </button>
            ))}
          </div>
          <button onClick={() => setMatchDismissed(true)} className="mrcap-press" style={{ marginTop: 8, fontSize: 11, color: COLORS.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            No, this is a different person
          </button>
        </div>
      )}

      <Field label="Priority">
        <div style={{ display: "flex", gap: 8 }}>
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => setPriority(p)} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${priority === p ? COLORS.gold : COLORS.line}`, background: priority === p ? COLORS.gold : COLORS.panel2, color: priority === p ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{p}</button>
          ))}
        </div>
      </Field>

      <Field label="Location">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LOCATIONS.map((l) => (
            <button key={l} onClick={() => setLocation(l)} className="mrcap-press" style={{ padding: "10px", borderRadius: 9, border: `1.5px solid ${location === l ? COLORS.gold : COLORS.line}`, background: location === l ? COLORS.gold : COLORS.panel2, color: location === l ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}>{l}</button>
          ))}
        </div>
      </Field>

      <Field label="Service needed (select all that apply)">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleServices(serviceTypes).map((s) => {
            const candidates = team.filter((m) => m.role === s.role);
            return (
              <div key={s.key}>
                <button onClick={() => toggleService(s.key)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.line}`, background: serviceTypes.includes(s.key) ? "rgba(74,122,87,0.18)" : COLORS.panel2, cursor: "pointer", width: "100%" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.muted}`, background: serviceTypes.includes(s.key) ? COLORS.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {serviceTypes.includes(s.key) && <Check size={12} color="#fff" />}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</span>
                </button>
                {serviceTypes.includes(s.key) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 4px 2px 4px" }}>
                    {candidates.length === 0 && <span style={{ fontSize: 11.5, color: COLORS.muted }}>No one set up for this role yet — assign later from Team.</span>}
                    {candidates.map((m) => (
                      <button key={m.id} onClick={() => assign(s.key, m.id)} className="mrcap-press" style={{ padding: "6px 10px", borderRadius: 999, border: `1.5px solid ${assignedTo[s.key] === m.id ? COLORS.gold : COLORS.line}`, background: assignedTo[s.key] === m.id ? COLORS.gold : COLORS.panel2, color: assignedTo[s.key] === m.id ? COLORS.darkText : COLORS.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{m.name}</button>
                    ))}
                  </div>
                )}
                {serviceTypes.includes(s.key) && s.treatments && (
                  <div style={{ padding: "6px 4px 4px 4px" }}>
                    <div style={{ fontSize: 10.5, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Which treatment(s)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {s.treatments.map((t) => {
                        const picked = (treatments[s.key] || []).includes(t.name);
                        const priceKey = `${s.key}::${t.name}`;
                        const hasListPrice = t.retail != null;
                        return (
                          <div key={t.name}>
                            <button onClick={() => toggleTreatment(s.key, t)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 9px", borderRadius: 7, border: `1px solid ${picked ? COLORS.gold : COLORS.line}`, background: picked ? "rgba(201,162,39,0.12)" : COLORS.panel, cursor: "pointer", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${picked ? COLORS.gold : COLORS.muted}`, background: picked ? COLORS.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {picked && <Check size={9} color={COLORS.darkText} />}
                                </div>
                                <span style={{ fontSize: 12, color: COLORS.ink }}>{t.name}</span>
                              </span>
                              {hasListPrice && !customerType && <span style={{ fontSize: 10, color: COLORS.muted }}>pick customer type</span>}
                            </button>
                            {picked && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px 0 30px" }}>
                                <span style={{ fontSize: 10.5, color: COLORS.muted }}>AED</span>
                                <input
                                  type="number"
                                  value={treatmentPrices[priceKey] ?? ""}
                                  onChange={(e) => setTreatmentPrices((p) => ({ ...p, [priceKey]: e.target.value }))}
                                  placeholder={hasListPrice ? "" : "type price"}
                                  style={{ width: 90, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 11.5, color: COLORS.gold, fontFamily: MONO_FONT }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      {Object.keys(treatmentPrices).length > 0 && (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginBottom: 8 }}>
            <span>Subtotal</span>
            <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>AED {Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0).toLocaleString()}</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <DiscountPicker value={discountPercent} onChange={setDiscountPercent} subtotal={Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0)} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.line}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>Total</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.gold }}>
              AED {Math.round(Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0) * (1 - discountPercent / 100)).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <Field label="Job description / requested work">
        <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the customer wants done" />
      </Field>
      <Field label="Damages / scratches / missing items found">
        <textarea style={textareaStyle} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} placeholder="Walk-around notes" />
      </Field>
      <Field label="Intake photos">
        <PhotoGrid photos={photos} onRemove={(i) => setPhotos((p) => p.filter((_, idx) => idx !== i))} />
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addPhotos(e.target.files)} />
        <button onClick={() => fileRef.current.click()} className="mrcap-press" style={cameraBtnStyle}><Camera size={15} /> Add photo</button>
      </Field>

      {serviceTypes.includes("bodyshop") && (
        <Field label="Body damage — which panels & where">
          <PanelDamageMarker selectedPanels={damagePanels} onTogglePanel={toggleDamagePanel} marks={damageMarks} onMarksChange={setDamageMarks} onImageChange={setDamageDiagramImage} />
        </Field>
      )}

      <Field label="Terms & Conditions">
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 12, maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{TERMS_AND_CONDITIONS_TEXT}</div>
        </div>
        <button onClick={() => setTermsAccepted((v) => !v)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${termsAccepted ? COLORS.green : COLORS.line}`, background: termsAccepted ? "rgba(74,122,87,0.15)" : COLORS.panel2, cursor: "pointer" }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${termsAccepted ? COLORS.green : COLORS.muted}`, background: termsAccepted ? COLORS.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {termsAccepted && <Check size={11} color="#fff" />}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>Customer agrees to the terms above</span>
        </button>
      </Field>

      <Field label="Customer signature">
        <SignaturePad value={signature} onChange={setSignature} />
      </Field>

      {saveError && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#E08A78" }}>
          Couldn't save to the server. {lastStorageError && <span style={{ fontFamily: "monospace", display: "block", marginTop: 4, fontSize: 10.5 }}>{lastStorageError}</span>}
        </div>
      )}

      {confirmNoSignature && !signature && (
        <div className="mrcap-fade" style={{ background: "rgba(201,162,39,0.12)", border: `1.5px solid ${COLORS.gold}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: COLORS.gold, fontWeight: 600, marginBottom: 4 }}>No signature captured</div>
          <div style={{ fontSize: 11.5, color: COLORS.muted, lineHeight: 1.4 }}>This is fine for B2B or when the signer isn't present — tap "Open Job Card" again to continue without one, or scroll up to add it.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={!plate.trim() || !customerName.trim() || saving || hasUnresolvedMismatch || !termsAccepted} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2, opacity: !plate.trim() || !customerName.trim() || hasUnresolvedMismatch || !termsAccepted ? 0.5 : 1 }}>
          {saving ? "Saving…" : !termsAccepted ? "Accept terms to continue" : !signature && !confirmNoSignature ? "Open Job Card" : !signature ? "Continue without signature" : "Open Job Card"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Job Detail ---------------- */

/* ---------------- Edit Job (admin-only) ---------------- */
// Reuses the same field patterns as NewJobForm, pre-filled from the
// existing job. Every changed field is diffed against the original and
// written as its own history entry — "Ahmed changed plate from X to Y" —
// so a correction is always visible, never a silent overwrite.
// Reusable "Parts & fees" editor — used in the New Job / Edit Job forms,
// directly on the main job card, and on quotations. One shared component
// so the exact same behavior (Part vs Fee toggle, cost/margin tracking)
// stays consistent everywhere parts show up, instead of drifting apart
// as separate copies get tweaked independently over time.
function PartsEditor({ parts, onChange, showTotal }) {
  const addPart = () => onChange([...parts, { id: uid("part"), type: "part", description: "", supplier: "", cost: "", price: "", qty: 1, discountPercent: 0 }]);
  const updatePart = (id, field, value) => onChange(parts.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const removePart = (id) => onChange(parts.filter((p) => p.id !== id));

  const sellTotal = parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {parts.map((p) => (
        <div key={p.id} style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => updatePart(p.id, "type", "part")} className="mrcap-press" style={{ flex: 1, padding: "6px", borderRadius: 7, border: `1.5px solid ${p.type !== "fee" ? COLORS.gold : COLORS.line}`, background: p.type !== "fee" ? COLORS.gold : COLORS.panel, color: p.type !== "fee" ? COLORS.darkText : COLORS.muted, fontWeight: 600, fontSize: 11.5, cursor: "pointer" }}>Part</button>
            <button onClick={() => updatePart(p.id, "type", "fee")} className="mrcap-press" style={{ flex: 1, padding: "6px", borderRadius: 7, border: `1.5px solid ${p.type === "fee" ? COLORS.gold : COLORS.line}`, background: p.type === "fee" ? COLORS.gold : COLORS.panel, color: p.type === "fee" ? COLORS.darkText : COLORS.muted, fontWeight: 600, fontSize: 11.5, cursor: "pointer" }}>Fee</button>
            <button onClick={() => removePart(p.id)} className="mrcap-press" style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${COLORS.line}`, background: "none", color: COLORS.red, cursor: "pointer" }}><X size={13} /></button>
          </div>
          <input value={p.description} onChange={(e) => updatePart(p.id, "description", e.target.value)} placeholder={p.type === "fee" ? "e.g. Tow truck recovery fee" : "e.g. Kings Shocks"} style={{ ...inputStyle, marginTop: 0 }} />
          {p.type !== "fee" && (
            <input value={p.supplier} onChange={(e) => updatePart(p.id, "supplier", e.target.value)} placeholder="Supplier (optional)" style={{ ...inputStyle, marginTop: 0, fontSize: 12.5 }} />
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: COLORS.muted, marginBottom: 3 }}>Qty</div>
              <input type="number" value={p.qty} onChange={(e) => updatePart(p.id, "qty", e.target.value)} style={{ ...inputStyle, marginTop: 0, padding: "8px 9px" }} />
            </div>
            <div style={{ flex: 1.4 }}>
              <div style={{ fontSize: 9.5, color: COLORS.muted, marginBottom: 3 }}>Price (AED, sell)</div>
              <input type="number" value={p.price} onChange={(e) => updatePart(p.id, "price", e.target.value)} style={{ ...inputStyle, marginTop: 0, padding: "8px 9px", color: COLORS.gold, fontFamily: MONO_FONT }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: COLORS.muted, marginBottom: 3 }}>Disc. %</div>
              <input type="number" value={p.discountPercent} onChange={(e) => updatePart(p.id, "discountPercent", e.target.value)} style={{ ...inputStyle, marginTop: 0, padding: "8px 9px" }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, color: COLORS.muted, marginBottom: 3 }}>Cost — what we paid (optional, for your own margin tracking, not shown to the customer)</div>
            <input type="number" value={p.cost} onChange={(e) => updatePart(p.id, "cost", e.target.value)} placeholder="e.g. 12,000" style={{ ...inputStyle, marginTop: 0, padding: "8px 9px" }} />
          </div>
          {p.cost !== "" && p.price !== "" && (
            <div style={{ fontSize: 10.5, color: (Number(p.price) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100) - Number(p.cost) * (Number(p.qty) || 1)) >= 0 ? COLORS.green : COLORS.red }}>
              Margin: AED {Math.round((Number(p.price) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100)) - (Number(p.cost) * (Number(p.qty) || 1))).toLocaleString()}
            </div>
          )}
        </div>
      ))}
      <button onClick={addPart} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.08)", color: COLORS.gold, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
        <Plus size={14} /> Add Part or Fee
      </button>
      {showTotal && parts.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted, padding: "2px 2px 0" }}>
          <span>Parts & fees total</span>
          <span style={{ fontWeight: 700, color: COLORS.ink }}>AED {Math.round(sellTotal).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function EditJobScreen({ job, session, onSaved, onCancel }) {
  const [plate, setPlate] = useState(job.plate);
  const [makeModel, setMakeModel] = useState(job.makeModel);
  const [customerName, setCustomerName] = useState(job.customerName);
  const [customerPhone, setCustomerPhone] = useState(job.customerPhone);
  const [description, setDescription] = useState(job.description);
  const [damageNotes, setDamageNotes] = useState(job.damageNotes);
  const [priority, setPriority] = useState(job.priority);
  const [location, setLocation] = useState(job.location);
  const [serviceTypes, setServiceTypes] = useState(job.serviceTypes || []);
  const [treatments, setTreatments] = useState(job.treatments || {});
  const [treatmentPrices, setTreatmentPrices] = useState(job.treatmentPrices || {});
  const [discountPercent, setDiscountPercent] = useState(job.discountPercent || 0);
  const [parts, setParts] = useState(job.parts || []);
  const [warrantyExpiry, setWarrantyExpiry] = useState(job.warrantyExpiry || "");
  const [followupDate, setFollowupDate] = useState(job.followupDate || "");
  const [followupNote, setFollowupNote] = useState(job.followupNote || "");
  const [saving, setSaving] = useState(false);

  // Unticking a service must also drop its treatments and their prices —
  // otherwise stale picks/prices linger in state and either reappear if
  // the service gets re-ticked in the same session, or get saved as
  // orphaned data even though the service itself was removed.
  const toggleService = (key) => {
    setServiceTypes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
    const isRemoving = serviceTypes.includes(key);
    if (isRemoving) {
      setTreatments((cur) => { const next = { ...cur }; delete next[key]; return next; });
      setTreatmentPrices((p) => {
        const next = {};
        Object.entries(p).forEach(([k, v]) => { if (!k.startsWith(`${key}::`)) next[k] = v; });
        return next;
      });
    }
  };
  const toggleTreatment = (serviceKey, t) => {
    const name = t.name;
    setTreatments((cur) => {
      const list = cur[serviceKey] || [];
      const next = list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
      return { ...cur, [serviceKey]: next };
    });
    const priceKey = `${serviceKey}::${name}`;
    setTreatmentPrices((p) => {
      const already = (treatments[serviceKey] || []).includes(name);
      if (already) { const next = { ...p }; delete next[priceKey]; return next; }
      return { ...p, [priceKey]: t.retail != null ? t.retail : "" };
    });
  };


  // External parts (a door, a windshield, off-road lights, rare rims —
  // whatever gets bought in for a custom job) are their own list, kept
  // separate from the service/treatment catalog since they're one-off
  // items tied to this specific job, not something to add to the shop's
  // standing price list.
  const save = async () => {
    setSaving(true);
    const now = Date.now();
    const changes = [];
    const diff = (label, before, after) => { if (String(before ?? "") !== String(after ?? "")) changes.push(`${label}: "${before || "—"}" → "${after || "—"}"`); };
    diff("Plate", job.plate, plate.trim().toUpperCase());
    diff("Customer name", job.customerName, customerName.trim());
    diff("Customer phone", job.customerPhone, customerPhone.trim());
    diff("Make/model", job.makeModel, makeModel.trim());
    diff("Description", job.description, description.trim());
    diff("Damage notes", job.damageNotes, damageNotes.trim());
    diff("Priority", job.priority, priority);
    diff("Location", job.location, location);
    diff("Discount", `${job.discountPercent || 0}%`, `${discountPercent}%`);
    // Every individual treatment price change gets its own logged line —
    // "every price change should be logged: old amount, new amount, who,
    // when" was explicit, so this can't just ride along inside the
    // generic diff list silently.
    Object.keys(treatmentPrices).forEach((priceKey) => {
      const before = (job.treatmentPrices || {})[priceKey];
      const after = treatmentPrices[priceKey];
      if (String(before ?? "") !== String(after ?? "")) {
        const treatmentName = priceKey.split("::")[1] || priceKey;
        changes.push(`Price — ${treatmentName}: AED ${before || "0"} → AED ${after || "0"}`);
      }
    });
    const addedServices = serviceTypes.filter((k) => !(job.serviceTypes || []).includes(k));
    const removedServices = (job.serviceTypes || []).filter((k) => !serviceTypes.includes(k));
    addedServices.forEach((k) => changes.push(`Added service: ${SERVICES.find((s) => s.key === k)?.label || k}`));
    removedServices.forEach((k) => changes.push(`Removed service: ${SERVICES.find((s) => s.key === k)?.label || k}`));

    // Parts/fees get the same "every change is logged" treatment as
    // treatment prices — added, removed, or edited, each gets its own line.
    const beforePartsById = Object.fromEntries((job.parts || []).map((p) => [p.id, p]));
    const afterPartsById = Object.fromEntries(parts.map((p) => [p.id, p]));
    parts.forEach((p) => {
      const before = beforePartsById[p.id];
      const label = p.description || (p.type === "fee" ? "Fee" : "Part");
      if (!before) {
        changes.push(`Added ${p.type === "fee" ? "fee" : "part"}: ${label} — AED ${p.price || 0} x${p.qty || 1}`);
      } else if (
        String(before.description || "") !== String(p.description || "") ||
        String(before.price ?? "") !== String(p.price ?? "") ||
        String(before.qty ?? "") !== String(p.qty ?? "") ||
        String(before.discountPercent ?? "") !== String(p.discountPercent ?? "") ||
        String(before.cost ?? "") !== String(p.cost ?? "")
      ) {
        changes.push(`Edited ${p.type === "fee" ? "fee" : "part"}: ${label} — AED ${p.price || 0} x${p.qty || 1}${p.discountPercent ? ` (${p.discountPercent}% off)` : ""}`);
      }
    });
    (job.parts || []).forEach((p) => {
      if (!afterPartsById[p.id]) changes.push(`Removed ${p.type === "fee" ? "fee" : "part"}: ${p.description || (p.type === "fee" ? "Fee" : "Part")}`);
    });

    const updated = {
      ...job,
      plate: plate.trim().toUpperCase(), makeModel: makeModel.trim(),
      customerName: customerName.trim(), customerPhone: customerPhone.trim(),
      description: description.trim(), damageNotes: damageNotes.trim(),
      priority, location, serviceTypes, treatments, treatmentPrices, discountPercent, parts,
      warrantyExpiry: warrantyExpiry || null, followupDate: followupDate || null, followupNote: followupNote.trim() || null,
      // Removing a service drops its done/assign/review state too, but the
      // fact it was removed (and by whom) stays in history permanently.
      serviceDone: Object.fromEntries(Object.entries(job.serviceDone || {}).filter(([k]) => serviceTypes.includes(k))),
      assignedTo: Object.fromEntries(Object.entries(job.assignedTo || {}).filter(([k]) => serviceTypes.includes(k))),
      history: changes.length
        ? [...job.history, { stage: "edit", label: "Job edited", by: session.name, role: session.role, note: changes.join("; "), at: now }]
        : job.history,
      updatedAt: now,
    };
    const saved = await saveJob(updated);
    setSaving(false);
    onSaved(updated, saved);
  };

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
      <SectionTitle>Edit Job Card</SectionTitle>
      <Field label="Plate number"><input style={{ ...inputStyle, fontFamily: MONO_FONT, letterSpacing: 0.5 }} value={plate} onChange={(e) => setPlate(e.target.value)} /></Field>
      <Field label="Make / model"><input style={inputStyle} value={makeModel} onChange={(e) => setMakeModel(e.target.value)} /></Field>
      <Field label="Customer name"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
      <Field label="Customer phone"><input type="tel" inputMode="numeric" style={inputStyle} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, ""))} /></Field>

      <Field label="Priority">
        <div style={{ display: "flex", gap: 8 }}>
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => setPriority(p)} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${priority === p ? COLORS.gold : COLORS.line}`, background: priority === p ? COLORS.gold : COLORS.panel2, color: priority === p ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{p}</button>
          ))}
        </div>
      </Field>
      <Field label="Location">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LOCATIONS.map((l) => (
            <button key={l} onClick={() => setLocation(l)} className="mrcap-press" style={{ padding: "10px", borderRadius: 9, border: `1.5px solid ${location === l ? COLORS.gold : COLORS.line}`, background: location === l ? COLORS.gold : COLORS.panel2, color: location === l ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", textAlign: "left" }}>{l}</button>
          ))}
        </div>
      </Field>

      <Field label="Services & treatments">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleServices(serviceTypes).map((s) => (
            <div key={s.key}>
              <button onClick={() => toggleService(s.key)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.line}`, background: serviceTypes.includes(s.key) ? "rgba(74,122,87,0.18)" : COLORS.panel2, cursor: "pointer", width: "100%" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.muted}`, background: serviceTypes.includes(s.key) ? COLORS.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {serviceTypes.includes(s.key) && <Check size={12} color="#fff" />}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</span>
              </button>
              {serviceTypes.includes(s.key) && s.treatments && (
                <div style={{ padding: "8px 4px 4px 4px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {s.treatments.map((t) => {
                    const picked = (treatments[s.key] || []).includes(t.name);
                    const priceKey = `${s.key}::${t.name}`;
                    return (
                      <div key={t.name}>
                        <button onClick={() => toggleTreatment(s.key, t)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 7, border: `1px solid ${picked ? COLORS.gold : COLORS.line}`, background: picked ? "rgba(201,162,39,0.12)" : COLORS.panel, cursor: "pointer", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${picked ? COLORS.gold : COLORS.muted}`, background: picked ? COLORS.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {picked && <Check size={9} color={COLORS.darkText} />}
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.ink }}>{t.name}</span>
                        </button>
                        {picked && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px 0 30px" }}>
                            <span style={{ fontSize: 10.5, color: COLORS.muted }}>AED</span>
                            <input type="number" value={treatmentPrices[priceKey] ?? ""} onChange={(e) => setTreatmentPrices((p) => ({ ...p, [priceKey]: e.target.value }))} style={{ width: 90, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 11.5, color: COLORS.gold, fontFamily: MONO_FONT }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Field>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginBottom: 8 }}>
          <span>Services subtotal</span>
          <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>AED {Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0).toLocaleString()}</span>
        </div>
        <div style={{ marginBottom: 4 }}>
          <DiscountPicker value={discountPercent} onChange={setDiscountPercent} subtotal={Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0)} />
        </div>
        {parts.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.line}` }}>
            <span>Parts & fees ({parts.length})</span>
            <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>
              AED {Math.round(parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)).toLocaleString()}
            </span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.line}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>Total</span>
          <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.gold }}>
            AED {Math.round(
              Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0) * (1 - discountPercent / 100)
              + parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)
            ).toLocaleString()}
          </span>
        </div>
      </div>

      <Field label="Parts & fees (sourced externally — doors, windshields, rims, tow recovery, etc.)">
        <PartsEditor parts={parts} onChange={setParts} />
      </Field>

      <Field label="Warranty expiry (optional — e.g. PPF coverage)">
        <input type="date" style={inputStyle} value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} />
      </Field>
      <Field label="Follow-up reminder (optional)">
        <input type="date" style={inputStyle} value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />
        {followupDate && (
          <input style={{ ...inputStyle, marginTop: 8 }} value={followupNote} onChange={(e) => setFollowupNote(e.target.value)} placeholder="Why follow up? e.g. Ceramic reapplication due" />
        )}
      </Field>
      <Field label="Job description / requested work">
        <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Damages / scratches / missing items found">
        <textarea style={textareaStyle} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
        <button onClick={save} disabled={saving || !plate.trim() || !customerName.trim()} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2, opacity: saving || !plate.trim() || !customerName.trim() ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function JobDetail({ id, initialJob, session, team, onChanged, onBack, canArchive, onDeleted }) {
  const [job, setJob] = useState(initialJob || null);
  const [loadError, setLoadError] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const completionFileRef = useRef(null);
  const [uploadingCompletion, setUploadingCompletion] = useState(false);
  const [markupDesc, setMarkupDesc] = useState("");
  const [markupCost, setMarkupCost] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");
  const [markupPhotos, setMarkupPhotos] = useState([]);
  const markupFileRef = useRef(null);
  const [uploadingMarkupPhoto, setUploadingMarkupPhoto] = useState(false);
  const [markupPhotoViewer, setMarkupPhotoViewer] = useState(null); // { photos: [{src,label}], index }
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [savingStatusNote, setSavingStatusNote] = useState(false);
  const [customStatusNote, setCustomStatusNote] = useState("");
  const addCompletionPhotos = async (files) => {
    setUploadingCompletion(true);
    const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    const updated = {
      ...job,
      photos: { ...job.photos, completion: [...(job.photos.completion || []), ...compressed] },
      updatedAt: Date.now(),
    };
    const saved = await saveJob(updated);
    setJob(updated);
    setUploadingCompletion(false);
    onChanged(updated, saved);
  };
  const [pickerFor, setPickerFor] = useState(null); // service key currently showing the reassign list

  // Three sub-screens inside JobDetail that aren't top-level view changes
  // (the global view stays "detail" throughout) but still feel like a
  // distinct screen to close with back: the intro photo viewer, the
  // damage-diagram viewer, and Edit mode. Each pushes its own history
  // entry on open; one shared listener below closes whichever is open
  // when the browser/device back button fires.
  const [viewerIndex, setViewerIndexRaw] = useState(null); // full-screen photo viewer position
  const setViewerIndex = useCallback((next) => {
    setViewerIndexRaw((prev) => {
      if (prev === null && next !== null) window.history.pushState({ mrcapPhotoViewerOpen: true }, "");
      return next;
    });
  }, []);
  const [damageViewerOpen, setDamageViewerOpenRaw] = useState(false);
  const setDamageViewerOpen = useCallback((next) => {
    if (next) {
      window.history.pushState({ mrcapDamageViewerOpen: true }, "");
      setDamageViewerOpenRaw(true);
    } else {
      setDamageViewerOpenRaw(false);
    }
  }, []);
  const [editing, setEditingRaw] = useState(false); // admin-only Edit Job mode
  const setEditing = useCallback((next) => {
    if (next) {
      window.history.pushState({ mrcapJobEditing: true }, "");
      setEditingRaw(true);
    } else {
      setEditingRaw(false);
    }
  }, []);
  useEffect(() => {
    const onPop = (e) => {
      const state = e.state || {};
      if (!state.mrcapJobEditing) setEditingRaw(false);
      if (!state.mrcapPhotoViewerOpen) setViewerIndexRaw(null);
      if (!state.mrcapDamageViewerOpen) setDamageViewerOpenRaw(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [showReverseConfirm, setShowReverseConfirm] = useState(false); // admin-only stage-reversal panel
  const [clearReviewsOnReverse, setClearReviewsOnReverse] = useState(false);
  const [showHoldPrompt, setShowHoldPrompt] = useState(false); // admin/intake-only "put on hold" note entry
  const [holdNoteInput, setHoldNoteInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // first tap
  const [deleteConfirmText, setDeleteConfirmText] = useState(""); // must type DELETE to actually confirm
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const j = await loadJob(id);
    if (j) setJob(j);
    else if (!initialJob) setLoadError(true); // only an error if we had nothing to fall back on
  }, [id, initialJob]);
  // Only hit the server if we don't already have the job in memory (e.g.
  // opened from the board rather than just created/edited here).
  useEffect(() => { if (!initialJob) load(); }, [load, initialJob]);

  if (!job && loadError) {
    return (
      <div style={{ padding: "50px 24px", textAlign: "center" }}>
        <ShieldAlert size={26} color={COLORS.red} style={{ marginBottom: 10 }} />
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 16, color: COLORS.ink }}>Couldn't reach the server</div>
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 6, marginBottom: 14 }}>This job card couldn't be loaded. Check your connection and try again.</div>
        <button onClick={load} style={{ ...primaryBtnStyle, padding: "10px 20px" }}>Retry</button>
      </div>
    );
  }
  if (!job) return <div style={{ padding: 30, color: COLORS.muted, textAlign: "center" }}>Loading job card…</div>;

  if (job.stageIndex >= STAGES.length - 1 && !canArchive) {
    return (
      <div style={{ padding: "50px 24px", textAlign: "center" }}>
        <ShieldAlert size={26} color={COLORS.muted} style={{ marginBottom: 10 }} />
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 16, color: COLORS.ink }}>Archived — restricted</div>
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 6 }}>This job card has been collected. Ask an admin if you need access to its history.</div>
      </div>
    );

  }

  const stage = STAGES[job.stageIndex];
  const isLast = job.stageIndex >= STAGES.length - 1;
  const nextStage = STAGES[job.stageIndex + 1];
  const activeServices = SERVICES.filter((s) => job.serviceTypes.includes(s.key));
  // A service with a reviewer requirement (PPF & Films) only counts as
  // truly done once both the doer has checked it AND the reviewer has
  // signed off — matching Ahmed's real oversight role on tint/film work.
  const isServiceComplete = (s) => job.serviceDone[s.key] && (!s.reviewerRole || (job.serviceReviewed || {})[s.key]);
  const allServicesDone = activeServices.every(isServiceComplete);

  const addPendingPhotos = async (files) => {
    const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    setPendingPhotos((p) => [...p, ...compressed]);
  };

  // A shop-floor role can undo ONLY their own most recent "Marked done" on
  // this specific service — not anyone else's, and not an older action of
  // their own once someone else has touched it since. Admins/Intake have
  // no such restriction (their edit power is unlimited, per the Edit Job
  // screen). This is what "everyone can fix their own honest mistake,
  // without full edit power" actually means in practice.
  const canToggleService = (key) => {
    if (!ROLE_DEFS[session.role]?.simplified) return true;
    if (!job.serviceDone[key]) return true; // marking done for the first time is always fine
    const relevant = (job.history || []).filter((h) => h.stage === "service" && (SERVICES.find((s) => s.key === key)?.label) === h.label);
    const last = relevant[relevant.length - 1];
    return last && last.by === session.name && last.note === "Marked done";
  };

  const toggleServiceDone = async (key) => {
    if (!canToggleService(key)) return;
    const nowDone = !job.serviceDone[key];
    const svc = SERVICES.find((s) => s.key === key);
    const now = Date.now();
    const updated = {
      ...job,
      serviceDone: { ...job.serviceDone, [key]: nowDone },
      // Real accountability trail: record who cleared (or un-cleared)
      // this specific service and when — this is what "Cleared by me"
      // and any future audit actually reads, not just a status flip.
      history: [...job.history, { stage: "service", label: svc?.label || key, by: session.name, role: session.role, note: nowDone ? "Marked done" : "Un-marked", at: now }],
      updatedAt: now,
    };
    const saved = await saveJob(updated);
    setJob(updated);
    onChanged(updated, saved);
  };

  const setServiceNote = async (key, text) => {
    const updated = { ...job, serviceNotes: { ...(job.serviceNotes || {}), [key]: text }, updatedAt: Date.now() };
    const saved = await saveJob(updated);
    setJob(updated);
    onChanged(updated, saved);
  };

  // Markup calculator — cost + % in, charge price out, saved as a line
  // on the job so it's there to look back on. Independent of the
  // formal parts/invoice system (job.parts) on purpose: this is a
  // quick internal reference, gated by its own permission, not tied
  // to the invoice-building flow.
  const addMarkupEntry = async () => {
    const cost = Number(markupCost);
    const pct = Number(markupPercent);
    if (!cost || cost <= 0 || !Number.isFinite(pct)) return;
    setSavingMarkup(true);
    const entry = {
      id: uid("markup"),
      description: markupDesc.trim() || "Untitled",
      cost, markupPercent: pct,
      chargePrice: Math.round(cost * (1 + pct / 100) * 100) / 100,
      photos: markupPhotos,
      createdAt: Date.now(), createdBy: session.name,
    };
    const updated = { ...job, markupEntries: [...(job.markupEntries || []), entry], updatedAt: Date.now() };
    const saved = await saveJob(updated);
    setJob(updated);
    setMarkupDesc(""); setMarkupCost(""); setMarkupPercent(""); setMarkupPhotos([]);
    setSavingMarkup(false);
    onChanged(updated, saved);
  };

  // Photos for the entry currently being composed (bill/receipt shots,
  // not yet attached to a saved entry) — same compressImage pipeline as
  // every other photo in the app, purely for internal reference. Never
  // rendered on the invoice/quote PDFs or sent to a customer anywhere.
  const addMarkupPhotos = async (files) => {
    setUploadingMarkupPhoto(true);
    const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    setMarkupPhotos((cur) => [...cur, ...compressed]);
    setUploadingMarkupPhoto(false);
  };
  const removeMarkupPhoto = (i) => setMarkupPhotos((cur) => cur.filter((_, idx) => idx !== i));

  const removeMarkupEntry = async (entryId) => {
    const updated = { ...job, markupEntries: (job.markupEntries || []).filter((e) => e.id !== entryId), updatedAt: Date.now() };
    const saved = await saveJob(updated);
    setJob(updated);
    onChanged(updated, saved);
  };

  // Parts & fees, editable straight from the main job card now instead
  // of only inside Edit Job — same PartsEditor component, same data
  // (job.parts), just an inline save on every change like the other
  // quick-edit handlers on this screen.
  const updateJobParts = async (newParts) => {
    const updated = { ...job, parts: newParts, updatedAt: Date.now() };
    const saved = await saveJob(updated);
    setJob(updated);
    onChanged(updated, saved);
  };

  // What shows on the customer's public tracking page, beyond the
  // coarse 6-stage strip — e.g. "In polish" or "Waiting on parts".
  // Picking a preset (or typing a custom line) saves immediately, same
  // pattern as everything else on this screen.
  const saveCustomerStatusNote = async (text) => {
    setSavingStatusNote(true);
    const updated = { ...job, customerStatusNote: text.trim() || null, customerStatusUpdatedAt: Date.now(), updatedAt: Date.now() };
    const saved = await saveJob(updated);
    setJob(updated);
    setSavingStatusNote(false);
    setCustomStatusNote("");
    onChanged(updated, saved);
  };

  const reviewService = async (key) => {
    const current = (job.serviceReviewed || {})[key];
    const updated = {
      ...job,
      serviceReviewed: { ...(job.serviceReviewed || {}), [key]: current ? undefined : { by: session.name, at: Date.now() } },
      updatedAt: Date.now(),
    };
    const saved = await saveJob(updated);
    setJob(updated);
    onChanged(updated, saved);
  };

  const assignService = async (key, memberId) => {
    const current = (job.assignedTo || {})[key];
    const svc = SERVICES.find((s) => s.key === key);
    const newlyAssignedMember = team.find((m) => m.id === memberId);
    const now = Date.now();
    const isUnassigning = current === memberId;
    const updated = {
      ...job,
      assignedTo: { ...(job.assignedTo || {}), [key]: isUnassigning ? undefined : memberId },
      history: [...job.history, { stage: "service", label: svc?.label || key, by: session.name, role: session.role, note: isUnassigning ? "Unassigned" : `Assigned to ${newlyAssignedMember?.name || "someone"}`, at: now }],
      updatedAt: now,
    };
    const saved = await saveJob(updated);
    setJob(updated);
    setPickerFor(null);
    onChanged(updated, saved);
  };

  const advance = async () => {
    if (stage.key === "service" && !allServicesDone) return;
    setBusy(true);
    const now = Date.now();
    const updated = { ...job };
    if (stage.key === "parts_removal" && pendingPhotos.length) {
      updated.photos = { ...updated.photos, parts_removal: [...(updated.photos.parts_removal || []), ...pendingPhotos] };
    }
    updated.history = [...updated.history, { stage: stage.key, label: stage.label, by: session.name, role: session.role, note: note.trim() || undefined, at: now }];
    updated.stageIndex = Math.min(job.stageIndex + 1, STAGES.length - 1);
    updated.updatedAt = now;
    const saved = await saveJob(updated);
    setJob(updated);
    setNote(""); setPendingPhotos([]); setBusy(false);
    onChanged(updated, saved);
  };

  // Admin-only: send a job back a stage, from ANY stage including
  // Collected. Optionally clears review sign-offs too — the admin
  // chooses per situation via a checkbox, since sometimes the redone work
  // genuinely needs re-review and sometimes the original sign-off still
  // holds. Always logged explicitly, never silent.
  const reverseStage = async (clearReviews) => {
    if (job.stageIndex === 0) return;
    setBusy(true);
    const now = Date.now();
    const fromStage = STAGES[job.stageIndex];
    const toStage = STAGES[job.stageIndex - 1];
    const updated = {
      ...job,
      stageIndex: job.stageIndex - 1,
      serviceReviewed: clearReviews ? {} : job.serviceReviewed,
      history: [...job.history, { stage: "reversed", label: "Sent back", by: session.name, role: session.role, note: `${fromStage.label} → ${toStage.label}${clearReviews ? " (reviews cleared)" : ""}`, at: now }],
      updatedAt: now,
    };
    const saved = await saveJob(updated);
    setJob(updated);
    setBusy(false);
    setShowReverseConfirm(false);
    setClearReviewsOnReverse(false);
    onChanged(updated, saved);
  };

  // Admin/Intake only. A car can be put on hold from wherever it currently
  // sits in the workflow — it's a parking-lot state (a car just sitting at
  // the shop, sometimes for months), not a pipeline step, so it doesn't
  // touch stageIndex at all. Taking it off hold resumes exactly where it
  // was; the note is required going on, per the shop's explicit request.
  const putOnHold = async (noteText) => {
    if (!noteText.trim()) return;
    setBusy(true);
    const now = Date.now();
    const updated = {
      ...job,
      onHold: true,
      onHoldNote: noteText.trim(),
      onHoldSince: now,
      history: [...job.history, { stage: "onhold", label: "On Hold", by: session.name, role: session.role, note: noteText.trim(), at: now }],
      updatedAt: now,
    };
    const saved = await saveJob(updated);
    setJob(updated);
    setBusy(false);
    setShowHoldPrompt(false);
    setHoldNoteInput("");
    onChanged(updated, saved);
  };

  const takeOffHold = async () => {
    setBusy(true);
    const now = Date.now();
    const updated = {
      ...job,
      onHold: false,
      history: [...job.history, { stage: "onhold", label: "Off Hold", by: session.name, role: session.role, note: job.onHoldNote ? `Resumed (was: "${job.onHoldNote}")` : "Resumed", at: now }],
      onHoldNote: null,
      onHoldSince: null,
      updatedAt: now,
    };
    const saved = await saveJob(updated);
    setJob(updated);
    setBusy(false);
    onChanged(updated, saved);
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    const ok = await deleteJob(job, session);
    setDeleting(false);
    if (ok) onDeleted(job.id);
  };

  const introPhotos = [
    ...(job.photos.intake || []).map((src) => ({ src, label: "Intake" })),
    ...(job.photos.parts_removal || []).map((src) => ({ src, label: "Parts" })),
    ...(job.photos.completion || []).map((src) => ({ src, label: "Completion" })),
  ];

  // Shop-floor roles get a radically stripped screen — their own
  // service(s) only, huge tap targets, nothing to configure. Reuses the
  // same toggleServiceDone/setServiceNote/photo handlers as the full view
  // so the underlying data and history logging stay identical.
  if (ROLE_DEFS[session.role]?.simplified) {
    const myServices = activeServices.filter((s) => s.role === session.role);
    return (
      <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
        <button onClick={onBack} className="mrcap-press" style={{ ...iconBtnStyle, marginBottom: 16 }}><ChevronLeft size={20} color={COLORS.ink} /></button>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 28, color: COLORS.ink, letterSpacing: 0.5 }}>{job.plate}</div>
          <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 4 }}>{job.makeModel}</div>
          {job.priority === "High" && <div style={{ marginTop: 8 }}><Pill tone="red">Urgent</Pill></div>}
        </div>

        {job.description && (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>What to do</div>
            <div style={{ fontSize: 15, color: COLORS.ink, lineHeight: 1.4 }}>{job.description}</div>
          </div>
        )}

        {introPhotos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Photos</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {introPhotos.map((p, i) => (
                <button key={i} onClick={() => setViewerIndex(i)} className="mrcap-press" style={{ width: 68, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <img src={p.src} alt="" style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                </button>
              ))}
            </div>
            <PhotoViewer photos={introPhotos} index={viewerIndex} onClose={() => window.history.back()} onNavigate={setViewerIndex} />
            <button onClick={() => completionFileRef.current?.click()} disabled={uploadingCompletion} className="mrcap-press" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 8, border: `1px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.08)", color: COLORS.gold, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              <Camera size={13} /> {uploadingCompletion ? "Uploading…" : "Add Completion Photo"}
            </button>
            <input ref={completionFileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addCompletionPhotos(e.target.files)} />
          </div>
        )}

        {myServices.map((s) => {
          const done = job.serviceDone[s.key];
          const review = (job.serviceReviewed || {})[s.key];
          const myTreatments = (job.treatments || {})[s.key] || [];
          const canToggle = canToggleService(s.key);
          return (
            <div key={s.key} style={{ marginBottom: 16 }}>
              {s.key === "bodyshop" && job.damageDiagramImage && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Damage location</div>
                  {job.damagePanels && job.damagePanels.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {job.damagePanels.map((p) => <Pill key={p} tone="red">{p}</Pill>)}
                    </div>
                  )}
                  <button onClick={() => setDamageViewerOpen(true)} className="mrcap-press" style={{ display: "block", width: "100%", background: "#fff", borderRadius: 10, border: `1px solid ${COLORS.line}`, padding: 6, cursor: "pointer" }}>
                    <img src={job.damageDiagramImage} alt="Damage diagram" style={{ width: "100%", height: "auto", display: "block", borderRadius: 6 }} />
                  </button>
                </div>
              )}
              {myTreatments.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{s.label} — what's needed</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {myTreatments.map((t) => <Pill key={t} bg={`${ROLE_DEFS[s.role].color}33`} fg={ROLE_DEFS[s.role].color}>{t}</Pill>)}
                  </div>
                </div>
              )}
              <button
                onClick={() => toggleServiceDone(s.key)}
                disabled={!canToggle}
                className="mrcap-press"
                style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "22px", borderRadius: 14, border: `2px solid ${done ? COLORS.green : COLORS.gold}`, background: done ? "rgba(74,122,87,0.18)" : "rgba(201,162,39,0.12)", cursor: canToggle ? "pointer" : "not-allowed", opacity: canToggle ? 1 : 0.6 }}
              >
                {done ? (canToggle ? <CheckCircle2 size={28} color={COLORS.green} /> : <Lock size={24} color={COLORS.green} />) : <div style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${COLORS.gold}` }} />}
                <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink }}>{done ? "Marked Done" : "Mark Done"}</span>
              </button>
              {done && !canToggle && (
                <div style={{ textAlign: "center", fontSize: 11.5, color: COLORS.muted, marginTop: 6 }}>Marked by someone else — ask an admin to undo</div>
              )}

              {s.reviewerRole && done && (
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 12.5, color: review ? "#7BC494" : COLORS.gold }}>
                  {review ? `✓ ${s.reviewerNote}` : `Waiting on ${s.reviewerNote.replace("Reviewed by ", "")}'s review`}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <input
                  defaultValue={(job.serviceNotes || {})[s.key] || ""}
                  onBlur={(e) => { if (e.target.value !== ((job.serviceNotes || {})[s.key] || "")) setServiceNote(s.key, e.target.value); }}
                  placeholder="Add a note (optional)"
                  style={{ width: "100%", boxSizing: "border-box", background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: COLORS.ink, fontFamily: "Inter, sans-serif" }}
                />
              </div>

              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addPendingPhotos(e.target.files)} />
              <button onClick={() => fileRef.current.click()} className="mrcap-press" style={{ ...cameraBtnStyle, width: "100%", justifyContent: "center", marginTop: 10, padding: "14px" }}>
                <Camera size={18} /> Add Photo
              </button>
              <PhotoGrid photos={pendingPhotos} onRemove={(i) => setPendingPhotos((p) => p.filter((_, idx) => idx !== i))} />
            </div>
          );
        })}
        {damageViewerOpen && job.damageDiagramImage && (
          <PhotoViewer photos={[{ src: job.damageDiagramImage, label: "Damage diagram" }]} index={0} onClose={() => window.history.back()} onNavigate={() => {}} />
        )}
      </div>
    );
  }

  if (editing) {
    return <EditJobScreen job={job} session={session} onSaved={(updated, saved) => { setJob(updated); window.history.back(); onChanged(updated, saved); }} onCancel={() => window.history.back()} />;
  }

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
      {stage.key === "ready" && job.customerPhone && (
        <WhatsAppSendButton
          phone={job.customerPhone}
          templateKey="ready_for_collection"
          vars={{ customerName: job.customerName || "", makeModel: job.makeModel || "vehicle", plate: job.plate || "", trackingLink: `${window.location.origin}/?track=${job.id}` }}
          label="Notify Customer on WhatsApp"
        />
      )}
      {stage.key === "intake" && job.customerPhone && (
        <WhatsAppSendButton
          phone={job.customerPhone}
          templateKey="job_started"
          vars={{ customerName: job.customerName || "", makeModel: job.makeModel || "vehicle", plate: job.plate || "", trackingLink: `${window.location.origin}/?track=${job.id}` }}
          label="Send Intake Confirmation"
        />
      )}

      {stage.key === "collected" && job.customerPhone && hasPermission(session, team, "googleReview") && (
        <div style={{ background: "linear-gradient(160deg, rgba(201,162,39,0.14), rgba(201,162,39,0.04))", border: `1.5px solid ${COLORS.gold}`, borderRadius: 12, padding: "14px 15px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <Star size={15} color={COLORS.gold} fill={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14, color: COLORS.ink }}>Ask for a Google Review</div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12, lineHeight: 1.45 }}>
            This car's been collected — a good moment to ask {job.customerName || "the customer"} for a quick review.
          </div>
          {GOOGLE_REVIEW_LINK ? (
            <WhatsAppSendButton
              phone={job.customerPhone}
              templateKey="google_review"
              vars={{ customerName: job.customerName || "", makeModel: job.makeModel || "vehicle", plate: job.plate || "", reviewLink: GOOGLE_REVIEW_LINK }}
              label="Ask for a Review on WhatsApp"
            />
          ) : (
            <div style={{ fontSize: 11.5, color: COLORS.muted, fontStyle: "italic" }}>Add your Google review link under WhatsApp Messages to enable this.</div>
          )}
        </div>
      )}

      {job.onHold && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 13px", borderRadius: 10, border: `1.5px solid ${COLORS.gold}`, background: "rgba(201,162,39,0.12)", marginBottom: 12 }}>
          <PauseCircle size={18} color={COLORS.gold} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14, color: COLORS.gold }}>On Hold since {fmtTime(job.onHoldSince)}</div>
            {job.onHoldNote && <div style={{ fontSize: 12.5, color: COLORS.ink, marginTop: 3 }}>"{job.onHoldNote}"</div>}
          </div>
        </div>
      )}

      {(session.role === "admin" || session.role === "intake") && (
        job.onHold ? (
          <button onClick={takeOffHold} disabled={busy} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 10, border: `1.5px solid ${COLORS.green}`, background: "rgba(74,122,87,0.1)", color: "#7BC494", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12, opacity: busy ? 0.6 : 1 }}>
            <PauseCircle size={15} /> Take Off Hold
          </button>
        ) : showHoldPrompt ? (
          <div style={{ padding: "12px 13px", borderRadius: 10, border: `1.5px solid ${COLORS.gold}`, background: COLORS.panel, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: 600 }}>Why is this car going on hold?</div>
            <input autoFocus value={holdNoteInput} onChange={(e) => setHoldNoteInput(e.target.value)} placeholder="e.g. Showroom display — owner's request" style={{ ...inputStyle, marginTop: 0 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => putOnHold(holdNoteInput)} disabled={busy || !holdNoteInput.trim()} className="mrcap-press" style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: COLORS.gold, color: COLORS.darkText, fontWeight: 700, fontSize: 12.5, cursor: "pointer", opacity: busy || !holdNoteInput.trim() ? 0.5 : 1 }}>Confirm On Hold</button>
              <button onClick={() => { setShowHoldPrompt(false); setHoldNoteInput(""); }} className="mrcap-press" style={{ padding: "10px 14px", borderRadius: 9, border: `1px solid ${COLORS.line}`, background: "none", color: COLORS.muted, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowHoldPrompt(true)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.08)", color: COLORS.gold, fontWeight: 600, fontSize: 12.5, cursor: "pointer", marginBottom: 12 }}>
            <PauseCircle size={15} /> Put On Hold
          </button>
        )
      )}

      {(session.role === "admin" || session.role === "intake") && (
        <button
          onClick={() => {
            const doc = generateJobCardPDF(job);
            doc.save(`MrCAP-JobCard-${job.plate.replace(/\s+/g, "-")}.pdf`);
          }}
          className="mrcap-press"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: COLORS.gold, color: COLORS.darkText, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12 }}
        >
          <FileText size={15} /> Generate E-Job Card (PDF)
        </button>
      )}

      {(hasPermission(session, team, "editJob") || hasPermission(session, team, "sendBack")) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {hasPermission(session, team, "editJob") && (
            <button onClick={() => setEditing(true)} className="mrcap-press" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.08)", color: COLORS.gold, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
              <Wrench size={13} /> Edit Job
            </button>
          )}
          {job.stageIndex > 0 && hasPermission(session, team, "sendBack") && (
            <button onClick={() => setShowReverseConfirm((v) => !v)} className="mrcap-press" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 10, border: `1.5px dashed ${COLORS.red}`, background: "rgba(168,64,47,0.08)", color: "#E08A78", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
              <ChevronLeft size={13} /> Send Back
            </button>
          )}
        </div>
      )}

      {hasPermission(session, team, "delete") && (
        <button onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); }} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "10px", borderRadius: 10, border: `1.5px solid ${COLORS.red}`, background: "rgba(168,64,47,0.1)", color: COLORS.red, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 12 }}>
          <X size={14} /> Delete Job Card
        </button>
      )}

      {showDeleteConfirm && (
        <div className="mrcap-fade" style={{ background: "#3A1815", border: `2px solid ${COLORS.red}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ShieldAlert size={20} color={COLORS.red} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 15, color: "#FF8A73" }}>This cannot be undone</div>
          </div>
          <div style={{ fontSize: 12.5, color: "#F0C4BA", marginBottom: 12, lineHeight: 1.5 }}>
            Deleting <b>{job.plate}</b> permanently removes this job card, its photos, and its full history. It will NOT appear in Archive. The deletion itself will be logged with your name and the time, but the job's contents are gone for good.
          </div>
          <div style={{ fontSize: 11.5, color: "#F0C4BA", marginBottom: 8 }}>Type <b>DELETE</b> to confirm:</div>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            style={{ width: "100%", boxSizing: "border-box", background: "#2A100D", border: `1.5px solid ${COLORS.red}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#fff", fontFamily: MONO_FONT, marginBottom: 12, letterSpacing: 1 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowDeleteConfirm(false)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1, padding: "10px", fontSize: 12.5 }}>Cancel</button>
            <button onClick={handleDelete} disabled={deleteConfirmText !== "DELETE" || deleting} className="mrcap-press" style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: COLORS.red, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: deleteConfirmText === "DELETE" ? "pointer" : "not-allowed", opacity: deleteConfirmText === "DELETE" ? 1 : 0.5 }}>
              {deleting ? "Deleting…" : "Permanently Delete"}
            </button>
          </div>
        </div>
      )}

      {showReverseConfirm && (
        <div className="mrcap-fade" style={{ background: "rgba(168,64,47,0.12)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "#E08A78", marginBottom: 10 }}>
            Move this job back from <b>{stage.label}</b> to <b>{STAGES[job.stageIndex - 1].label}</b>?
          </div>
          {Object.keys(job.serviceReviewed || {}).length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: COLORS.ink, cursor: "pointer" }}>
              <input type="checkbox" checked={clearReviewsOnReverse} onChange={(e) => setClearReviewsOnReverse(e.target.checked)} style={{ width: 15, height: 15 }} />
              Also clear existing review sign-off(s)
            </label>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowReverseConfirm(false)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1, padding: "9px", fontSize: 12.5 }}>Cancel</button>
            <button onClick={() => reverseStage(clearReviewsOnReverse)} disabled={busy} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: COLORS.red, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
              {busy ? "…" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: `linear-gradient(160deg, ${COLORS.panel2}, ${COLORS.panel})`, border: `1px solid ${COLORS.line}`, borderTop: `2px solid ${COLORS.gold}`, borderRadius: 12, padding: "18px 16px 15px", color: "#fff", marginBottom: 14, position: "relative" }}>
        <div style={{ position: "absolute", top: 14, right: 16, fontSize: 9, color: COLORS.gold, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>Case File</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 21, letterSpacing: 0.5 }}>{job.plate}</div>
            <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 3 }}>{job.makeModel} · {job.location}</div>
          </div>
          {(job.invoiceAmount || Object.keys(job.treatmentPrices || {}).length > 0 || (job.parts || []).length > 0) && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 17, color: COLORS.gold }}>
                AED {job.invoiceAmount || Math.round(
                  Object.values(job.treatmentPrices || {}).reduce((sum, v) => sum + (Number(v) || 0), 0) * (1 - (job.discountPercent || 0) / 100)
                  + (job.parts || []).reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)
                ).toLocaleString()}
              </div>
              {job.invoiceNo && <div style={{ fontSize: 9.5, opacity: 0.6, marginTop: 1 }}>{job.invoiceNo}</div>}
              {!job.invoiceAmount && job.discountPercent > 0 && <div style={{ fontSize: 9.5, opacity: 0.6, marginTop: 1 }}>{job.discountPercent}% off</div>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Pill tone={stageTone(stage.key)}>{stage.label}</Pill>
          <Pill tone={priorityTone(job.priority)}>{job.priority}</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          <User size={12} /> {job.customerName} {job.customerPhone && `· ${job.customerPhone}`}
        </div>
        <div style={{ borderTop: `1px dashed ${COLORS.line}`, margin: "12px 0 10px" }} />
        <StageStrip currentIndex={job.stageIndex} />
      </div>

      {hasPermission(session, team, "statusUpdate") && (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <MessageSquare size={14} color={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Customer Update</div>
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 12 }}>
            Shown on the customer's tracking page. Pick one or type your own.
          </div>

          {job.customerStatusNote && (
            <div style={{ background: "rgba(201,162,39,0.08)", border: `1px solid ${COLORS.gold}`, borderRadius: 8, padding: "9px 11px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: 600 }}>{job.customerStatusNote}</div>
                {job.customerStatusUpdatedAt && (
                  <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 2 }}>Showing since {new Date(job.customerStatusUpdatedAt).toLocaleString()}</div>
                )}
              </div>
              <button onClick={() => saveCustomerStatusNote("")} className="mrcap-press" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 4, flexShrink: 0 }} title="Clear">
                <X size={14} />
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {CUSTOMER_STATUS_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => saveCustomerStatusNote(preset)}
                disabled={savingStatusNote}
                className="mrcap-press"
                style={{
                  padding: "7px 11px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
                  border: `1.5px solid ${job.customerStatusNote === preset ? COLORS.gold : COLORS.line}`,
                  background: job.customerStatusNote === preset ? COLORS.gold : COLORS.panel2,
                  color: job.customerStatusNote === preset ? COLORS.darkText : COLORS.ink,
                  fontWeight: job.customerStatusNote === preset ? 700 : 500,
                  opacity: savingStatusNote ? 0.6 : 1,
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={customStatusNote}
              onChange={(e) => setCustomStatusNote(e.target.value)}
              placeholder="Or type a custom update…"
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
              onKeyDown={(e) => { if (e.key === "Enter" && customStatusNote.trim()) saveCustomerStatusNote(customStatusNote); }}
            />
            <button
              onClick={() => saveCustomerStatusNote(customStatusNote)}
              disabled={savingStatusNote || !customStatusNote.trim()}
              className="mrcap-press"
              style={{ ...secondaryBtnStyle, padding: "0 16px", opacity: savingStatusNote || !customStatusNote.trim() ? 0.5 : 1 }}
            >
              Set
            </button>
          </div>
        </div>
      )}

      {hasPermission(session, team, "markupCalc") && (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <TrendingUp size={14} color={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Markup Calculator</div>
            <Lock size={11} color={COLORS.muted} style={{ marginLeft: "auto" }} />
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 4 }}>
            Enter a cost (e.g. a supplier or parts bill) and a markup % — this works out what to charge and saves it with the job.
          </div>
          <div style={{ fontSize: 10.5, color: COLORS.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 5, fontStyle: "italic" }}>
            <Lock size={9} /> Internal reference only — the customer never sees this section or its photos.
          </div>

          {(job.markupEntries || []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {job.markupEntries.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 11px" }}>
                  {(e.photos || []).length > 0 && (
                    <img
                      src={e.photos[0]}
                      alt=""
                      onClick={() => setMarkupPhotoViewer({ photos: e.photos.map((src) => ({ src, label: e.description })), index: 0 })}
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.line}`, cursor: "pointer", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: COLORS.ink, fontWeight: 600 }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>Cost AED {e.cost.toLocaleString()} + {e.markupPercent}%{(e.photos || []).length > 1 ? ` · ${e.photos.length} photos` : ""}</div>
                  </div>
                  <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 14, color: COLORS.gold, whiteSpace: "nowrap" }}>AED {e.chargePrice.toLocaleString()}</div>
                  <button onClick={() => removeMarkupEntry(e.id)} className="mrcap-press" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 4, flexShrink: 0 }} title="Remove">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted, padding: "2px 2px 0" }}>
                <span>Total to charge</span>
                <span style={{ fontWeight: 700, color: COLORS.ink }}>AED {job.markupEntries.reduce((sum, e) => sum + e.chargePrice, 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={markupDesc} onChange={(e) => setMarkupDesc(e.target.value)} placeholder="What is this? e.g. Front bumper" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="number" inputMode="decimal" value={markupCost} onChange={(e) => setMarkupCost(e.target.value)} placeholder="Cost (AED)" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
            <input type="number" inputMode="decimal" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} placeholder="Markup %" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
          </div>
          {markupCost && markupPercent !== "" && Number(markupCost) > 0 && (
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
              Charge: <span style={{ color: COLORS.gold, fontWeight: 700 }}>AED {(Number(markupCost) * (1 + Number(markupPercent) / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          )}

          <PhotoGrid photos={markupPhotos} onRemove={removeMarkupPhoto} />
          <input ref={markupFileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addMarkupPhotos(e.target.files)} />
          <button
            onClick={() => markupFileRef.current.click()}
            className="mrcap-press"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "9px", borderRadius: 9, border: `1.5px dashed ${COLORS.line}`, background: "transparent", color: COLORS.muted, fontWeight: 600, fontSize: 12, cursor: "pointer", marginBottom: 10 }}
          >
            <Camera size={13} /> {uploadingMarkupPhoto ? "Uploading…" : markupPhotos.length ? "Add Another Bill Photo" : "Attach Bill / Receipt Photo"}
          </button>

          <button
            onClick={addMarkupEntry}
            disabled={savingMarkup || !markupCost || Number(markupCost) <= 0 || markupPercent === ""}
            className="mrcap-press"
            style={{ ...secondaryBtnStyle, width: "100%", padding: "10px", fontSize: 12.5, opacity: savingMarkup || !markupCost || Number(markupCost) <= 0 || markupPercent === "" ? 0.5 : 1 }}
          >
            {savingMarkup ? "Saving…" : "Add Entry"}
          </button>
        </div>
      )}

      {hasPermission(session, team, "editJob") && (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Wrench size={14} color={COLORS.gold} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Parts & Charges</div>
          </div>
          <PartsEditor parts={job.parts || []} onChange={updateJobParts} showTotal />
        </div>
      )}

      {markupPhotoViewer && (
        <PhotoViewer
          photos={markupPhotoViewer.photos}
          index={markupPhotoViewer.index}
          onClose={() => setMarkupPhotoViewer(null)}
          onNavigate={(i) => setMarkupPhotoViewer((v) => ({ ...v, index: i }))}
        />
      )}

      {job.description && <InfoBlock title="Requested work">{job.description}</InfoBlock>}
      {job.damageNotes && <InfoBlock title="Damage / walk-around notes">{job.damageNotes}</InfoBlock>}

      {job.damageDiagramImage && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Body damage — panels & location</div>
          {job.damagePanels && job.damagePanels.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 8 }}>
              {job.damagePanels.map((p) => <Pill key={p} tone="red">{p}</Pill>)}
            </div>
          )}
          <button onClick={() => setDamageViewerOpen(true)} className="mrcap-press" style={{ display: "block", width: "100%", background: "#fff", borderRadius: 10, border: `1px solid ${COLORS.line}`, padding: 6, cursor: "pointer" }}>
            <img src={job.damageDiagramImage} alt="Damage diagram" style={{ width: "100%", height: "auto", display: "block", borderRadius: 6 }} />
          </button>
        </div>
      )}

      {job.signature && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Customer signature{job.signedAt ? ` · ${fmtTime(job.signedAt)}` : ""}</div>
          <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${COLORS.line}`, padding: 8, marginTop: 8 }}>
            <img src={job.signature} alt="Customer signature" style={{ width: "100%", height: 80, objectFit: "contain" }} />
          </div>
        </div>
      )}

      {activeServices.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Service checklist</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {activeServices.map((s) => {
              const assignedId = (job.assignedTo || {})[s.key];
              const assignedMember = team.find((m) => m.id === assignedId);
              const candidates = team.filter((m) => m.role === s.role);
              const complete = isServiceComplete(s);
              const review = (job.serviceReviewed || {})[s.key];
              const needsReview = s.reviewerRole && job.serviceDone[s.key] && !review;
              const canReview = s.reviewerRole && session.role === s.reviewerRole;
              return (
                <div key={s.key} style={{ borderRadius: 10, border: `1.5px solid ${complete ? COLORS.green : needsReview ? COLORS.gold : COLORS.line}`, background: complete ? "rgba(74,122,87,0.15)" : needsReview ? "rgba(201,162,39,0.1)" : COLORS.panel, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px" }}>
                    <button onClick={() => toggleServiceDone(s.key)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", flex: 1, textAlign: "left" }}>
                      {job.serviceDone[s.key] ? <CheckCircle2 size={17} color={complete ? COLORS.green : COLORS.gold} style={{ flexShrink: 0 }} /> : <div style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${COLORS.muted}`, flexShrink: 0 }} />}
                      <span>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</div>
                        {(job.treatments || {})[s.key]?.length > 0 && (
                          <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 1 }}>{(job.treatments[s.key] || []).join(", ")}</div>
                        )}
                      </span>
                    </button>
                    <button onClick={() => setPickerFor(pickerFor === s.key ? null : s.key)} className="mrcap-press" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                      {assignedMember ? (
                        <Pill bg={`${ROLE_DEFS[s.role].color}33`} fg={ROLE_DEFS[s.role].color}>{assignedMember.name}</Pill>
                      ) : (
                        <Pill bg={COLORS.panel2} fg={COLORS.muted}>Assign</Pill>
                      )}
                    </button>
                  </div>
                  {pickerFor === s.key && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 11px" }}>
                      {candidates.length === 0 && <span style={{ fontSize: 11.5, color: COLORS.muted }}>No one set up for this role yet.</span>}
                      {candidates.map((m) => (
                        <button key={m.id} onClick={() => assignService(s.key, m.id)} style={{ padding: "6px 10px", borderRadius: 999, border: `1.5px solid ${assignedId === m.id ? COLORS.gold : COLORS.line}`, background: assignedId === m.id ? COLORS.gold : COLORS.panel2, color: assignedId === m.id ? COLORS.darkText : COLORS.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{m.name}</button>
                      ))}
                    </div>
                  )}

                  {/* Per-service note — independent per service, not shared */}
                  <div style={{ padding: "0 12px 10px" }}>
                    <input
                      defaultValue={(job.serviceNotes || {})[s.key] || ""}
                      onBlur={(e) => { if (e.target.value !== ((job.serviceNotes || {})[s.key] || "")) setServiceNote(s.key, e.target.value); }}
                      placeholder="Note for this service (optional)"
                      style={{ width: "100%", boxSizing: "border-box", background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "6px 9px", fontSize: 11.5, color: COLORS.ink, fontFamily: "Inter, sans-serif" }}
                    />
                  </div>

                  {/* Damage diagram — shown directly on the Body Work card so
                      Jobish/Smartech see exactly what to fix without
                      scrolling back up to the case file. */}
                  {s.key === "bodyshop" && job.damageDiagramImage && (
                    <div style={{ padding: "0 12px 11px" }}>
                      {job.damagePanels && job.damagePanels.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                          {job.damagePanels.map((p) => <Pill key={p} tone="red">{p}</Pill>)}
                        </div>
                      )}
                      <button onClick={() => setDamageViewerOpen(true)} className="mrcap-press" style={{ display: "block", width: "100%", background: "#fff", borderRadius: 8, border: `1px solid ${COLORS.line}`, padding: 4, cursor: "pointer" }}>
                        <img src={job.damageDiagramImage} alt="Damage diagram" style={{ width: "100%", height: "auto", display: "block", borderRadius: 5 }} />
                      </button>
                    </div>
                  )}

                  {/* Reviewer step — only for services with a reviewerRole (PPF & Films) */}
                  {s.reviewerRole && job.serviceDone[s.key] && (
                    <div style={{ padding: "0 12px 11px" }}>
                      {review ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#7BC494" }}>
                          <CheckCircle2 size={13} color={COLORS.green} /> {s.reviewerNote} — {review.by}
                        </div>
                      ) : canReview ? (
                        <button onClick={() => reviewService(s.key)} className="mrcap-press" style={{ width: "100%", padding: "8px", borderRadius: 7, border: `1.5px solid ${COLORS.gold}`, background: COLORS.gold, color: COLORS.darkText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          Confirm review
                        </button>
                      ) : (
                        <div style={{ fontSize: 11.5, color: COLORS.gold }}>Waiting on {s.reviewerNote.replace("Reviewed by ", "")}'s review</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {introPhotos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Photos · tap to view or save</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {introPhotos.map((p, i) => (
              <button key={i} onClick={() => setViewerIndex(i)} className="mrcap-press" style={{ width: 68, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <img src={p.src} alt="" style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                <div style={{ fontSize: 9.5, color: COLORS.muted, textAlign: "center", marginTop: 3 }}>{p.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <PhotoViewer photos={introPhotos} index={viewerIndex} onClose={() => window.history.back()} onNavigate={setViewerIndex} />
      <button onClick={() => completionFileRef.current?.click()} disabled={uploadingCompletion} className="mrcap-press" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 8, border: `1px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.08)", color: COLORS.gold, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
        <Camera size={13} /> {uploadingCompletion ? "Uploading…" : "Add Completion Photo"}
      </button>
      <input ref={completionFileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addCompletionPhotos(e.target.files)} />
      {damageViewerOpen && job.damageDiagramImage && (
        <PhotoViewer photos={[{ src: job.damageDiagramImage, label: "Damage diagram" }]} index={0} onClose={() => window.history.back()} onNavigate={() => {}} />
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={labelStyle}>History</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          {job.history.slice().reverse().map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <CheckCircle2 size={15} color={COLORS.green} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, color: COLORS.ink }}><b>{h.label}</b> · {h.by} <span style={{ color: COLORS.muted }}>({ROLE_DEFS[h.role]?.label || h.role})</span></div>
                {h.note && <div style={{ fontSize: 12.5, color: COLORS.muted }}>{h.note}</div>}
                <div style={{ fontSize: 11, color: COLORS.muted }}>{fmtTime(h.at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isLast ? (
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 13, padding: 15 }}>
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <Wrench size={13} /> Next: <b style={{ color: COLORS.ink }}>{nextStage.label}</b>
          </div>
          {stage.key === "parts_removal" && (
            <>
              <PhotoGrid photos={pendingPhotos} onRemove={(i) => setPendingPhotos((p) => p.filter((_, idx) => idx !== i))} />
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && addPendingPhotos(e.target.files)} />
              <button onClick={() => fileRef.current.click()} style={cameraBtnStyle}><Camera size={15} /> Add photo</button>
            </>
          )}
          {stage.key === "service" && !allServicesDone && (
            <div style={{ fontSize: 12, color: COLORS.red, marginBottom: 8 }}>Check off every service above before advancing.</div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" style={{ ...textareaStyle, minHeight: 50, marginTop: 10 }} />
          <button onClick={advance} disabled={busy || (stage.key === "service" && !allServicesDone)} className="mrcap-press" style={{ ...primaryBtnStyle, width: "100%", marginTop: 10, opacity: busy || (stage.key === "service" && !allServicesDone) ? 0.5 : 1, position: "relative", overflow: "hidden" }}>
            <span style={{ position: "relative", zIndex: 1 }}>{busy ? "Saving…" : `Mark done → "${nextStage.label}"`}</span>
            {!busy && !(stage.key === "service" && !allServicesDone) && <span className="mrcap-sweep" style={{ position: "absolute", inset: 0 }} />}
          </button>
        </div>
      ) : (
        <div style={{ background: "rgba(74,122,87,0.15)", border: `1px solid ${COLORS.green}`, borderRadius: 12, padding: 16, textAlign: "center", color: "#7BC494", fontWeight: 700, fontSize: 14 }}>Vehicle collected — job card closed</div>
      )}
    </div>
  );
}

// Shown instead of a blank screen when someone's permission was revoked
// while a stale button/view was still in front of them — e.g. an admin
// turns off their Reports access while they had that tab open. Never a
// crash, always a clear way back.
function AccessDenied({ onBack }) {
  return (
    <div className="mrcap-view" style={{ padding: "60px 24px", textAlign: "center" }}>
      <Lock size={28} color={COLORS.muted} style={{ marginBottom: 12 }} />
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 17, color: COLORS.ink, marginBottom: 6 }}>No access</div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 20 }}>You don't have permission to view this. Ask an admin if you need it.</div>
      <button onClick={onBack} className="mrcap-press" style={{ ...secondaryBtnStyle, padding: "10px 24px" }}>Back</button>
    </div>
  );
}

function InfoBlock({ title, children }) {
  return <div style={{ marginBottom: 12 }}><div style={labelStyle}>{title}</div><div style={{ fontSize: 13.5, color: COLORS.ink, marginTop: 4, lineHeight: 1.4 }}>{children}</div></div>;
}
function StageStrip({ currentIndex }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {STAGES.map((s, i) => (
        <React.Fragment key={s.key}>
          <div title={s.label} style={{ width: 9, height: 9, borderRadius: "50%", background: i <= currentIndex ? COLORS.gold : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
          {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: i < currentIndex ? COLORS.gold : "rgba(255,255,255,0.25)" }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---------------- Archive (restricted) ---------------- */

function ArchiveScreen({ index, onOpen, onBack }) {
  const [search, setSearch] = useState("");
  const collected = index
    .filter((j) => j.stageKey === "collected")
    .filter((j) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (j.plate || "").toLowerCase().includes(q) || (j.customerName || "").toLowerCase().includes(q) || (j.makeModel || "").toLowerCase().includes(q);
    });

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Archive</SectionTitle>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: -10, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <Lock size={12} /> Visible only to you, Ahmed, Laani, and Suhail
      </div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} color={COLORS.muted} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plate, customer, model…" style={{ ...inputStyle, marginTop: 0, paddingLeft: 34 }} />
      </div>

      {collected.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 10px", color: COLORS.muted }}>
          <Archive size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 14 }}>Nothing archived yet.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {collected.map((j) => (
          <button key={j.id} onClick={() => onOpen(j.id)} className="mrcap-press mrcap-card" style={{ textAlign: "left", background: COLORS.panel, borderTop: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}`, borderLeft: `3px solid ${COLORS.gold}`, borderRadius: "4px 10px 10px 4px", padding: "13px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, width: "100%", boxSizing: "border-box", boxShadow: "0 6px 16px -10px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.ink, letterSpacing: 1.1 }}>{j.plate || "—"}</div>
                <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 1 }}>{j.makeModel} · {j.customerName}</div>
              </div>
              <Pill tone={isRecentlyCollected(j) ? "yellow" : "green"}>{isRecentlyCollected(j) ? "Today" : "Collected"}</Pill>
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={11} /> collected {fmtTime(j.updatedAt)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Team screen (admin) ---------------- */

/* ---------------- Customers (CRM) ---------------- */

function CustomersScreen({ onBack, onOpenJob }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // customer row
  const [history, setHistory] = useState(null); // { vehicles, jobs }
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchCustomers(search.trim());
      setResults(r);
      setSearching(false);
    }, 300); // debounce so we don't hit the server on every keystroke
    return () => clearTimeout(t);
  }, [search]);

  const openCustomer = async (customer) => {
    setSelected(customer);
    setLoadingHistory(true);
    const h = await loadCustomerHistory(customer.id);
    setHistory(h);
    setLoadingHistory(false);
  };

  if (selected) {
    return (
      <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
        <button onClick={() => { setSelected(null); setHistory(null); }} style={{ ...iconBtnStyle, marginBottom: 16 }} className="mrcap-press"><ChevronLeft size={18} color={COLORS.ink} /></button>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 19, color: COLORS.ink }}>{selected.name}</div>
          {selected.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: COLORS.muted }}>
              <Phone size={12} /> {selected.phone}
            </div>
          )}
        </div>

        {loadingHistory && <div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading history…</div>}

        {!loadingHistory && history && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={labelStyle}>Vehicles ({history.vehicles.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {history.vehicles.map((v) => (
                  <Pill key={v.id} tone="blue">{v.plate}{v.make_model ? ` · ${v.make_model}` : ""}</Pill>
                ))}
                {history.vehicles.length === 0 && <span style={{ fontSize: 12.5, color: COLORS.muted }}>No vehicles on file yet.</span>}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Job history ({history.jobs.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {history.jobs.map((j) => {
                  const stage = STAGES[j.stageIndex] || STAGES[0];
                  return (
                    <button key={j.id} onClick={() => onOpenJob(j.id, j)} className="mrcap-press" style={{ textAlign: "left", background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderLeft: `3px solid ${COLORS.gold}`, borderRadius: "4px 10px 10px 4px", padding: "12px 13px", cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{j.plate}</div>
                          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 1 }}>{j.makeModel}</div>
                        </div>
                        <Pill tone={stageTone(stage.key)}>{stage.label}</Pill>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Clock size={11} /> {fmtTime(j.createdAt)}</span>
                        {j.invoiceAmount && <span style={{ fontFamily: MONO_FONT, color: COLORS.gold, fontWeight: 600 }}>AED {j.invoiceAmount}</span>}
                      </div>
                    </button>
                  );
                })}
                {history.jobs.length === 0 && <span style={{ fontSize: 12.5, color: COLORS.muted }}>No jobs on file yet.</span>}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Customers</SectionTitle>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} color={COLORS.muted} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…" style={{ ...inputStyle, marginTop: 0, paddingLeft: 34 }} autoFocus />
      </div>

      {searching && <div style={{ textAlign: "center", color: COLORS.muted, padding: 20, fontSize: 13 }}>Searching…</div>}

      {!searching && search.trim() && results.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 10px", color: COLORS.muted }}>
          <Users size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 13.5 }}>No customers found.</div>
        </div>
      )}

      {!search.trim() && (
        <div style={{ textAlign: "center", padding: "50px 10px", color: COLORS.muted }}>
          <Users size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 14 }}>Search for a customer by name or phone to see their full vehicle and job history.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((c) => (
          <button key={c.id} onClick={() => openCustomer(c)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: COLORS.panel, cursor: "pointer", width: "100%", boxSizing: "border-box", textAlign: "left" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{c.name}</div>
              {c.phone && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{c.phone}</div>}
            </div>
            <ChevronLeft size={16} color={COLORS.muted} style={{ transform: "rotate(180deg)" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Reports (admin) ---------------- */

function ReportsScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [byMonth, setByMonth] = useState([]);
  const [byService, setByService] = useState([]);
  const [byDelegate, setByDelegate] = useState([]);
  const [byLocation, setByLocation] = useState([]);
  const [byStageTime, setByStageTime] = useState([]);
  const [customerRepeat, setCustomerRepeat] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [m, s, d, l, st, cr] = await Promise.all([
      sbFetch("report_jobs_by_month?select=*&limit=12"),
      sbFetch("report_by_service_type?select=*"),
      sbFetch("report_by_delegate?select=*&limit=10"),
      sbFetch("report_by_location?select=*"),
      sbFetch("report_avg_time_in_stage?select=*"),
      sbFetch("report_customer_repeat?select=*&limit=1"),
    ]);
    if (!m.ok || !s.ok || !d.ok || !l.ok || !st.ok || !cr.ok) { setError(true); setLoading(false); return; }
    setByMonth(m.data || []);
    setByService(s.data || []);
    setByDelegate(d.data || []);
    setByLocation(l.data || []);
    setByStageTime(st.data || []);
    setCustomerRepeat((cr.data || [])[0] || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtMonth = (ts) => new Date(ts).toLocaleDateString([], { month: "short", year: "numeric" });

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Reports</SectionTitle>

      {loading && <div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading reports…</div>}

      {error && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#E08A78", marginBottom: 8 }}>Couldn't load reports.</div>
          <button onClick={load} className="mrcap-press" style={{ ...secondaryBtnStyle, padding: "8px 14px", fontSize: 12.5 }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <ReportSection title="Jobs by month" icon={<Clock size={14} color={COLORS.gold} />}>
            {byMonth.map((r, i) => (
              <ReportRow key={i} label={fmtMonth(r.month)} value={r.job_count} sub={`${r.collected_count} collected`} />
            ))}
            {byMonth.length === 0 && <ReportEmpty />}
          </ReportSection>

          <ReportSection title="By service type" icon={<Wrench size={14} color={COLORS.gold} />}>
            {byService.map((r, i) => (
              <ReportRow key={i} label={SERVICES.find((s) => s.key === r.service_type)?.label || r.service_type} value={r.job_count} />
            ))}
            {byService.length === 0 && <ReportEmpty />}
          </ReportSection>

          <ReportSection title="By delegate" icon={<Users size={14} color={COLORS.gold} />}>
            {byDelegate.filter((r) => r.delegate_name).map((r, i) => (
              <ReportRow key={i} label={r.delegate_name} value={r.actions_logged} sub="actions logged" />
            ))}
            {byDelegate.length === 0 && <ReportEmpty />}
          </ReportSection>

          <ReportSection title="By location" icon={<Building2 size={14} color={COLORS.gold} />}>
            {byLocation.map((r, i) => (
              <ReportRow key={i} label={r.location} value={r.job_count} />
            ))}
            {byLocation.length === 0 && <ReportEmpty />}
          </ReportSection>

          <ReportSection title="Avg. time per stage" icon={<Clock size={14} color={COLORS.gold} />}>
            {byStageTime.map((r, i) => (
              <ReportRow key={i} label={STAGES.find((s) => s.key === r.stage)?.label || r.stage} value={`${r.avg_hours_in_stage}h`} sub={`${r.transitions} jobs`} />
            ))}
            {byStageTime.length === 0 && <ReportEmpty />}
          </ReportSection>

          <ReportSection title="Customer repeat rate" icon={<Users size={14} color={COLORS.gold} />}>
            {customerRepeat ? (
              <>
                <ReportRow label="Repeat customers" value={customerRepeat.repeat_customers} sub={`${customerRepeat.repeat_pct}% of all customers`} />
                <ReportRow label="One-time customers" value={customerRepeat.one_time_customers} />
              </>
            ) : (
              <ReportEmpty />
            )}
          </ReportSection>
        </>
      )}
    </div>
  );
}
function ReportSection({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        {icon}
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 15, color: COLORS.ink }}>{title}</div>
      </div>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
function ReportRow({ label, value, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 13px", borderBottom: `1px solid ${COLORS.line}` }}>
      <div>
        <div style={{ fontSize: 13, color: COLORS.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 15, color: COLORS.gold }}>{value}</div>
    </div>
  );
}
function ReportEmpty() {
  return <div style={{ padding: "16px 13px", fontSize: 12.5, color: COLORS.muted, textAlign: "center" }}>No data yet.</div>;
}

/* ---------------- WhatsApp message templates (Suhail-only) ---------------- */
// One template exists today ("ready for collection"). Modeled as a
// keyed dict from the start so a second auto-message can be added later
// without another migration — just a new entry in TEMPLATE_DEFS below
// and a new key in DEFAULT_WHATSAPP_TEMPLATES.
const TEMPLATE_DEFS = [
  {
    key: "ready_for_collection",
    label: "Job Ready for Collection",
    description: "Sent from a job's detail screen once it reaches the \"Ready for Collection\" stage.",
    tokens: [
      { token: "customerName", sample: "Ahmed" },
      { token: "makeModel", sample: "Toyota Land Cruiser" },
      { token: "plate", sample: "A 12345" },
      { token: "trackingLink", sample: "https://…/?track=…" },
    ],
  },
  {
    key: "job_started",
    label: "Job Started / Intake Confirmation",
    description: "Sent from a job's detail screen while it's at the Intake stage, to confirm the vehicle's been received.",
    tokens: [
      { token: "customerName", sample: "Ahmed" },
      { token: "makeModel", sample: "Toyota Land Cruiser" },
      { token: "plate", sample: "A 12345" },
      { token: "trackingLink", sample: "https://…/?track=…" },
    ],
  },
  {
    key: "quote_sent",
    label: "Quotation Sent",
    description: "Sent from a quotation's detail screen when sharing the price with the customer.",
    tokens: [
      { token: "customerName", sample: "Ahmed" },
      { token: "makeModel", sample: "Toyota Land Cruiser" },
      { token: "plate", sample: "A 12345" },
      { token: "total", sample: "1,200" },
      { token: "quoteLink", sample: "https://…/?quote=…" },
    ],
  },
  {
    key: "follow_up",
    label: "Follow-Up Reminder",
    description: "Sent from the Follow-ups Due list on the dashboard.",
    tokens: [
      { token: "customerName", sample: "Ahmed" },
      { token: "makeModel", sample: "Toyota Land Cruiser" },
      { token: "plate", sample: "A 12345" },
      { token: "reason", sample: "ceramic reapplication due" },
    ],
  },
  {
    key: "warranty_reminder",
    label: "Warranty Expiring Reminder",
    description: "Sent from the Warranty Expiring Soon list on the dashboard.",
    tokens: [
      { token: "customerName", sample: "Ahmed" },
      { token: "makeModel", sample: "Toyota Land Cruiser" },
      { token: "plate", sample: "A 12345" },
      { token: "expiryDate", sample: "15 Sep 2026" },
    ],
  },
  {
    key: "google_review",
    label: "Google Review Request",
    description: "Sent from the banner on a job's detail screen once it's marked Collected.",
    tokens: [
      { token: "customerName", sample: "Ahmed" },
      { token: "makeModel", sample: "Toyota Land Cruiser" },
      { token: "plate", sample: "A 12345" },
      { token: "reviewLink", sample: "https://g.page/r/your-link/review" },
    ],
  },
];

function MessageTemplatesScreen({ onBack }) {
  const [drafts, setDrafts] = useState(() => ({ ...DEFAULT_WHATSAPP_TEMPLATES, ...WHATSAPP_TEMPLATES }));
  const [savingKey, setSavingKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [error, setError] = useState(false);
  const [reviewLink, setReviewLink] = useState(GOOGLE_REVIEW_LINK);
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);

  const save = async (key) => {
    setSavingKey(key);
    setError(false);
    setSavedKey(null);
    const next = { ...WHATSAPP_TEMPLATES, [key]: drafts[key] };
    const ok = await saveWhatsAppTemplates(next, currentActor);
    setSavingKey(null);
    if (ok) { setSavedKey(key); setTimeout(() => setSavedKey(null), 2200); }
    else setError(true);
  };

  const saveLink = async () => {
    setSavingLink(true);
    setError(false);
    const ok = await saveGoogleReviewLink(reviewLink.trim(), currentActor);
    setSavingLink(false);
    if (ok) { setLinkSaved(true); setTimeout(() => setLinkSaved(false), 2200); }
    else setError(true);
  };

  const resetToDefault = (key) => {
    setDrafts((d) => ({ ...d, [key]: DEFAULT_WHATSAPP_TEMPLATES[key] }));
  };

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
      <SectionTitle>WhatsApp Messages</SectionTitle>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 18, lineHeight: 1.5 }}>
        Edit the wording sent to customers on WhatsApp. Use the tokens shown under each message — they're swapped for the real job details when it's sent.
      </div>

      {error && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: "#E08A78" }}>
          Couldn't save — check your connection and try again.
        </div>
      )}

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <ExternalLink size={14} color={COLORS.gold} />
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Google Review Link</div>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 12 }}>
          Your Google Business review link — from Google Maps, search Mr.CAP, tap "Share", then "Ask for reviews", and copy the link. Used by the {"{reviewLink}"} token below and the review banner on collected jobs.
        </div>
        <input
          value={reviewLink}
          onChange={(e) => setReviewLink(e.target.value)}
          placeholder="https://g.page/r/..."
          style={{ ...inputStyle, marginTop: 0, marginBottom: 12 }}
        />
        <button
          onClick={saveLink}
          disabled={savingLink || reviewLink.trim() === GOOGLE_REVIEW_LINK}
          className="mrcap-press"
          style={{ ...primaryBtnStyle, width: "100%", padding: "11px", opacity: savingLink || reviewLink.trim() === GOOGLE_REVIEW_LINK ? 0.5 : 1 }}
        >
          {savingLink ? "Saving…" : linkSaved ? "Saved ✓" : "Save Link"}
        </button>
      </div>

      {TEMPLATE_DEFS.map((def) => {
        const value = drafts[def.key] ?? "";
        const sampleVars = Object.fromEntries(def.tokens.map((t) => [t.token, t.sample]));
        const preview = renderTemplate(value, sampleVars);
        const isDirty = value !== (WHATSAPP_TEMPLATES[def.key] ?? "");
        return (
          <div key={def.key} style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <MessageSquare size={14} color={COLORS.gold} />
              <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{def.label}</div>
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 12 }}>{def.description}</div>

            <textarea
              value={value}
              onChange={(e) => setDrafts((d) => ({ ...d, [def.key]: e.target.value }))}
              style={{ ...textareaStyle, marginTop: 0, minHeight: 90 }}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 14 }}>
              {def.tokens.map((t) => (
                <button
                  key={t.token}
                  onClick={() => setDrafts((d) => ({ ...d, [def.key]: (d[def.key] || "") + `{${t.token}}` }))}
                  className="mrcap-press"
                  style={{ fontSize: 11, fontFamily: "monospace", padding: "4px 9px", borderRadius: 999, border: `1px solid ${COLORS.line}`, background: COLORS.panel2, color: COLORS.gold, cursor: "pointer" }}
                  title={`Insert — sample: ${t.sample}`}
                >
                  {`{${t.token}}`}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Preview</div>
              <div style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: COLORS.ink, lineHeight: 1.45 }}>
                {preview || <span style={{ color: COLORS.muted }}>Nothing to preview yet.</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => save(def.key)}
                disabled={!isDirty || savingKey === def.key}
                className="mrcap-press"
                style={{ ...primaryBtnStyle, flex: 1, padding: "11px", opacity: !isDirty || savingKey === def.key ? 0.5 : 1 }}
              >
                {savingKey === def.key ? "Saving…" : savedKey === def.key ? "Saved ✓" : "Save"}
              </button>
              <button
                onClick={() => resetToDefault(def.key)}
                className="mrcap-press"
                style={{ ...secondaryBtnStyle, padding: "11px 14px", display: "flex", alignItems: "center", gap: 6 }}
                title="Reset to the original wording"
              >
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          </div>
        );
      })}

      <button onClick={onBack} className="mrcap-press" style={{ ...secondaryBtnStyle, width: "100%", marginTop: 4 }}>Back</button>
    </div>
  );
}

/* ---------------- Admin Dashboard — bigger stats (Suhail-only) ---------------- */
// Deliberately separate from ReportsScreen rather than an extension of
// it: Reports is built on lightweight count-only Postgres views anyone
// with the "reports" permission can see; this pulls full job rows
// (including invoice_amount) and does real revenue math client-side, so
// it stays behind isSuperAdmin() instead of the general permission grid.

function parseAED(v) {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function fmtAED(n) {
  return `AED ${Math.round(n).toLocaleString()}`;
}
function monthLabel(d) {
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

/* ---------------- Issue Reports (Suhail-only) ---------------- */
function IssueReportsScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("open"); // 'open' | 'resolved' | 'all'
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { ok, data } = await sbFetchAll("issue_reports?select=*&order=created_at.desc");
    if (!ok) { setError(true); setLoading(false); return; }
    setReports(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id) => {
    setResolvingId(id);
    const { ok } = await sbFetch(`issue_reports?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: currentActor?.name || null }),
    });
    if (ok) setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status: "resolved", resolved_at: new Date().toISOString() } : r)));
    setResolvingId(null);
  };

  const reopen = async (id) => {
    setResolvingId(id);
    const { ok } = await sbFetch(`issue_reports?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "open", resolved_at: null, resolved_by: null }),
    });
    if (ok) setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status: "open", resolved_at: null } : r)));
    setResolvingId(null);
  };

  const filtered = reports.filter((r) => filter === "all" || r.status === filter);
  const openCount = reports.filter((r) => r.status === "open").length;

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
      <SectionTitle>Issue Reports</SectionTitle>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: -10, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <Lock size={12} /> Visible only to you — anyone can submit one from the flag button on any screen
      </div>

      {loading && <div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading…</div>}
      {error && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#E08A78", marginBottom: 8 }}>Couldn't load reports.</div>
          <button onClick={load} className="mrcap-press" style={{ ...secondaryBtnStyle, padding: "8px 14px", fontSize: 12.5 }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
            {[["open", `Open${openCount ? ` (${openCount})` : ""}`], ["resolved", "Resolved"], ["all", "All"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="mrcap-press"
                style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${filter === key ? COLORS.gold : COLORS.line}`, background: filter === key ? COLORS.gold : COLORS.panel2, color: filter === key ? COLORS.darkText : COLORS.ink }}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: COLORS.muted, padding: 40, fontSize: 13 }}>
              {filter === "open" ? "Nothing open — clean slate." : "No reports here."}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((r) => (
              <div key={r.id} style={{ background: COLORS.panel, border: `1px solid ${r.status === "open" ? COLORS.gold : COLORS.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.45, flex: 1 }}>{r.note}</div>
                  <Pill tone={r.status === "open" ? "yellow" : "green"}>{r.status}</Pill>
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 10 }}>
                  {r.reported_by || "Unknown"}{r.reported_by_role ? ` (${r.reported_by_role})` : ""} · {r.view_context || "unknown screen"} · {new Date(r.created_at).toLocaleString()}
                </div>
                {r.status === "open" ? (
                  <button onClick={() => resolve(r.id)} disabled={resolvingId === r.id} className="mrcap-press" style={{ ...secondaryBtnStyle, width: "100%", padding: "9px", fontSize: 12, opacity: resolvingId === r.id ? 0.5 : 1 }}>
                    {resolvingId === r.id ? "Saving…" : "Mark Resolved"}
                  </button>
                ) : (
                  <button onClick={() => reopen(r.id)} disabled={resolvingId === r.id} className="mrcap-press" style={{ ...secondaryBtnStyle, width: "100%", padding: "9px", fontSize: 12, opacity: resolvingId === r.id ? 0.5 : 1 }}>
                    {resolvingId === r.id ? "Saving…" : "Reopen"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <button onClick={onBack} className="mrcap-press" style={{ ...secondaryBtnStyle, width: "100%", marginTop: 20 }}>Back</button>
    </div>
  );
}

function AdminStatCard({ icon, label, value, sub }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "14px 15px", flex: "1 1 46%", minWidth: 145 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
        {icon}
        <span style={{ fontSize: 10.5, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 21, color: COLORS.ink, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatBars({ rows, formatValue, color }) {
  if (!rows.length) return <ReportEmpty />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ padding: "13px 13px 4px" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: COLORS.ink }}>{r.label}</span>
            <span style={{ color: COLORS.gold, fontWeight: 600 }}>{formatValue ? formatValue(r.value) : r.value}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: COLORS.panel2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(3, (r.value / max) * 100)}%`, borderRadius: 999, background: color || COLORS.gold }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "month", label: "This Month" },
  { key: "90d", label: "90 Days" },
  { key: "6m", label: "6 Months" },
  { key: "all", label: "All Time" },
];
function rangeStartMs(key, now) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (key) {
    case "today": return startOfToday;
    case "7d": return startOfToday - 6 * 24 * 60 * 60 * 1000;
    case "30d": return startOfToday - 29 * 24 * 60 * 60 * 1000;
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case "90d": return startOfToday - 89 * 24 * 60 * 60 * 1000;
    case "6m": return new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
    case "all": default: return 0;
  }
}

// CSV export — a flat sheet Excel/Sheets opens directly, one row per
// number so nothing needs re-parsing on the other end.
// Full raw-data backup — every job, customer, vehicle, and quote as one
// downloadable JSON file. Uses sbFetchAll (real pagination) rather than
// a single request, since these tables now run past the 1000-row
// server cap that quietly broke the dashboard earlier — this has to
// actually get everything, not an arbitrary slice of it.
async function exportFullBackup(onProgress) {
  const tables = ["jobs", "customers", "vehicles", "quotes"];
  const out = { exported_at: new Date().toISOString() };
  for (const t of tables) {
    onProgress?.(t);
    const { ok, data } = await sbFetchAll(`${t}?select=*`);
    if (!ok) return { ok: false };
    out[t] = data || [];
  }
  const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MrCAP-Full-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, counts: Object.fromEntries(tables.map((t) => [t, out[t].length])) };
}

function exportAdminStatsCSV({ rangeLabel, totalRevenue, revenueInRange, activeJobsCount, collectedInRange, avgTurnaroundDays, revenueByMonth, byCategory, staffLeaderboard }) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [];
  lines.push("Mr.CAP Admin Dashboard Export");
  lines.push(`Generated,${esc(new Date().toLocaleString())}`);
  lines.push(`Range,${esc(rangeLabel)}`);
  lines.push("");
  lines.push("Metric,Value");
  lines.push(`Total Revenue (all-time),${totalRevenue}`);
  lines.push(`Revenue in range,${revenueInRange}`);
  lines.push(`Active jobs right now,${activeJobsCount}`);
  lines.push(`Collected in range,${collectedInRange}`);
  lines.push(`Avg turnaround (days),${avgTurnaroundDays != null ? avgTurnaroundDays.toFixed(1) : "n/a"}`);
  lines.push("");
  lines.push("Revenue by month");
  lines.push("Month,Revenue (AED)");
  revenueByMonth.forEach((r) => lines.push(`${esc(r.label)},${r.value}`));
  lines.push("");
  lines.push("Jobs by service category (in range)");
  lines.push("Category,Jobs");
  byCategory.forEach((r) => lines.push(`${esc(r.label)},${r.value}`));
  lines.push("");
  lines.push("Staff leaderboard (in range)");
  lines.push("Staff,Jobs");
  staffLeaderboard.forEach((r) => lines.push(`${esc(r.label)},${r.value}`));

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MrCAP-Dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// PDF export — a one-page summary, same jsPDF conventions as the quote
// and invoice PDFs already in this file (logo header, helvetica, gold
// accents dropped to plain black/grey since this is an internal report).
function exportAdminStatsPDF({ rangeLabel, totalRevenue, revenueInRange, activeJobsCount, collectedInRange, avgTurnaroundDays, revenueByMonth, pipelineByStage, byCategory, staffLeaderboard }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 86;

  drawLetterheadBanner(doc, pageW, margin);

  try { doc.addImage(LOGO_SRC, "PNG", margin, y, 33, 44); } catch (e) { /* logo optional */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(20);
  doc.text("Mr.CAP — Admin Dashboard", margin + 54, y + 20);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Generated ${new Date().toLocaleString()} · Range: ${rangeLabel}`, margin + 54, y + 34);

  y += 64;
  doc.setDrawColor(180); doc.line(margin, y, pageW - margin, y);
  y += 22;

  const statLine = (label, value) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(90);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(20);
    doc.text(String(value), pageW - margin, y, { align: "right" });
    y += 17;
  };
  statLine("Total revenue (all-time)", fmtAED(totalRevenue));
  statLine("Revenue in range", fmtAED(revenueInRange));
  statLine("Active jobs right now", activeJobsCount);
  statLine("Collected in range", collectedInRange);
  statLine("Avg turnaround", avgTurnaroundDays != null ? `${avgTurnaroundDays.toFixed(1)} days` : "Not enough data");

  const table = (title, rows, formatValue) => {
    y += 12;
    doc.setDrawColor(210); doc.line(margin, y, pageW - margin, y);
    y += 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(20);
    doc.text(title, margin, y);
    y += 16;
    rows.forEach((r) => {
      if (y > 780) { doc.addPage(); y = 50; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(70);
      doc.text(r.label, margin, y);
      doc.text(formatValue ? formatValue(r.value) : String(r.value), pageW - margin, y, { align: "right" });
      y += 15;
    });
  };
  table("Revenue by month", revenueByMonth, fmtAED);
  table("Active pipeline by stage", pipelineByStage);
  table("Jobs by service category (in range)", byCategory);
  table("Staff leaderboard (in range)", staffLeaderboard);

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(150);
  doc.text("Mr.CAP — Internal admin report — not for customer distribution", margin, 812);
  doc.save(`MrCAP-Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Started as a pure easter egg; now doubles as a real shortcut — tap it
// (don't drag) to jump straight to the Admin Dashboard from anywhere in
// the app, and it carries a small red badge mirroring the combined
// Follow-ups Due + Warranty Expiring Soon count so there's something to
// glance at even before tapping. A green, wide-winged sports-coupe
// silhouette (big rear wing, front splitter, wide stance) — original
// artwork, not a real photo or badge — that can still be dragged
// anywhere on screen and remembers where you left it via localStorage.
//
// Rendered through a portal straight into document.body — NOT as a
// normal child. .mrcap-view (its would-be parent) has a CSS animation
// that includes a transform, and per spec any ancestor with a transform
// (even a completed one sitting at translateY(0) via fill-mode "both")
// becomes the containing block for position:fixed descendants instead
// of the real viewport. Without the portal this thing silently gets
// trapped inside that div's box — which is exactly what happened; it
// was never actually invisible, just positioned against the wrong box.
// A lightweight bug-report tool, available to everyone (not just
// Suhail) — floats bottom-left so it never collides with the egg's
// default bottom-right spot. Deliberately no screenshot capture: a
// real screen-grab library adds real fragility (cross-origin content,
// dynamic layouts) for a 3-month pilot feature that mainly needs to be
// reliable. Context (which screen, who, device) plus a note is enough
// for someone reviewing these to reproduce most issues.
function ReportIssueButton({ session, view }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    setError(false);
    const { ok } = await sbFetch("issue_reports", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        reported_by: session?.name || null,
        reported_by_role: session?.role || null,
        view_context: view || null,
        note: note.trim(),
        user_agent: navigator.userAgent,
      }]),
    });
    setSubmitting(false);
    if (ok) { setSubmitted(true); setNote(""); setTimeout(() => { setSubmitted(false); setOpen(false); }, 1800); }
    else setError(true);
  };

  return createPortal(
    <>
      <button
        onClick={() => setOpen(true)}
        className="mrcap-press"
        title="Report an issue"
        style={{
          position: "fixed", left: 16, bottom: 16, width: 44, height: 44, borderRadius: "50%",
          background: COLORS.panel, border: `1.5px solid ${COLORS.line}`,
          boxShadow: "0 8px 20px -8px rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 998,
        }}
      >
        <AlertCircle size={18} color={COLORS.muted} />
      </button>

      {open && (
        <div
          onClick={() => !submitting && setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: COLORS.panel, borderTop: `1px solid ${COLORS.line}`, borderRadius: "16px 16px 0 0", padding: 20, boxSizing: "border-box" }}>
            {submitted ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <CheckCircle2 size={28} color={COLORS.green} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 14, color: COLORS.ink, fontWeight: 600 }}>Thanks — logged.</div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 15, color: COLORS.ink, marginBottom: 4 }}>Report an Issue</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 12 }}>What happened? Be as specific as you can — screen, what you tapped, what went wrong.</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Tapped Convert to Job on a quote and the app went white"
                  style={{ ...textareaStyle, marginTop: 0, minHeight: 90 }}
                  autoFocus
                />
                {error && <div style={{ fontSize: 11.5, color: "#E08A78", marginTop: 8 }}>Couldn't send — check your connection and try again.</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => setOpen(false)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1, padding: "11px" }}>Cancel</button>
                  <button onClick={submit} disabled={!note.trim() || submitting} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2, padding: "11px", opacity: !note.trim() || submitting ? 0.5 : 1 }}>
                    {submitting ? "Sending…" : "Send Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

function DraggablePorscheEgg({ badgeCount, onTap }) {
  const [pos, setPos] = useState(() => {
    const size = 60;
    try {
      const saved = JSON.parse(window.localStorage.getItem("mrcap_egg_pos"));
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        // Clamp against the CURRENT viewport — a position saved before the
        // portal fix (or on a different-sized screen) could otherwise sit
        // off-screen forever with no way to find it again.
        return {
          x: Math.min(Math.max(8, saved.x), window.innerWidth - size - 8),
          y: Math.min(Math.max(8, saved.y), window.innerHeight - size - 8),
        };
      }
    } catch { /* fall through to default spot */ }
    return { x: window.innerWidth - 80, y: 140 };
  });
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const startPointRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const clamp = (x, y) => {
    const size = 60;
    return {
      x: Math.min(Math.max(8, x), window.innerWidth - size - 8),
      y: Math.min(Math.max(8, y), window.innerHeight - size - 8),
    };
  };

  const start = (e) => {
    draggingRef.current = true;
    movedRef.current = false;
    const p = e.touches ? e.touches[0] : e;
    startPointRef.current = { x: p.clientX, y: p.clientY };
    offsetRef.current = { x: p.clientX - posRef.current.x, y: p.clientY - posRef.current.y };
  };
  const move = (e) => {
    if (!draggingRef.current) return;
    if (e.touches) e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    // A few px of wobble shouldn't count as a drag — otherwise a plain
    // tap (to jump to the dashboard) almost never registers cleanly.
    if (Math.abs(p.clientX - startPointRef.current.x) > 5 || Math.abs(p.clientY - startPointRef.current.y) > 5) {
      movedRef.current = true;
    }
    setPos(clamp(p.clientX - offsetRef.current.x, p.clientY - offsetRef.current.y));
  };
  const end = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (movedRef.current) {
      try { window.localStorage.setItem("mrcap_egg_pos", JSON.stringify(posRef.current)); } catch { /* not worth blocking over */ }
    } else {
      onTap?.();
    }
  };

  useEffect(() => {
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  });

  return createPortal(
    <div
      onMouseDown={start}
      onTouchStart={start}
      title={badgeCount > 0 ? `${badgeCount} need attention — tap for the dashboard` : "Tap for the dashboard"}
      style={{
        position: "fixed", left: pos.x, top: pos.y, width: 60, height: 60, borderRadius: "50%",
        background: `radial-gradient(circle at 34% 28%, ${COLORS.panel2}, ${COLORS.panel})`,
        border: `1.5px solid ${COLORS.gold}`,
        boxShadow: "0 10px 26px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(201,162,39,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "grab", zIndex: 999, touchAction: "none", userSelect: "none",
      }}
    >
      {badgeCount > 0 && (
        <div style={{
          position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, padding: "0 4px",
          background: COLORS.red, border: `1.5px solid ${COLORS.panel}`, color: "#fff",
          fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO_FONT, pointerEvents: "none",
        }}>
          {badgeCount > 9 ? "9+" : badgeCount}
        </div>
      )}
      <svg width="39" height="39" viewBox="0 0 64 64" fill="none">
        <g transform="translate(31 35) scale(1.08 0.8) translate(-31 -35)">
          <rect x="44" y="19" width="2.2" height="8" fill="#161512" />
          <rect x="53" y="19" width="2.2" height="8" fill="#161512" />
          <rect x="41.5" y="16" width="16" height="3.6" rx="1" fill="#161512" />
          <path d="M6 40c0-3 2-5 5-6l6-8c4-5 10-8 17-8h2c7 0 13 3 17 8l6 8c3 1 5 3 5 6v5c0 2-2 4-4 4h-3a6 6 0 1 1-12 0H24a6 6 0 1 1-12 0H8c-2 0-4-2-4-4v-5z" fill="#39B54A" stroke="#161512" strokeWidth="1.4" />
          <rect x="2" y="37" width="7" height="3" rx="1" fill="#161512" />
          <path d="M21 25c2-3 6-5 10-5h2c4 0 8 2 10 5l2 5H19l2-5z" fill="#1a1918" />
          <circle cx="18" cy="45" r="6" fill="#161512" />
          <circle cx="46" cy="45" r="6" fill="#161512" />
          <circle cx="18" cy="45" r="2.4" fill="#39B54A" />
          <circle cx="46" cy="45" r="2.4" fill="#39B54A" />
        </g>
      </svg>
    </div>,
    document.body
  );
}

function AdminStatsScreen({ team, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [rangeKey, setRangeKey] = useState("30d");
  const [backupProgress, setBackupProgress] = useState(null);
  const [backupResult, setBackupResult] = useState(null);
  const [baseline, setBaseline] = useState(PILOT_BASELINE);
  const [settingBaseline, setSettingBaseline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    // sbFetchAll pages through in 1000-row batches — a single sbFetch
    // here would silently truncate at Supabase's server-side 1000-row
    // cap regardless of any limit= requested, which is exactly what
    // was happening before (revenue, staff, and category numbers were
    // all computed from an arbitrary ~1000-row slice, not the full table).
    const { ok, data } = await sbFetchAll("jobs?select=id,created_at,updated_at,stage_index,service_types,assigned_to,invoice_amount&order=updated_at.desc,id.asc");
    if (!ok) { setError(true); setLoading(false); return; }
    setJobs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const monthKeyOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}`; };
  const rangeLabel = RANGE_PRESETS.find((r) => r.key === rangeKey)?.label || "30 Days";
  const rangeStart = rangeStartMs(rangeKey, now);
  const inRange = (ts) => new Date(ts).getTime() >= rangeStart;

  const invoicedJobs = jobs.filter((j) => parseAED(j.invoice_amount) > 0);
  const totalRevenue = invoicedJobs.reduce((sum, j) => sum + parseAED(j.invoice_amount), 0);
  const revenueInRange = invoicedJobs.filter((j) => inRange(j.updated_at)).reduce((sum, j) => sum + parseAED(j.invoice_amount), 0);

  const COLLECTED_INDEX = STAGES.length - 1;
  const activeJobsCount = jobs.filter((j) => j.stage_index < COLLECTED_INDEX).length;
  const collectedInRange = jobs.filter((j) => j.stage_index === COLLECTED_INDEX && inRange(j.updated_at)).length;

  // Turnaround proxy: created \u2192 last-touched, for jobs collected within
  // the selected range. Real start/stop timers are still sparsely
  // populated on older records, so this is the reliable signal today.
  const turnaroundSamples = jobs
    .filter((j) => j.stage_index === COLLECTED_INDEX && inRange(j.updated_at) && j.created_at && j.updated_at)
    .map((j) => (new Date(j.updated_at) - new Date(j.created_at)) / (1000 * 60 * 60 * 24))
    .filter((d) => d >= 0 && d < 120);
  const avgTurnaroundDays = turnaroundSamples.length >= 5
    ? (turnaroundSamples.reduce((a, b) => a + b, 0) / turnaroundSamples.length)
    : null;

  // Revenue by month, last 6 calendar months — always this window
  // regardless of the range picker above, so there's a stable trend
  // line to compare whatever range you're currently looking at against.
  const monthBuckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: monthLabel(d) };
  });
  const revenueByMonth = monthBuckets.map((b) => ({
    label: b.label,
    value: invoicedJobs.filter((j) => monthKeyOf(j.updated_at) === b.key).reduce((sum, j) => sum + parseAED(j.invoice_amount), 0),
  }));

  // Active pipeline by stage — always a live snapshot, not range-scoped
  // (excludes Collected, which is the archive, not the working pipeline).
  const pipelineByStage = STAGES.slice(0, COLLECTED_INDEX).map((s, i) => ({
    label: s.label,
    value: jobs.filter((j) => j.stage_index === i).length,
  }));

  // Jobs by service category, within the selected range.
  const categoryCounts = {};
  jobs.filter((j) => inRange(j.updated_at)).forEach((j) => (j.service_types || []).forEach((key) => { categoryCounts[key] = (categoryCounts[key] || 0) + 1; }));
  const byCategory = Object.entries(categoryCounts)
    .map(([key, value]) => ({ label: SERVICES.find((s) => s.key === key)?.label || key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Staff leaderboard, within the selected range.
  const staffCounts = {};
  jobs.filter((j) => inRange(j.updated_at)).forEach((j) => {
    Object.values(j.assigned_to || {}).forEach((memberId) => {
      if (!memberId) return;
      staffCounts[memberId] = (staffCounts[memberId] || 0) + 1;
    });
  });
  const staffLeaderboard = Object.entries(staffCounts)
    .map(([id, value]) => ({ label: team.find((m) => m.id === id)?.name || id, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const exportPayload = { rangeLabel, totalRevenue, revenueInRange, activeJobsCount, collectedInRange, avgTurnaroundDays, revenueByMonth, pipelineByStage, byCategory, staffLeaderboard };

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
      <SectionTitle>Admin Dashboard</SectionTitle>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: -10, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <Lock size={12} /> Visible only to you
      </div>

      {loading && <div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Crunching the numbers…</div>}

      {error && (
        <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#E08A78", marginBottom: 8 }}>Couldn't load the dashboard.</div>
          <button onClick={load} className="mrcap-press" style={{ ...secondaryBtnStyle, padding: "8px 14px", fontSize: 12.5 }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
            {RANGE_PRESETS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className="mrcap-press"
                style={{ padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${rangeKey === r.key ? COLORS.gold : COLORS.line}`, background: rangeKey === r.key ? COLORS.gold : COLORS.panel2, color: rangeKey === r.key ? COLORS.darkText : COLORS.muted, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
            <AdminStatCard icon={<TrendingUp size={13} color={COLORS.gold} />} label="Total Revenue" value={fmtAED(totalRevenue)} sub="All-time, invoiced jobs" />
            <AdminStatCard icon={<TrendingUp size={13} color={COLORS.gold} />} label={`Revenue — ${rangeLabel}`} value={fmtAED(revenueInRange)} />
            <AdminStatCard icon={<Clock size={13} color={COLORS.gold} />} label="Active Jobs" value={activeJobsCount} sub="In the pipeline right now" />
            <AdminStatCard icon={<CheckCircle2 size={13} color={COLORS.gold} />} label={`Collected — ${rangeLabel}`} value={collectedInRange} />
            <AdminStatCard icon={<Clock size={13} color={COLORS.gold} />} label="Avg Turnaround" value={avgTurnaroundDays != null ? `${avgTurnaroundDays.toFixed(1)}d` : "—"} sub={avgTurnaroundDays != null ? rangeLabel : "Not enough data yet"} />
            <AdminStatCard icon={<Users size={13} color={COLORS.gold} />} label={`Top Staff — ${rangeLabel}`} value={staffLeaderboard[0]?.label || "—"} sub={staffLeaderboard[0] ? `${staffLeaderboard[0].value} jobs` : undefined} />
          </div>

          <div style={{ background: COLORS.panel, border: `1.5px solid ${COLORS.gold}`, borderRadius: 12, padding: 16, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <TrendingUp size={14} color={COLORS.gold} />
              <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>Pilot Progress</div>
            </div>
            {baseline ? (
              <>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>Since Day 0 — {new Date(baseline.date).toLocaleDateString()}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: COLORS.muted }}>Revenue</span>
                  <span style={{ color: COLORS.ink, fontFamily: MONO_FONT }}>
                    {fmtAED(baseline.revenue)} <span style={{ color: COLORS.gold }}>→</span> {fmtAED(totalRevenue)}
                    <span style={{ color: totalRevenue >= baseline.revenue ? "#7BC494" : "#E08A78", marginLeft: 6 }}>
                      ({totalRevenue - baseline.revenue >= 0 ? "+" : ""}{fmtAED(totalRevenue - baseline.revenue)})
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: COLORS.muted }}>Jobs on file</span>
                  <span style={{ color: COLORS.ink, fontFamily: MONO_FONT }}>
                    {baseline.jobCount} <span style={{ color: COLORS.gold }}>→</span> {jobs.length}
                    <span style={{ color: "#7BC494", marginLeft: 6 }}>(+{jobs.length - baseline.jobCount})</span>
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
                  <span style={{ color: COLORS.muted }}>Collected</span>
                  <span style={{ color: COLORS.ink, fontFamily: MONO_FONT }}>
                    {baseline.collectedCount} <span style={{ color: COLORS.gold }}>→</span> {jobs.filter((j) => j.stage_index === COLLECTED_INDEX).length}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    setSettingBaseline(true);
                    const b = { date: new Date().toISOString(), revenue: totalRevenue, jobCount: jobs.length, collectedCount: jobs.filter((j) => j.stage_index === COLLECTED_INDEX).length };
                    const ok = await savePilotBaseline(b, currentActor);
                    setSettingBaseline(false);
                    if (ok) setBaseline(b);
                  }}
                  disabled={settingBaseline}
                  className="mrcap-press"
                  style={{ ...secondaryBtnStyle, width: "100%", padding: "8px", fontSize: 11, opacity: settingBaseline ? 0.5 : 1 }}
                >
                  {settingBaseline ? "Saving…" : "Reset Day 0 to Today"}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>No baseline set yet — mark today as Day 0 to track progress over the pilot.</div>
                <button
                  onClick={async () => {
                    setSettingBaseline(true);
                    const b = { date: new Date().toISOString(), revenue: totalRevenue, jobCount: jobs.length, collectedCount: jobs.filter((j) => j.stage_index === COLLECTED_INDEX).length };
                    const ok = await savePilotBaseline(b, currentActor);
                    setSettingBaseline(false);
                    if (ok) setBaseline(b);
                  }}
                  disabled={settingBaseline}
                  className="mrcap-press"
                  style={{ ...primaryBtnStyle, width: "100%", padding: "11px", opacity: settingBaseline ? 0.5 : 1 }}
                >
                  {settingBaseline ? "Saving…" : "Set Today as Day 0"}
                </button>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => exportAdminStatsCSV(exportPayload)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1, padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5 }}>
              <Download size={14} /> Export CSV
            </button>
            <button onClick={() => exportAdminStatsPDF(exportPayload)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1, padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5 }}>
              <FileText size={14} /> Export PDF
            </button>
          </div>
          <button
            onClick={async () => {
              setBackupProgress("jobs");
              const result = await exportFullBackup((t) => setBackupProgress(t));
              setBackupProgress(null);
              if (result.ok) { setBackupResult(result.counts); setTimeout(() => setBackupResult(null), 4000); }
            }}
            disabled={!!backupProgress}
            className="mrcap-press"
            style={{ ...secondaryBtnStyle, width: "100%", padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5, marginBottom: 8, opacity: backupProgress ? 0.6 : 1 }}
          >
            <Download size={14} /> {backupProgress ? `Backing up ${backupProgress}…` : "Export Full Backup (everything)"}
          </button>
          {backupResult && (
            <div style={{ fontSize: 11, color: COLORS.muted, textAlign: "center", marginBottom: 14 }}>
              Saved — {backupResult.jobs} jobs, {backupResult.customers} customers, {backupResult.vehicles} vehicles, {backupResult.quotes} quotes
            </div>
          )}
          {!backupResult && <div style={{ marginBottom: 14 }} />}

          <ReportSection title="Revenue by month — last 6 months" icon={<TrendingUp size={14} color={COLORS.gold} />}>
            <StatBars rows={revenueByMonth} formatValue={fmtAED} />
          </ReportSection>

          <ReportSection title="Active pipeline by stage — right now" icon={<Clock size={14} color={COLORS.gold} />}>
            <StatBars rows={pipelineByStage} />
          </ReportSection>

          <ReportSection title={`Jobs by service category — ${rangeLabel}`} icon={<Wrench size={14} color={COLORS.gold} />}>
            <StatBars rows={byCategory} />
          </ReportSection>

          <ReportSection title={`Staff leaderboard — ${rangeLabel}`} icon={<Users size={14} color={COLORS.gold} />}>
            <StatBars rows={staffLeaderboard} />
          </ReportSection>

          <button onClick={onBack} className="mrcap-press" style={{ ...secondaryBtnStyle, width: "100%", marginTop: 4 }}>Back</button>
        </>
      )}
    </div>
  );
}

/* ---------------- Import (admin, historical data) ---------------- */

function ImportScreen({ session, onBack }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null); // { success, failed: [{row, reason}] }
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);
  const fileRef = useRef(null);

  const onFile = (file) => {
    setResults(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    if (!rows || !rows.length) return;
    setImporting(true);
    setProgress(0);
    cancelRef.current = false;
    setCancelled(false);
    const failed = [];
    let success = 0, skipped = 0;

    // Sequential, not parallel — a burst of 800+ simultaneous requests
    // risks tripping Supabase rate limits and makes failures hard to
    // attribute to a specific row. Slower, but reliable and honest about
    // progress as it happens. Safe to re-run on the same file: rows with
    // an invoice number already in the database are skipped, not redone.
    for (let i = 0; i < rows.length; i++) {
      if (cancelRef.current) break;
      const result = await importRow(rows[i], session.name);
      if (result.skipped) skipped++;
      else if (result.ok) success++;
      else failed.push({ row: i + 2, name: rows[i].customer_name, plate: rows[i].plate, reason: result.reason }); // +2: header row + 1-index
      setProgress(i + 1);
    }
    setResults({ success, skipped, failed, cancelled: cancelRef.current });
    setImporting(false);
  };

  const cancelImport = () => { cancelRef.current = true; };

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Import Historical Data</SectionTitle>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: -10, marginBottom: 18 }}>
        Loads past job records as already-Collected job cards, linking or creating customers and vehicles the same way the app does normally.
      </div>

      {!rows && (
        <div style={{ border: `1.5px dashed ${COLORS.line}`, borderRadius: 12, padding: "30px 18px", textAlign: "center" }}>
          <Upload size={26} color={COLORS.gold} style={{ opacity: 0.8, marginBottom: 10 }} />
          <div style={{ fontSize: 13.5, color: COLORS.ink, marginBottom: 14 }}>Choose a CSV file to preview before importing</div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
          <button onClick={() => fileRef.current.click()} className="mrcap-press" style={{ ...primaryBtnStyle, padding: "10px 20px" }}>Choose File</button>
        </div>
      )}

      {rows && !results && (
        <>
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, color: COLORS.ink, fontWeight: 600 }}>{fileName}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>{rows.length} rows ready to import</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Preview (first 5 rows)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {rows.slice(0, 5).map((r, i) => (
                <div key={i} style={{ fontSize: 11.5, color: COLORS.muted, padding: "8px 10px", background: COLORS.panel2, borderRadius: 7 }}>
                  <span style={{ color: COLORS.ink, fontFamily: MONO_FONT }}>{r.plate}</span> · {r.customer_name} · {r.service_types || "no service"} · {r.job_date}
                </div>
              ))}
            </div>
          </div>

          {importing ? (
            <div>
              <div style={{ height: 8, background: COLORS.panel2, borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${(progress / rows.length) * 100}%`, background: COLORS.gold, transition: "width 0.2s ease" }} />
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, textAlign: "center", marginBottom: 12 }}>{progress} / {rows.length}</div>
              <button onClick={cancelImport} className="mrcap-press" style={{ ...secondaryBtnStyle, width: "100%" }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setRows(null)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1 }}>Choose different file</button>
              <button onClick={runImport} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2 }}>Import {rows.length} rows</button>
            </div>
          )}
        </>
      )}

      {results && (
        <div>
          <div style={{ background: "rgba(74,122,87,0.15)", border: `1px solid ${COLORS.green}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#7BC494" }}>{results.success} imported successfully</div>
            {results.skipped > 0 && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>{results.skipped} already existed from a previous run — skipped, not duplicated</div>}
            {results.cancelled && <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 3 }}>Stopped early — {rows.length - progress} rows not attempted.</div>}
          </div>
          {results.failed.length > 0 && (
            <div style={{ background: "rgba(168,64,47,0.15)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E08A78", marginBottom: 8 }}>{results.failed.length} rows failed</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                {results.failed.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: COLORS.muted, fontFamily: MONO_FONT }}>
                    Row {f.row}: {f.name} / {f.plate} — {f.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => { setRows(null); setResults(null); setFileName(""); }} className="mrcap-press" style={{ ...primaryBtnStyle, width: "100%" }}>Import another file</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Quotes list + detail ---------------- */

const QUOTE_STATUS_TONE = { draft: "default", sent: "blue", accepted: "green", declined: "red", converted: "yellow" };
const QUOTE_STATUS_LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", converted: "Converted" };

function QuotesScreen({ onBack, onOpen, onNew }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setQuotes(await loadQuoteIndex());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = quotes.filter((q) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (q.plate || "").toLowerCase().includes(s) || (q.customerName || "").toLowerCase().includes(s);
  });

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 90px" }}>
      <SectionTitle>Quotations</SectionTitle>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} color={COLORS.muted} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plate or customer…" style={{ ...inputStyle, marginTop: 0, paddingLeft: 34 }} />
      </div>

      {loading && <div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 10px", color: COLORS.muted }}>
          <FileText size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 14 }}>No quotations yet.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((q) => (
          <button key={q.id} onClick={() => onOpen(q.id)} className="mrcap-press" style={{ textAlign: "left", width: "100%", boxSizing: "border-box", background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderLeft: `3px solid ${COLORS.gold}`, borderRadius: "4px 10px 10px 4px", padding: "13px 14px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 15, color: COLORS.ink }}>{q.plate || q.customerName}</div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 1 }}>{q.makeModel} {q.plate ? `· ${q.customerName}` : ""}</div>
              </div>
              <Pill tone={QUOTE_STATUS_TONE[q.status] || "default"}>{QUOTE_STATUS_LABEL[q.status] || q.status}</Pill>
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={11} /> {fmtTime(q.updatedAt)}
            </div>
          </button>
        ))}
      </div>

      <FloatingNewJobButton onClick={onNew} label="New Quote" />
    </div>
  );
}

/* ---------------- Edit Quote (creator or admin) ---------------- */
function EditQuoteScreen({ quote, session, onSaved, onCancel }) {
  const [plate, setPlate] = useState(quote.plate || "");
  const [makeModel, setMakeModel] = useState(quote.makeModel || "");
  const [customerName, setCustomerName] = useState(quote.customerName);
  const [customerPhone, setCustomerPhone] = useState(quote.customerPhone || "");
  const [description, setDescription] = useState(quote.description || "");
  const [serviceTypes, setServiceTypes] = useState(quote.serviceTypes || []);
  const [treatments, setTreatments] = useState(quote.treatments || {});
  const [treatmentPrices, setTreatmentPrices] = useState(quote.treatmentPrices || {});
  const [discountPercent, setDiscountPercent] = useState(quote.discountPercent || 0);
  const [parts, setParts] = useState(quote.parts || []);
  const [saving, setSaving] = useState(false);

  const toggleService = (key) => {
    setServiceTypes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
    const isRemoving = serviceTypes.includes(key);
    if (isRemoving) {
      setTreatments((cur) => { const next = { ...cur }; delete next[key]; return next; });
      setTreatmentPrices((p) => {
        const next = {};
        Object.entries(p).forEach(([k, v]) => { if (!k.startsWith(`${key}::`)) next[k] = v; });
        return next;
      });
    }
  };
  const toggleTreatment = (serviceKey, t) => {
    const name = t.name;
    setTreatments((cur) => {
      const list = cur[serviceKey] || [];
      const next = list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
      return { ...cur, [serviceKey]: next };
    });
    const priceKey = `${serviceKey}::${name}`;
    setTreatmentPrices((p) => {
      const already = (treatments[serviceKey] || []).includes(name);
      if (already) { const next = { ...p }; delete next[priceKey]; return next; }
      return { ...p, [priceKey]: t.retail != null ? t.retail : "" };
    });
  };

  const save = async () => {
    setSaving(true);
    const updated = {
      ...quote,
      plate: plate.trim().toUpperCase(), makeModel: makeModel.trim(),
      customerName: customerName.trim(), customerPhone: customerPhone.trim(),
      description: description.trim(),
      serviceTypes, treatments, treatmentPrices, discountPercent, parts,
      updatedAt: Date.now(),
    };
    const ok = await saveQuote(updated);
    setSaving(false);
    onSaved(updated, ok);
  };

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Edit Quotation</SectionTitle>
      <Field label="Plate number (optional)"><input style={{ ...inputStyle, fontFamily: MONO_FONT, letterSpacing: 0.5 }} value={plate} onChange={(e) => setPlate(e.target.value)} /></Field>
      <Field label="Make / model"><input style={inputStyle} value={makeModel} onChange={(e) => setMakeModel(e.target.value)} /></Field>
      <Field label="Customer name"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
      <Field label="Customer phone"><input type="tel" inputMode="numeric" style={inputStyle} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, ""))} /></Field>

      <Field label="Proposed services & treatments">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleServices(serviceTypes).map((s) => (
            <div key={s.key}>
              <button onClick={() => toggleService(s.key)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.line}`, background: serviceTypes.includes(s.key) ? "rgba(74,122,87,0.18)" : COLORS.panel2, cursor: "pointer", width: "100%" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${serviceTypes.includes(s.key) ? COLORS.green : COLORS.muted}`, background: serviceTypes.includes(s.key) ? COLORS.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {serviceTypes.includes(s.key) && <Check size={12} color="#fff" />}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</span>
              </button>
              {serviceTypes.includes(s.key) && s.treatments && (
                <div style={{ padding: "8px 4px 4px 4px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {s.treatments.map((t) => {
                    const picked = (treatments[s.key] || []).includes(t.name);
                    const priceKey = `${s.key}::${t.name}`;
                    return (
                      <div key={t.name}>
                        <button onClick={() => toggleTreatment(s.key, t)} className="mrcap-press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 7, border: `1px solid ${picked ? COLORS.gold : COLORS.line}`, background: picked ? "rgba(201,162,39,0.12)" : COLORS.panel, cursor: "pointer", textAlign: "left", width: "100%", boxSizing: "border-box" }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${picked ? COLORS.gold : COLORS.muted}`, background: picked ? COLORS.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {picked && <Check size={9} color={COLORS.darkText} />}
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.ink }}>{t.name}</span>
                        </button>
                        {picked && (
                          <div style={{ padding: "5px 9px 0 30px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10.5, color: COLORS.muted }}>AED</span>
                              <input type="number" value={treatmentPrices[priceKey] ?? ""} onChange={(e) => setTreatmentPrices((p) => ({ ...p, [priceKey]: e.target.value }))} style={{ width: 90, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 11.5, color: COLORS.gold, fontFamily: MONO_FONT }} />
                              {t.retail != null && Number(treatmentPrices[priceKey]) !== t.retail && (
                                <span style={{ fontSize: 10, color: COLORS.muted, textDecoration: "line-through", fontFamily: MONO_FONT }}>AED {t.retail.toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Field>

      <Field label="Parts & fees (sourced externally — doors, windshields, rims, tow recovery, etc.)">
        <PartsEditor parts={parts} onChange={setParts} />
      </Field>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginBottom: 8 }}>
          <span>Services Subtotal</span>
          <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>AED {Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0).toLocaleString()}</span>
        </div>
        <div style={{ marginBottom: 4 }}>
          <DiscountPicker value={discountPercent} onChange={setDiscountPercent} subtotal={Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0)} />
        </div>
        {parts.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: COLORS.muted, marginTop: 8 }}>
            <span>Parts & Fees</span>
            <span style={{ fontFamily: MONO_FONT, color: COLORS.ink }}>AED {Math.round(parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)).toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.line}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>Estimated Total</span>
          <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: COLORS.gold }}>
            AED {Math.round(
              Object.values(treatmentPrices).reduce((sum, v) => sum + (Number(v) || 0), 0) * (1 - discountPercent / 100)
              + parts.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0)
            ).toLocaleString()}
          </span>
        </div>
      </div>

      <Field label="Notes">
        <textarea style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the customer is asking about" />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1 }}>Cancel</button>
        <button onClick={save} disabled={saving || !customerName.trim()} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 2, opacity: saving || !customerName.trim() ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function QuoteDetail({ id, session, team, onBack, onConverted }) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Same reasoning as JobDetail: editing a quote is a sub-screen toggle,
  // not a top-level view change, so it needs its own history entry.
  const [editing, setEditingRaw] = useState(false);
  const setEditing = useCallback((next) => {
    if (next) {
      window.history.pushState({ mrcapQuoteEditing: true }, "");
      setEditingRaw(true);
    } else {
      setEditingRaw(false);
    }
  }, []);
  useEffect(() => {
    const onPop = (e) => {
      if (!e.state || !e.state.mrcapQuoteEditing) setEditingRaw(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setQuote(await loadQuote(id));
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status) => {
    const updated = { ...quote, status, updatedAt: Date.now() };
    await saveQuote(updated);
    setQuote(updated);
  };

  const handleConvert = async () => {
    setConverting(true);
    const result = await convertQuoteToJob(quote, session);
    setConverting(false);
    if (result.ok) onConverted(result.job);
  };

  const handleDelete = async () => {
    await deleteQuote(quote.id);
    onBack();
  };

  if (loading) return <div style={{ padding: 30, color: COLORS.muted, textAlign: "center" }}>Loading quotation…</div>;
  if (!quote) return <div style={{ padding: 30, color: COLORS.muted, textAlign: "center" }}>Quotation not found.</div>;

  // Edit access: admins with the editJob permission, OR whoever created
  // this specific quote — lets anyone fix their own typo without needing
  // full admin edit rights, per the shop's explicit request.
  const canEditQuote = hasPermission(session, team, "editJob") || quote.createdBy === session.name;

  if (editing) {
    return <EditQuoteScreen quote={quote} session={session} onSaved={(updated) => { setQuote(updated); window.history.back(); }} onCancel={() => window.history.back()} />;
  }

  const activeServices = SERVICES.filter((s) => quote.serviceTypes.includes(s.key));
  const partsTotal = (quote.parts || []).reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0);
  const total = Object.values(quote.treatmentPrices || {}).reduce((sum, v) => sum + (Number(v) || 0), 0) * (1 - (quote.discountPercent || 0) / 100) + partsTotal;

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 34px" }}>
      <div style={{ background: `linear-gradient(160deg, ${COLORS.panel2}, ${COLORS.panel})`, border: `1px solid ${COLORS.line}`, borderTop: `2px solid ${COLORS.gold}`, borderRadius: 12, padding: "18px 16px 15px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: MONO_FONT, fontWeight: 600, fontSize: 20, color: COLORS.ink, letterSpacing: 0.5 }}>{quote.plate || "No plate"}</div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 3 }}>{quote.makeModel} · {quote.customerName}</div>
          </div>
          <Pill tone={QUOTE_STATUS_TONE[quote.status] || "default"}>{QUOTE_STATUS_LABEL[quote.status] || quote.status}</Pill>
        </div>
        {total > 0 && (
          <div style={{ marginTop: 12, fontFamily: MONO_FONT, fontWeight: 700, fontSize: 18, color: COLORS.gold }}>AED {Math.round(total).toLocaleString()}</div>
        )}
        {quote.acceptedAt && (
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Accepted by customer {new Date(quote.acceptedAt).toLocaleString()}</div>
        )}
      </div>

      <button
        onClick={() => { const doc = generateQuotePDF(quote); doc.save(`MrCAP-Quote-${(quote.plate || quote.customerName).replace(/\s+/g, "-")}.pdf`); }}
        className="mrcap-press"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: COLORS.gold, color: COLORS.darkText, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12 }}
      >
        <FileText size={15} /> Generate E-Quote (PDF)
      </button>

      {quote.customerPhone && (
        <WhatsAppSendButton
          phone={quote.customerPhone}
          templateKey="quote_sent"
          vars={{ customerName: quote.customerName || "", makeModel: quote.makeModel || "vehicle", plate: quote.plate || "", total: total > 0 ? Math.round(total).toLocaleString() : "0", quoteLink: `${window.location.origin}/?quote=${quote.id}` }}
          label="Send Quote on WhatsApp"
        />
      )}

      {canEditQuote && quote.status !== "converted" && (
        <button onClick={() => setEditing(true)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "10px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.08)", color: COLORS.gold, fontWeight: 600, fontSize: 12.5, cursor: "pointer", marginBottom: 12 }}>
          <Wrench size={13} /> Edit Quotation
        </button>
      )}

      {quote.status !== "converted" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["sent", "accepted", "declined"].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${quote.status === s ? COLORS.gold : COLORS.line}`, background: quote.status === s ? COLORS.gold : COLORS.panel2, color: quote.status === s ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{QUOTE_STATUS_LABEL[s]}</button>
          ))}
        </div>
      )}

      {quote.status === "accepted" && (
        <button onClick={handleConvert} disabled={converting} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: 10, border: "none", background: COLORS.green, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 12 }}>
          <CheckCircle2 size={16} /> {converting ? "Converting…" : "Convert to Job"}
        </button>
      )}

      {quote.status === "converted" && (
        <div style={{ background: "rgba(74,122,87,0.15)", border: `1px solid ${COLORS.green}`, borderRadius: 10, padding: 14, marginBottom: 12, textAlign: "center", color: "#7BC494", fontWeight: 700, fontSize: 13 }}>
          Converted to a real job card
        </div>
      )}

      {activeServices.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Proposed services</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {activeServices.map((s) => (
              <div key={s.key} style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{(quote.treatments[s.key] || []).join(", ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(quote.parts || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Parts & fees</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {quote.parts.map((p) => (
              <div key={p.id} style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{p.description || (p.type === "fee" ? "Fee" : "Part")}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    Qty {p.qty || 1}{p.discountPercent > 0 ? ` · ${p.discountPercent}% off` : ""}
                  </div>
                </div>
                <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 13, color: COLORS.gold, whiteSpace: "nowrap" }}>
                  AED {Math.round((Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100)).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quote.description && <InfoBlock title="Notes">{quote.description}</InfoBlock>}

      {hasPermission(session, team, "delete") && (
        <button onClick={() => setShowDeleteConfirm(true)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "10px", borderRadius: 10, border: `1.5px solid ${COLORS.red}`, background: "rgba(168,64,47,0.1)", color: COLORS.red, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 8 }}>
          <X size={14} /> Delete Quotation
        </button>
      )}
      {showDeleteConfirm && (
        <div className="mrcap-fade" style={{ background: "rgba(168,64,47,0.12)", border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: 14, marginTop: 10 }}>
          <div style={{ fontSize: 12.5, color: "#E08A78", marginBottom: 10 }}>Delete this quotation permanently?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowDeleteConfirm(false)} className="mrcap-press" style={{ ...secondaryBtnStyle, flex: 1, padding: "9px", fontSize: 12.5 }}>Cancel</button>
            <button onClick={handleDelete} className="mrcap-press" style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: COLORS.red, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Turns a label into a stable lowercase key ("Ceramic Coating" ->
// "ceramic_coating"), used for new category/role/treatment ids. Falls
// back to a short random suffix if the slug is empty (e.g. label was
// all punctuation) so we never write a blank key.
function slugify(label) {
  const base = (label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `item_${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------- Public links — no login, scoped to one job/quote ---------------- */
// Reached via ?track=<jobId> or ?quote=<quoteId> in the URL (see the
// router in main.jsx, which checks for these BEFORE the main app even
// mounts, so there's no session/team loading overhead for a customer
// who's just checking on their car). Deliberately minimal selects —
// only fields safe to hand to a customer, nothing internal (no cost,
// no markup, no notes, no other customers' data). Job/quote ids are
// high-entropy UUIDs (gen_random_uuid()), which is what makes a bare
// link like this reasonable to share at all instead of requiring login.
function PublicPageShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 18px" }}>
      <div style={{ width: 64, height: 64, borderRadius: 14, background: "#fff", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, boxSizing: "border-box", border: `1px solid ${COLORS.line}`, boxShadow: `0 0 0 1px rgba(201,162,39,0.15), 0 12px 30px -12px rgba(0,0,0,0.6)` }}>
        <img src={LOGO_SRC} alt="Mr.CAP" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 15, color: COLORS.ink, letterSpacing: 0.5, marginBottom: 28 }}>Mr.CAP</div>
      <div style={{ width: "100%", maxWidth: 440 }}>{children}</div>
    </div>
  );
}

function PublicJobTracker({ jobId }) {
  const [status, setStatus] = useState("loading"); // loading | ok | notfound | error
  const [job, setJob] = useState(null);

  useEffect(() => {
    (async () => {
      if (!jobId) { setStatus("notfound"); return; }
      const { ok, data } = await sbFetch(`jobs?id=eq.${jobId}&select=plate,make_model,customer_name,stage_index,created_at,updated_at,customer_status_note,customer_status_updated_at`);
      if (!ok) { setStatus("error"); return; }
      if (!data || !data.length) { setStatus("notfound"); return; }
      setJob(data[0]);
      setStatus("ok");
    })();
  }, [jobId]);

  if (status === "loading") {
    return <PublicPageShell><div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading…</div></PublicPageShell>;
  }
  if (status === "notfound" || status === "error") {
    return (
      <PublicPageShell>
        <div style={{ textAlign: "center", color: COLORS.muted, padding: 20 }}>
          {status === "notfound" ? "We couldn't find that job. The link may be out of date." : "Something went wrong loading this page. Please try again."}
        </div>
      </PublicPageShell>
    );
  }

  const stage = STAGES[job.stage_index] || STAGES[0];
  const isReady = stage.key === "ready";
  const isCollected = stage.key === "collected";

  return (
    <PublicPageShell>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 22, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>Your Vehicle</div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 19, color: COLORS.ink, marginTop: 4 }}>{job.make_model || "Vehicle"}</div>
        <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: COLORS.gold, marginTop: 2 }}>{job.plate || ""}</div>

        <div style={{ margin: "22px 0 6px" }}>
          <StageStrip currentIndex={job.stage_index} />
        </div>

        <div style={{
          marginTop: 18, padding: "14px 16px", borderRadius: 10,
          background: isReady ? "rgba(201,162,39,0.12)" : isCollected ? "rgba(74,122,87,0.12)" : COLORS.panel2,
          border: `1px solid ${isReady ? COLORS.gold : isCollected ? COLORS.green : COLORS.line}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: isReady ? COLORS.gold : isCollected ? "#7BC494" : COLORS.ink }}>
            {isReady ? "Ready for collection!" : isCollected ? "Collected — thank you!" : (job.customer_status_note || `Currently: ${stage.label}`)}
          </div>
          {!isReady && !isCollected && job.customer_status_note && (
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>{stage.label} stage</div>
          )}
          {!isCollected && (
            <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 5 }}>
              We'll message you on WhatsApp as this moves along.
            </div>
          )}
        </div>
      </div>
    </PublicPageShell>
  );
}

function PublicQuoteView({ quoteId }) {
  const [status, setStatus] = useState("loading"); // loading | ok | notfound | error
  const [quote, setQuote] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(false);

  const load = useCallback(async () => {
    if (!quoteId) { setStatus("notfound"); return; }
    const q = await loadQuote(quoteId);
    if (!q) { setStatus("notfound"); return; }
    setQuote(q);
    setStatus("ok");
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

  const accept = async () => {
    setAccepting(true);
    setAcceptError(false);
    // Not a real team member, but sbFetch's activity-log write wants an
    // actor — this makes it clear in the log that it was the customer
    // self-accepting via the public link, not a spoofed team action.
    currentActor = { id: "customer", name: quote.customerName || "Customer", role: "customer" };
    nextActivitySummary = `Customer accepted quotation via public link (${quote.plate || quote.makeModel || quote.id})`;
    const { ok } = await sbFetch(`quotes?id=eq.${quoteId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "accepted", accepted_at: new Date().toISOString() }),
    });
    setAccepting(false);
    if (ok) { setQuote((q) => ({ ...q, status: "accepted", acceptedAt: Date.now() })); }
    else setAcceptError(true);
  };

  if (status === "loading") {
    return <PublicPageShell><div style={{ textAlign: "center", color: COLORS.muted, padding: 30 }}>Loading…</div></PublicPageShell>;
  }
  if (status === "notfound") {
    return <PublicPageShell><div style={{ textAlign: "center", color: COLORS.muted, padding: 20 }}>We couldn't find that quotation. The link may be out of date.</div></PublicPageShell>;
  }

  const activeServices = SERVICES.filter((s) => quote.serviceTypes.includes(s.key));
  const partsTotal = (quote.parts || []).reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100), 0);
  const servicesSubtotal = Object.values(quote.treatmentPrices || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const total = servicesSubtotal * (1 - (quote.discountPercent || 0) / 100) + partsTotal;
  const isAccepted = quote.status === "accepted";

  return (
    <PublicPageShell>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 22 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>Quotation for</div>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 19, color: COLORS.ink, marginTop: 4 }}>{quote.makeModel || "Vehicle"}</div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: COLORS.gold, marginTop: 2 }}>{quote.plate || ""}</div>
        </div>

        {activeServices.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {activeServices.map((s) => (
              <div key={s.key} style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 11px", marginBottom: 6 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{s.label}</div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{(quote.treatments[s.key] || []).join(", ")}</div>
              </div>
            ))}
          </div>
        )}

        {(quote.parts || []).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {quote.parts.map((p) => (
              <div key={p.id} style={{ background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 11px", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{p.description || (p.type === "fee" ? "Fee" : "Part")}</div>
                <div style={{ fontFamily: MONO_FONT, fontSize: 12.5, color: COLORS.gold }}>AED {Math.round((Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100)).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: `1px dashed ${COLORS.line}` }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>Total</span>
          <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 19, color: COLORS.gold }}>AED {Math.round(total).toLocaleString()}</span>
        </div>

        {isAccepted ? (
          <div style={{ marginTop: 6, textAlign: "center", padding: "14px 16px", borderRadius: 10, background: "rgba(74,122,87,0.12)", border: `1px solid ${COLORS.green}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#7BC494" }}>Accepted — thank you!</div>
            <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 5 }}>We'll be in touch to book you in.</div>
          </div>
        ) : (
          <>
            {acceptError && <div style={{ fontSize: 11.5, color: "#E08A78", marginBottom: 10, textAlign: "center" }}>Couldn't save that — please try again.</div>}
            <button
              onClick={accept}
              disabled={accepting}
              className="mrcap-press"
              style={{ ...primaryBtnStyle, width: "100%", marginTop: 6, opacity: accepting ? 0.6 : 1 }}
            >
              {accepting ? "Saving…" : "Accept Quotation"}
            </button>
          </>
        )}
      </div>
    </PublicPageShell>
  );
}

// The one thing checked before the real app even mounts — see main.jsx.
export function PublicLinkRouter() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("track");
  const quoteId = params.get("quote");
  if (jobId) return <PublicJobTracker jobId={jobId} />;
  if (quoteId) return <PublicQuoteView quoteId={quoteId} />;
  return null;
}

/* ---------------- Services & Pricing (admin: add/edit/retire, no redeploy) ---------------- */
function ServicesManagementScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [expanded, setExpanded] = useState(null); // category id currently open
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await loadAllServiceData();
    setRoles(data.roles);
    setCategories(data.categories);
    setTreatments(data.treatments);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const treatmentsFor = (catId) => treatments.filter((t) => t.category_key === catId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const roleLabel = (roleId) => roles.find((r) => r.id === roleId)?.label || roleId;

  const toggleCategoryActive = async (cat) => {
    setBusy(true);
    await setServiceCategoryActive(cat.id, !cat.active);
    await reload();
    setBusy(false);
  };
  const toggleTreatmentActive = async (t) => {
    setBusy(true);
    await setServiceTreatmentActive(t.id, !t.active);
    await reload();
    setBusy(false);
  };

  if (loading) return <div className="mrcap-view" style={{ padding: "0 18px 30px" }}><SectionTitle>Services & Pricing</SectionTitle><div style={{ padding: 30, textAlign: "center", color: COLORS.muted }}>Loading…</div></div>;

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Services & Pricing</SectionTitle>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 16, lineHeight: 1.5 }}>
        Retiring a service or treatment only hides it from new jobs and quotations — anything already using it keeps showing correctly.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {categories.map((cat) => {
          const isOpen = expanded === cat.id;
          const catTreatments = treatmentsFor(cat.id);
          return (
            <div key={cat.id} style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, background: COLORS.panel, overflow: "hidden", opacity: cat.active ? 1 : 0.6 }}>
              <button onClick={() => setExpanded(isOpen ? null : cat.id)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <div>
                  <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 14.5, color: COLORS.ink }}>{cat.label}{!cat.active && <span style={{ color: COLORS.muted, fontWeight: 500 }}> · Retired</span>}</div>
                  <div style={{ marginTop: 4 }}><Pill bg="rgba(201,162,39,0.12)" fg={COLORS.gold}>{roleLabel(cat.role)}</Pill></div>
                </div>
                <span style={{ fontSize: 11, color: COLORS.muted }}>{catTreatments.length} treatment{catTreatments.length === 1 ? "" : "s"}</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${COLORS.line}`, padding: "10px 12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                    {catTreatments.map((t) => (
                      <TreatmentEditInline key={t.id} treatment={t} onSaved={reload} onToggleActive={() => toggleTreatmentActive(t)} busy={busy} />
                    ))}
                    {catTreatments.length === 0 && <div style={{ fontSize: 12, color: COLORS.muted }}>No treatments yet.</div>}
                  </div>

                  <NewTreatmentInline categoryKey={cat.id} nextSort={catTreatments.length} onCreated={reload} />

                  <button
                    onClick={() => toggleCategoryActive(cat)}
                    disabled={busy}
                    className="mrcap-press"
                    style={{ marginTop: 10, fontSize: 11.5, color: cat.active ? COLORS.red : COLORS.green, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}
                  >
                    {cat.active ? "Retire this category" : "Re-activate this category"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showNewCategory ? (
        <NewCategoryInline roles={roles} categories={categories} nextSort={categories.length} onCreated={async () => { setShowNewCategory(false); await reload(); }} onCancel={() => setShowNewCategory(false)} />
      ) : (
        <button onClick={() => setShowNewCategory(true)} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.1)", color: COLORS.gold, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <Plus size={15} /> New Service Category
        </button>
      )}
    </div>
  );
}

function TreatmentEditInline({ treatment, onSaved, onToggleActive, busy }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(treatment.name);
  const [retail, setRetail] = useState(treatment.retail ?? "");
  const [b2b, setB2b] = useState(treatment.b2b ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await saveServiceTreatment({
      id: treatment.id,
      category_key: treatment.category_key,
      name: name.trim(),
      retail: retail === "" ? null : Number(retail),
      b2b: b2b === "" ? null : Number(b2b),
    });
    setSaving(false);
    setEditing(false);
    onSaved && onSaved();
  };

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px", borderRadius: 8, background: COLORS.panel2 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13 }} placeholder="Treatment name" />
        <div style={{ display: "flex", gap: 6 }}>
          <input value={retail} onChange={(e) => setRetail(e.target.value)} type="number" style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13 }} placeholder="Retail AED" />
          <input value={b2b} onChange={(e) => setB2b(e.target.value)} type="number" style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13 }} placeholder="B2B AED" />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={save} disabled={saving || !name.trim()} className="mrcap-press" style={{ fontSize: 11.5, color: "#fff", background: COLORS.green, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
          <button onClick={() => { setEditing(false); setName(treatment.name); setRetail(treatment.retail ?? ""); setB2b(treatment.b2b ?? ""); }} className="mrcap-press" style={{ fontSize: 11.5, color: COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 9px", borderRadius: 8, background: COLORS.panel2, opacity: treatment.active ? 1 : 0.55 }}>
      <div>
        <div style={{ fontSize: 13, color: COLORS.ink }}>{treatment.name}{!treatment.active && <span style={{ color: COLORS.muted }}> · Retired</span>}</div>
        <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: MONO_FONT }}>
          {treatment.retail != null ? `Retail ${treatment.retail}` : "Retail —"} · {treatment.b2b != null ? `B2B ${treatment.b2b}` : "B2B —"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button onClick={() => setEditing(true)} className="mrcap-press" style={{ fontSize: 10.5, color: COLORS.ink, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer" }}>Edit</button>
        <button onClick={onToggleActive} disabled={busy} className="mrcap-press" style={{ fontSize: 10.5, color: treatment.active ? COLORS.red : COLORS.green, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer" }}>{treatment.active ? "Retire" : "Restore"}</button>
      </div>
    </div>
  );
}

function NewTreatmentInline({ categoryKey, nextSort, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [retail, setRetail] = useState("");
  const [b2b, setB2b] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await saveServiceTreatment({
      category_key: categoryKey,
      name: name.trim(),
      retail: retail === "" ? null : Number(retail),
      b2b: b2b === "" ? null : Number(b2b),
      sort_order: nextSort,
    });
    setSaving(false);
    setName(""); setRetail(""); setB2b(""); setOpen(false);
    onCreated && onCreated();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mrcap-press" style={{ fontSize: 11.5, color: COLORS.gold, background: "none", border: `1px dashed ${COLORS.gold}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", width: "100%" }}>
        + Add treatment
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px", borderRadius: 8, background: COLORS.panel2 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13 }} placeholder="Treatment name" autoFocus />
      <div style={{ display: "flex", gap: 6 }}>
        <input value={retail} onChange={(e) => setRetail(e.target.value)} type="number" style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13 }} placeholder="Retail AED (optional)" />
        <input value={b2b} onChange={(e) => setB2b(e.target.value)} type="number" style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13 }} placeholder="B2B AED (optional)" />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={create} disabled={saving || !name.trim()} className="mrcap-press" style={{ fontSize: 11.5, color: "#fff", background: COLORS.green, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? "Adding…" : "Add"}</button>
        <button onClick={() => { setOpen(false); setName(""); setRetail(""); setB2b(""); }} className="mrcap-press" style={{ fontSize: 11.5, color: COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function NewCategoryInline({ roles, categories, nextSort, onCreated, onCancel }) {
  const [label, setLabel] = useState("");
  const [roleMode, setRoleMode] = useState("existing"); // 'existing' | 'new'
  const [roleId, setRoleId] = useState(roles.find((r) => r.active !== false)?.id || "");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#7A4F9E");
  const [newRoleSimplified, setNewRoleSimplified] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (!label.trim()) return;
    if (roleMode === "new" && !newRoleLabel.trim()) { setError("Enter a name for the new role."); return; }
    setSaving(true);
    setError("");

    let finalRoleId = roleId;
    if (roleMode === "new") {
      finalRoleId = slugify(newRoleLabel);
      if (roles.some((r) => r.id === finalRoleId)) {
        setError(`A role with a matching key ("${finalRoleId}") already exists — try a slightly different name.`);
        setSaving(false);
        return;
      }
      const roleOk = await saveServiceRole({
        id: finalRoleId,
        label: newRoleLabel.trim(),
        color: newRoleColor,
        simplified: newRoleSimplified,
        sort_order: roles.length,
        active: true,
      });
      if (!roleOk) { setError("Could not create the new role — try again."); setSaving(false); return; }
    }

    if (!finalRoleId) { setError("Pick a role for this category."); setSaving(false); return; }

    const catId = slugify(label);
    if (categories.some((c) => c.id === catId)) {
      setError(`A category with a matching key ("${catId}") already exists — try a slightly different name.`);
      setSaving(false);
      return;
    }
    const catOk = await saveServiceCategory({
      id: catId,
      label: label.trim(),
      role: finalRoleId,
      reviewer_role: null,
      reviewer_note: null,
      sort_order: nextSort,
      active: true,
    });
    setSaving(false);
    if (!catOk) { setError("Could not create the category — try again."); return; }
    setLabel(""); setNewRoleLabel("");
    onCreated && onCreated();
  };

  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 13, padding: 15, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 15 }}>New service category</div>
      <Field label="Category name"><input autoFocus style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ceramic Coating" /></Field>

      <Field label="Who does this work?">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={() => setRoleMode("existing")} className="mrcap-press" style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${roleMode === "existing" ? COLORS.gold : COLORS.line}`, background: roleMode === "existing" ? COLORS.gold : COLORS.panel2, color: roleMode === "existing" ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>Existing role</button>
          <button onClick={() => setRoleMode("new")} className="mrcap-press" style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${roleMode === "new" ? COLORS.gold : COLORS.line}`, background: roleMode === "new" ? COLORS.gold : COLORS.panel2, color: roleMode === "new" ? COLORS.darkText : COLORS.ink, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>New role</button>
        </div>
        {roleMode === "existing" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {roles.filter((r) => r.active !== false).map((r) => (
              <button key={r.id} onClick={() => setRoleId(r.id)} className="mrcap-press" style={{ padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${roleId === r.id ? COLORS.gold : COLORS.line}`, background: roleId === r.id ? COLORS.gold : COLORS.panel2, color: roleId === r.id ? COLORS.darkText : COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{r.label}</button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input style={{ ...inputStyle, marginTop: 0 }} value={newRoleLabel} onChange={(e) => setNewRoleLabel(e.target.value)} placeholder="New role name, e.g. Ceramic Coating" />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: COLORS.muted }}>Color</span>
              <input type="color" value={newRoleColor} onChange={(e) => setNewRoleColor(e.target.value)} style={{ width: 40, height: 30, border: `1px solid ${COLORS.line}`, borderRadius: 6, background: "none", cursor: "pointer" }} />
              <button onClick={() => setNewRoleSimplified((v) => !v)} className="mrcap-press" style={{ marginLeft: "auto", fontSize: 11.5, color: newRoleSimplified ? COLORS.gold : COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "6px 9px", cursor: "pointer" }}>
                {newRoleSimplified ? "Simplified shop-floor view" : "Full admin-style view"}
              </button>
            </div>
          </div>
        )}
      </Field>

      {error && <div style={{ fontSize: 12, color: COLORS.red }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={create} disabled={saving || !label.trim()} className="mrcap-press" style={{ ...primaryBtnStyle, flex: 1, opacity: saving || !label.trim() ? 0.5 : 1 }}>{saving ? "Creating…" : "Create category"}</button>
        <button onClick={onCancel} className="mrcap-press" style={{ padding: "13px 16px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "none", color: COLORS.muted, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------------- Activity Log (private — id "owner" / "AJF" only, not
   just anyone with the admin role, deliberately not even the other
   admin) ---------------- */
function ActivityLogScreen({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all"); // all | write | login | view

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await sbFetch("activity_log?select=*&order=created_at.desc&limit=300");
    setRows(ok && data ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterType === "all" ? rows : rows.filter((r) => r.action_type === filterType);

  const typeTone = (t) => (t === "write" ? "yellow" : t === "login" ? "default" : "default");

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Activity Log</SectionTitle>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 14 }}>
        Every action across the whole system — private to this login only.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {["all", "write", "login", "view"].map((t) => (
          <button key={t} onClick={() => setFilterType(t)} className="mrcap-press" style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${filterType === t ? COLORS.gold : COLORS.line}`, background: filterType === t ? "rgba(201,162,39,0.15)" : "none", color: filterType === t ? COLORS.gold : COLORS.muted, fontSize: 11.5, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
        <button onClick={load} className="mrcap-press" style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 999, border: `1px solid ${COLORS.line}`, background: "none", color: COLORS.muted, fontSize: 11.5, cursor: "pointer" }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: COLORS.muted }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: COLORS.muted }}>No activity recorded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {filtered.map((r) => (
            <div key={r.id} style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 12.5, color: COLORS.ink, flex: 1 }}>{r.detail || `${r.method || ""} ${r.table_name || ""}`}</div>
                <Pill tone={typeTone(r.action_type)}>{r.action_type}</Pill>
              </div>
              <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 4, fontFamily: MONO_FONT }}>
                {r.actor_name || "Unknown"} ({r.actor_role || "—"}) · {fmtTime(new Date(r.created_at).getTime())}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamScreen({ team, setTeam, session, onBack, onImport, onServices, canServices, onActivityLog }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("intake");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const addMember = async () => {
    if (!name.trim()) return;
    const blankPerms = Object.fromEntries(PERMISSIONS.map((p) => [p.key, false]));
    const next = [...team, { id: uid("member"), name: name.trim(), role, pin: null, permissions: { ...blankPerms, newJob: true } }];
    setTeam(next);
    await saveTeam(next);
    setName("");
  };
  const resetPin = async (id) => {
    const next = team.map((m) => (m.id === id ? { ...m, pin: null } : m));
    setTeam(next);
    await saveTeam(next);
  };
  const togglePermission = async (id, key) => {
    const next = team.map((m) => (m.id === id ? { ...m, permissions: { ...m.permissions, [key]: !m.permissions?.[key] } } : m));
    setTeam(next);
    await saveTeam(next);
  };
  const removeMember = async (id) => {
    if (id === session.id) return;
    const next = team.filter((m) => m.id !== id);
    setTeam(next);
    await saveTeam(next);
  };
  const startEdit = (m) => { setEditingId(m.id); setEditName(m.name); };
  const saveEdit = async (id) => {
    if (!editName.trim()) return;
    const next = team.map((m) => (m.id === id ? { ...m, name: editName.trim() } : m));
    setTeam(next);
    await saveTeam(next);
    setEditingId(null);
  };

  return (
    <div className="mrcap-view" style={{ padding: "0 18px 30px" }}>
      <SectionTitle>Team</SectionTitle>

      {canServices && (
        <button onClick={onServices} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.1)", color: COLORS.gold, fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
          <Wrench size={15} /> Services & Pricing
        </button>
      )}
      {session.id === "owner" && (
        <button onClick={onActivityLog} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.1)", color: COLORS.gold, fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
          <ShieldAlert size={15} /> Activity Log
        </button>
      )}
      <button onClick={onImport} className="mrcap-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 10, border: `1.5px dashed ${COLORS.gold}`, background: "rgba(201,162,39,0.1)", color: COLORS.gold, fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 18 }}>
        <Upload size={15} /> Import Historical Data
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {team.map((m) => {
          const isAdmin = m.role === "admin";
          return (
            <div key={m.id} style={{ borderRadius: 12, border: `1px solid ${COLORS.line}`, background: COLORS.panel, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", borderBottom: `1px solid ${COLORS.line}` }}>
                {editingId === m.id ? (
                  <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, marginTop: 0, padding: "7px 9px", fontSize: 13.5 }} />
                    <button onClick={() => saveEdit(m.id)} className="mrcap-press" style={{ fontSize: 11.5, color: "#fff", background: COLORS.green, border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                    <button onClick={() => setEditingId(null)} className="mrcap-press" style={{ fontSize: 11.5, color: COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <div style={{ fontFamily: MONO_FONT, fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{m.name}</div>
                      <Pill bg={`${ROLE_DEFS[m.role].color}33`} fg={ROLE_DEFS[m.role].color}>{ROLE_DEFS[m.role].label}</Pill>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(m)} className="mrcap-press" style={{ fontSize: 11, color: COLORS.ink, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer" }}>Rename</button>
                      <button onClick={() => resetPin(m.id)} className="mrcap-press" style={{ fontSize: 11, color: COLORS.muted, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer" }}>PIN</button>
                      {m.id !== session.id && (
                        <button onClick={() => removeMember(m.id)} className="mrcap-press" style={{ fontSize: 11, color: COLORS.red, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer" }}>Remove</button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Permission grid — every real capability, individually
                  toggleable. Admins always show every permission as
                  locked-on, matching "God's Eye always has everything,
                  can't be turned off" exactly. */}
              <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {PERMISSIONS.map((p) => {
                  const on = isAdmin ? true : !!m.permissions?.[p.key];
                  return (
                    <button
                      key={p.key}
                      onClick={() => !isAdmin && togglePermission(m.id, p.key)}
                      disabled={isAdmin}
                      className="mrcap-press"
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 7,
                        border: `1px solid ${on ? COLORS.gold : COLORS.line}`,
                        background: on ? "rgba(201,162,39,0.12)" : COLORS.panel2,
                        color: on ? COLORS.gold : COLORS.muted,
                        fontSize: 11, fontWeight: 600, cursor: isAdmin ? "default" : "pointer",
                        opacity: isAdmin ? 0.85 : 1, textAlign: "left",
                      }}
                    >
                      {on ? <Check size={11} /> : <div style={{ width: 11, height: 11, borderRadius: 3, border: `1.5px solid ${COLORS.line}`, flexShrink: 0 }} />}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 13, padding: 15 }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><UserPlus size={16} color={COLORS.gold} /> Add team member</div>
        <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></Field>
        <Field label="Role">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(ROLE_DEFS).filter(([, v]) => v.active !== false).map(([k, v]) => (
              <button key={k} onClick={() => setRole(k)} className="mrcap-press" style={{ padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${role === k ? COLORS.gold : COLORS.line}`, background: role === k ? COLORS.gold : COLORS.panel2, color: role === k ? COLORS.darkText : COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{v.label}</button>
            ))}
          </div>
        </Field>
        <button onClick={addMember} disabled={!name.trim()} className="mrcap-press" style={{ ...primaryBtnStyle, width: "100%", opacity: name.trim() ? 1 : 0.5 }}>Add</button>
      </div>
    </div>
  );
}

/* ---------------- Dispatch Board ----------------
   Full-viewable, always-on board for the shop-floor tablet. Splits
   active jobs (everything before "Collected") into a Detailing column
   and an Everything-else column (denting/bodyshop/PPF today — the split
   is by category role, so it's a one-line change later if the grouping
   needs to move), and lets anyone assign a staff member to a service
   category by dragging a chip onto that person's name. Polls every 6s
   instead of the dashboard's 45s so it feels close to instant without
   adding a websocket layer the rest of the app doesn't have. Writes go
   through the same sbFetch/gatekeeper path as everywhere else, so every
   assignment is already covered by the existing activity log. */


/* ---------------- Dispatch Board ----------------
   Full-viewable, always-on board for the shop-floor tablet. Splits
   active jobs (everything before "Collected") into a Detailing column
   and an Everything-else column (denting/bodyshop/PPF today — the split
   is by category role, so it's a one-line change later if the grouping
   needs to move), and lets anyone assign a staff member to a service
   category by dragging a chip onto that person's name. Polls every 6s
   instead of the dashboard's 45s so it feels close to instant without
   adding a websocket layer the rest of the app doesn't have. Writes go
   through the same sbFetch/gatekeeper path as everywhere else, so every
   assignment is already covered by the existing activity log.

   Cards can also be dragged up/down within their own column to reorder
   them — that ordering is purely visual (priority itself is untouched,
   by design) and is remembered per-tablet via localStorage, since this
   board lives on one fixed screen rather than needing to sync order
   across every device. Tapping a card opens a detail sheet with what
   the job actually needs done and a Finished toggle that writes through
   the same serviceDone/history trail JobDetail already uses, so marking
   done here shows up correctly there too. */


/* ---------------- Dispatch Board ----------------
   Full-viewable, always-on queue board for the shop-floor tablet — built
   like a walk-in ticket system: every job/service gets a ticket number
   the moment it's logged, and the board always shows oldest-first within
   its column. No manual reordering — the queue order *is* the arrival
   order, which is the whole point. Everything is tap-driven rather than
   drag-driven, since this runs on a touchscreen tablet where the old
   HTML5 drag API doesn't reliably fire at all. Tap a card to see what it
   needs, tap any staff name in that sheet to assign it to them (anyone
   can assign anyone — including a staff member tapping their own name
   to self-claim it), and use Start/Finished to track progress.

   Polls every 6s instead of the dashboard's 45s so it feels close to
   instant without adding a websocket layer the rest of the app doesn't
   have. Writes go through the same sbFetch/gatekeeper path as
   everywhere else, so every action is already covered by the existing
   activity log. */

async function loadDispatchJobs() {
  const { ok, data } = await sbFetch(
    "jobs?select=id,plate,make_model,customer_name,description,priority,location,stage_index,service_types,assigned_to,service_done,service_started,treatments,created_at,updated_at&order=created_at.asc&limit=900"
  );
  if (!ok || !data) return [];
  return data
    .filter((r) => r.stage_index !== 5) // 5 = Collected — done, doesn't belong on a live queue
    .map((r) => ({
      id: r.id, plate: r.plate, makeModel: r.make_model, customerName: r.customer_name,
      description: r.description, priority: r.priority, location: r.location,
      stageIndex: r.stage_index, serviceTypes: r.service_types || [], assignedTo: r.assigned_to || {},
      serviceDone: r.service_done || {}, serviceStarted: r.service_started || {}, treatments: r.treatments || {},
      createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(),
    }));
}

function playDispatchBeep() {
  // New job arrived — a single flat ping, deliberately plain so it's
  // never confused with the "finished" chime below.
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 780;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  } catch { /* best-effort only — a silent tablet shouldn't block the board */ }
}

// Picks the best-sounding voice the tablet's browser already has for
// free — modern Chrome ships genuinely decent voices (not the old
// robotic screen-reader kind), so there's no need for a paid TTS
// service. Prefers British English specifically (requested), since the
// default en-US voice was reading some car names with Spanish-style
// phonetics. Cached after the first successful lookup since browsers
// load the voice list asynchronously and it doesn't change at runtime.
let cachedDispatchVoice = null;
function getBestDispatchVoice() {
  if (cachedDispatchVoice) return cachedDispatchVoice;
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const pick =
    voices.find((v) => /Google/i.test(v.name) && /^en-GB/i.test(v.lang)) ||
    voices.find((v) => /UK|British/i.test(v.name) && /^en/i.test(v.lang)) ||
    voices.find((v) => /^en-GB/i.test(v.lang)) ||
    voices.find((v) => /Google/i.test(v.name) && /^en/i.test(v.lang)) ||
    voices.find((v) => /Natural|Enhanced|Premium/i.test(v.name) && /^en/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0];
  cachedDispatchVoice = pick;
  return cachedDispatchVoice;
}

// The Web Speech API has no pronunciation-hint support (no SSML), so
// the only reliable fix for a model name being misread is to respell
// it phonetically before it's spoken. Add to this list as more come up
// — matching is case-insensitive and whole-word only so it doesn't
// clobber substrings inside other model names.
const DISPATCH_PRONUNCIATION_FIXES = [
  [/\bpajero\b/gi, "pa-jair-oh"],
];
function fixDispatchPronunciation(text) {
  let out = text;
  DISPATCH_PRONUNCIATION_FIXES.forEach(([pattern, replacement]) => { out = out.replace(pattern, replacement); });
  return out;
}

// Assignment announcement only (by design — arrival and finished
// already have their own distinct beep/chime, and voice on top of
// those too would be noisy). Plays alongside whichever beep is already
// wired up elsewhere, not instead of it.
function announceDispatchAssignment(staffName, vehicleLabel) {
  try {
    if (!window.speechSynthesis) return;
    const spokenVehicle = fixDispatchPronunciation(vehicleLabel);
    const utter = new SpeechSynthesisUtterance(`${staffName}, you've been assigned the ${spokenVehicle}.`);
    const voice = getBestDispatchVoice();
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang || "en-GB";
    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  } catch { /* best-effort only — a silent tablet shouldn't block the board */ }
}

function playDispatchDoneChime() {
  // Job marked finished — a rising two-note chime (like a doorbell "ding
  // dong" in reverse), intentionally shaped differently from the flat
  // arrival ping above so the two are easy to tell apart by ear alone
  // without looking at the screen.
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [
      { freq: 660, start: 0, dur: 0.16 },
      { freq: 990, start: 0.14, dur: 0.32 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur);
    });
  } catch { /* best-effort only — a silent tablet shouldn't block the board */ }
}

const rowKey = (jobId, categoryKey) => `${jobId}::${categoryKey}`;

// Thresholds for the "this is going stale" warnings — tune these two
// numbers if an hour/three hours turns out too eager or too lax.
const STALE_UNASSIGNED_MS = 60 * 60 * 1000; // 1 hour sitting unassigned
const STALE_IN_PROGRESS_MS = 3 * 60 * 60 * 1000; // 3 hours "in progress" with no update

const PRIORITY_RANK = { urgent: 3, high: 2, medium: 1, low: 0 };

// The free-text "description" field is usually empty in practice — the
// actual "what to do" for a specific category is the treatments picked
// for it (e.g. "Tune Up"), stored separately per category. Prefer that;
// fall back to the general description, then a plain "no details" note.
function dispatchWhatToDo(job, categoryKey) {
  const picks = (job.treatments || {})[categoryKey];
  if (picks && picks.length) return picks.join(", ");
  if (job.description) return job.description;
  return null;
}

// "23m" / "1h 12m" — deliberately coarse (minutes, not seconds), since
// this is a shop-floor glance-at-it label, not a stopwatch.
function formatDispatchElapsed(startedAt, now) {
  if (!startedAt) return null;
  const ms = Math.max(0, now - new Date(startedAt).getTime()); // clamp: the 30s tick can be a moment behind the exact click time
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Same role-filtering logic used in two places (the column footer isn't
// there anymore, but the modal's staff picker needs exactly this list),
// kept as one function so both stay in sync.
function staffForRole(team, role) {
  if (role === "detailing") return team.filter((m) => m.role === "detailing");
  return team.filter((m) => m.role !== "detailing" && m.role !== "admin" && m.role !== "intake");
}

function DispatchJobCard({ row, ticketNo, isDone, isStarted, startedAt, now, assignedName, onClick }) {
  const { job, categoryLabel } = row;
  const isPartsRemoval = STAGES[job.stageIndex]?.key === "parts_removal";
  const isStaleUnassigned = !assignedName && !isStarted && !isDone && (now - job.createdAt) > STALE_UNASSIGNED_MS;
  const isStaleInProgress = isStarted && !isDone && startedAt && (now - new Date(startedAt).getTime()) > STALE_IN_PROGRESS_MS;
  const isStale = isStaleUnassigned || isStaleInProgress;
  return (
    <div
      onClick={onClick}
      className="mrcap-press"
      style={{
        background: COLORS.panel, border: `1.5px solid ${isStale ? COLORS.red : COLORS.line}`, borderRadius: 11,
        padding: 12, marginBottom: 9, cursor: "pointer", opacity: isDone ? 0.6 : 1,
        display: "flex", gap: 12, alignItems: "flex-start",
      }}
    >
      <div style={{
        flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: COLORS.panel2,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: COLORS.muted, letterSpacing: 0.5 }}>TICKET</div>
        <div style={{ fontFamily: MONO_FONT, fontSize: 16, fontWeight: 700, color: COLORS.gold }}>{ticketNo}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 14.5, color: COLORS.ink }}>{job.plate}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isDone && <CheckCircle2 size={15} color={COLORS.green} />}
            {!isDone && isStarted && <Clock size={14} color={COLORS.gold} />}
            {job.priority === "urgent" || job.priority === "high" ? (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: COLORS.red, border: `1px solid ${COLORS.red}`, borderRadius: 999, padding: "1px 7px", textTransform: "uppercase" }}>{job.priority}</span>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>{job.makeModel}</div>
        {dispatchWhatToDo(job, row.categoryKey) ? (
          <div style={{ fontSize: 12, color: COLORS.ink, marginTop: 6, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{dispatchWhatToDo(job, row.categoryKey)}</div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
            background: isPartsRemoval ? COLORS.gold : COLORS.panel2,
            color: isPartsRemoval ? COLORS.darkText : COLORS.muted,
          }}>{STAGES[job.stageIndex]?.label || "—"}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: COLORS.panel2, color: COLORS.ink }}>{categoryLabel}</span>
        </div>
        <div style={{ fontSize: 11.5, marginTop: 7, color: isDone ? COLORS.green : isStarted ? COLORS.gold : (assignedName ? COLORS.goldBright : COLORS.muted) }}>
          {isDone ? "Finished" : isStarted ? `In progress${formatDispatchElapsed(startedAt, now) ? ` · ${formatDispatchElapsed(startedAt, now)}` : ""}` : assignedName ? `Assigned: ${assignedName}` : "Unassigned — tap to assign"}
        </div>
        {isStale && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.red, marginTop: 4 }}>
            ⚠ {isStaleInProgress ? "In progress a while — check on this" : "Sitting unassigned a while"}
          </div>
        )}
      </div>
    </div>
  );
}

function DispatchDetailModal({ row, ticketNo, isDone, isStarted, startedAt, now, assignedId, assignedName, staffOptions, moveOptions, onClose, onToggleDone, onToggleStarted, onAssign, onMove, saving }) {
  const { job, categoryLabel, categoryKey } = row;
  const isUnclassified = categoryKey === "_none";
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 22, maxWidth: 420, width: "100%", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5 }}>TICKET #{ticketNo}</div>
            <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 19, color: COLORS.ink, marginTop: 2 }}>{job.plate}</div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{job.makeModel}{job.customerName ? ` · ${job.customerName}` : ""}</div>
          </div>
          <button onClick={onClose} className="mrcap-press" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={20} color={COLORS.muted} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: COLORS.panel2, color: COLORS.ink }}>{STAGES[job.stageIndex]?.label || "—"}</span>
          {!isUnclassified && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: COLORS.panel2, color: COLORS.ink }}>{categoryLabel}</span>
          )}
          {job.priority ? (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: COLORS.red, border: `1px solid ${COLORS.red}`, textTransform: "uppercase" }}>{job.priority}</span>
          ) : null}
        </div>

        {job.location ? (
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 12 }}>Location: <span style={{ color: COLORS.ink }}>{job.location}</span></div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>What to do</div>
          <div style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.5, background: COLORS.panel2, borderRadius: 10, padding: 12 }}>
            {isUnclassified ? "This job hasn't been assigned a service type yet — pick one below." : (dispatchWhatToDo(job, categoryKey) || "No treatments or description entered for this job.")}
          </div>
        </div>

        {!isUnclassified && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
              {assignedName ? `Assigned to ${assignedName} — tap a name to reassign` : "Tap a name to assign"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {staffOptions.length === 0 ? (
                <div style={{ fontSize: 12, color: COLORS.muted }}>No staff with this role yet — add them under Team.</div>
              ) : (
                staffOptions.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onAssign(row, assignedId === m.id ? null : m.id)}
                    className="mrcap-press"
                    style={{
                      padding: "8px 12px", borderRadius: 999,
                      border: `1.5px solid ${assignedId === m.id ? COLORS.gold : COLORS.line}`,
                      background: assignedId === m.id ? COLORS.gold : COLORS.panel2,
                      color: assignedId === m.id ? COLORS.darkText : COLORS.ink,
                      fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {m.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
            {isUnclassified ? "Set the service type — tap one" : "Move to a different section — tap where it should go"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {moveOptions.map((s) => (
              <button
                key={s.key}
                onClick={() => onMove(row, s.key)}
                disabled={saving}
                className="mrcap-press"
                style={{
                  padding: "8px 12px", borderRadius: 999, border: `1.5px solid ${COLORS.line}`,
                  background: COLORS.panel2, color: COLORS.ink, fontSize: 12.5, fontWeight: 600,
                  cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {!isUnclassified && (
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button
              onClick={() => onToggleStarted(row, !isStarted)}
              disabled={saving || isDone}
              className="mrcap-press"
              style={{
                flex: 1, padding: "13px 12px", borderRadius: 11, border: `1.5px solid ${isStarted ? COLORS.gold : COLORS.line}`,
                background: isStarted ? `${COLORS.gold}22` : COLORS.panel2, color: isStarted ? COLORS.goldBright : COLORS.ink,
                fontSize: 13.5, fontWeight: 700, cursor: saving || isDone ? "default" : "pointer", opacity: saving || isDone ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}
            >
              <Clock size={16} />
              {isStarted ? `In Progress${formatDispatchElapsed(startedAt, now) ? ` · ${formatDispatchElapsed(startedAt, now)} — tap to undo` : " — tap to undo"}` : "Start"}
            </button>
            <button
              onClick={() => onToggleDone(row, !isDone)}
              disabled={saving}
              className="mrcap-press"
              style={{
                flex: 1, padding: "13px 12px", borderRadius: 11, border: "none",
                background: isDone ? COLORS.panel2 : COLORS.gold, color: isDone ? COLORS.ink : COLORS.darkText,
                fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}
            >
              <CheckCircle2 size={16} />
              {isDone ? "Finished — tap to undo" : "Mark Finished"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function DispatchBoard({ team, session }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sortOrder, setSortOrder] = useState("oldest"); // "oldest" | "newest" | "priority"
  const prevCountRef = useRef(null);
  const firstLoadRef = useRef(true);

  // Forces a re-render every 30s purely so elapsed-time labels ("23m")
  // stay roughly current without needing a full data refetch.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const data = await loadDispatchJobs();
    setJobs(data);
    setLoading(false);
    if (!firstLoadRef.current && prevCountRef.current !== null && data.length > prevCountRef.current) {
      playDispatchBeep();
    }
    firstLoadRef.current = false;
    prevCountRef.current = data.length;
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6000);
    // Voices load asynchronously and are empty on first call in some
    // browsers — prime the cache now and again once the browser fires
    // voiceschanged, so the very first assignment doesn't fall back to
    // a default voice while the good ones are still loading.
    if (window.speechSynthesis) {
      getBestDispatchVoice();
      window.speechSynthesis.onvoiceschanged = () => { cachedDispatchVoice = null; getBestDispatchVoice(); };
    }
    return () => clearInterval(interval);
  }, [refresh]);

  const assign = async (row, memberId) => {
    const { job, categoryKey } = row;
    const nextAssignedTo = { ...job.assignedTo, [categoryKey]: memberId || undefined };
    if (!memberId) delete nextAssignedTo[categoryKey];
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, assignedTo: nextAssignedTo } : j)));
    const staffName = memberId ? (team.find((m) => m.id === memberId)?.name || memberId) : null;
    withActivitySummary(memberId
      ? `Dispatch board: assigned ${categoryKey} on ${job.plate} to ${staffName}`
      : `Dispatch board: unassigned ${categoryKey} on ${job.plate}`);
    if (staffName) announceDispatchAssignment(staffName, job.makeModel || job.plate);
    await sbFetch(`jobs?id=eq.${job.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ assigned_to: nextAssignedTo }),
    });
  };

  // Mirrors JobDetail's toggleServiceDone exactly (same serviceDone shape,
  // same history entry shape) so a job marked finished here shows up
  // correctly there too. Re-fetches history fresh right before writing
  // rather than trusting the board's lightweight copy, so two people
  // acting around the same time don't clobber each other's history.
  const toggleDone = async (row, nowDone) => {
    setSaving(true);
    const { job, categoryKey, categoryLabel } = row;
    const { ok, data } = await sbFetch(`jobs?id=eq.${job.id}&select=service_done,history`);
    const current = ok && data && data[0] ? data[0] : { service_done: job.serviceDone, history: [] };
    const nextServiceDone = { ...(current.service_done || {}), [categoryKey]: nowDone };
    const nextHistory = [
      ...(current.history || []),
      { stage: "service", label: categoryLabel, by: session.name, role: session.role, note: nowDone ? "Marked done" : "Un-marked", at: Date.now() },
    ];
    withActivitySummary(`Dispatch board: ${nowDone ? "marked" : "un-marked"} ${categoryLabel} done on ${job.plate}`);
    await sbFetch(`jobs?id=eq.${job.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ service_done: nextServiceDone, history: nextHistory, updated_at: new Date().toISOString() }),
    });
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, serviceDone: nextServiceDone } : j)));
    setSaving(false);
    if (nowDone) playDispatchDoneChime();
  };

  // Same shape and same history trail as toggleDone, kept as a fully
  // separate field/state — a job can be started without being finished,
  // and (deliberately) can even be marked finished without ever having
  // been flagged started, for whoever just fixes something quick.
  // Stores the actual start timestamp (not just true/false) so the
  // board can show real elapsed time. A truthy value still means
  // "started" everywhere else that checks it — this is a superset of
  // the old boolean shape, nothing else needs to change.
  const toggleStarted = async (row, nowStarted) => {
    setSaving(true);
    const { job, categoryKey, categoryLabel } = row;
    const { ok, data } = await sbFetch(`jobs?id=eq.${job.id}&select=service_started,history`);
    const current = ok && data && data[0] ? data[0] : { service_started: job.serviceStarted, history: [] };
    const nextServiceStarted = { ...(current.service_started || {}), [categoryKey]: nowStarted ? new Date().toISOString() : false };
    const nextHistory = [
      ...(current.history || []),
      { stage: "service", label: categoryLabel, by: session.name, role: session.role, note: nowStarted ? "Started" : "Un-started", at: Date.now() },
    ];
    withActivitySummary(`Dispatch board: ${nowStarted ? "started" : "un-started"} ${categoryLabel} on ${job.plate}`);
    await sbFetch(`jobs?id=eq.${job.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ service_started: nextServiceStarted, history: nextHistory, updated_at: new Date().toISOString() }),
    });
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, serviceStarted: nextServiceStarted } : j)));
    setSaving(false);
  };

  // Moves a job from one service category to another — this is how a
  // job hops from Detailing to Bodyshop/PPF/Dent Repair or back. One
  // tap, no drag: picks a new category, drops the old one. Assignment,
  // done, and started state are cleared for the old category (a
  // different kind of work needs a fresh assignment, not a carried-over
  // one from whoever was doing the old job).
  const moveCategory = async (row, newCategoryKey) => {
    setSaving(true);
    const { job, categoryKey, categoryLabel } = row;
    const newLabel = SERVICES.find((s) => s.key === newCategoryKey)?.label || newCategoryKey;
    const { ok, data } = await sbFetch(`jobs?id=eq.${job.id}&select=service_types,assigned_to,service_done,service_started,history`);
    const current = ok && data && data[0]
      ? data[0]
      : { service_types: job.serviceTypes, assigned_to: job.assignedTo, service_done: job.serviceDone, service_started: job.serviceStarted, history: [] };
    const nextServiceTypes = (current.service_types || []).filter((k) => k !== categoryKey);
    if (!nextServiceTypes.includes(newCategoryKey)) nextServiceTypes.push(newCategoryKey);
    const nextAssignedTo = { ...(current.assigned_to || {}) }; delete nextAssignedTo[categoryKey];
    const nextServiceDone = { ...(current.service_done || {}) }; delete nextServiceDone[categoryKey];
    const nextServiceStarted = { ...(current.service_started || {}) }; delete nextServiceStarted[categoryKey];
    const nextHistory = [
      ...(current.history || []),
      { stage: "service", label: `${categoryLabel} → ${newLabel}`, by: session.name, role: session.role, note: "Moved", at: Date.now() },
    ];
    withActivitySummary(`Dispatch board: moved ${job.plate} from ${categoryLabel} to ${newLabel}`);
    await sbFetch(`jobs?id=eq.${job.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        service_types: nextServiceTypes, assigned_to: nextAssignedTo, service_done: nextServiceDone,
        service_started: nextServiceStarted, history: nextHistory, updated_at: new Date().toISOString(),
      }),
    });
    setJobs((prev) => prev.map((j) => (j.id === job.id
      ? { ...j, serviceTypes: nextServiceTypes, assignedTo: nextAssignedTo, serviceDone: nextServiceDone, serviceStarted: nextServiceStarted }
      : j)));
    setSaving(false);
    setSelectedRowKey(null); // the old (job, category) row this modal was showing no longer exists
  };

  // One row per (job, category-it-needs). A job needing both detailing
  // and dentrepair shows once in each relevant column with its own
  // ticket number in that column. Finished rows are dropped entirely —
  // once cleared, it comes off the board rather than sitting there
  // dimmed. Jobs with no service type yet ("_none") go into their own
  // "needs classification" bucket rather than being dumped into a
  // colored column with a meaningless badge.
  const allRows = [];
  for (const job of jobs) {
    const types = job.serviceTypes.length ? job.serviceTypes : ["_none"];
    for (const key of types) {
      if (job.serviceDone[key]) continue; // cleared — remove it from the board
      const svc = SERVICES.find((s) => s.key === key);
      allRows.push({ job, categoryKey: key, categoryLabel: svc?.label || key, role: svc?.role || null });
    }
  }

  if (sortOrder === "newest") {
    allRows.reverse();
  } else if (sortOrder === "priority") {
    // Stable sort: highest priority first, oldest-within-same-priority
    // first (allRows already arrives oldest-first from the fetch, and
    // Array.prototype.sort is stable in every browser this runs on).
    allRows.sort((a, b) => (PRIORITY_RANK[b.job.priority] ?? -1) - (PRIORITY_RANK[a.job.priority] ?? -1));
  }

  const rowsByKey = {};
  allRows.forEach((r) => { rowsByKey[rowKey(r.job.id, r.categoryKey)] = r; });

  const unclassifiedRows = allRows.filter((r) => r.categoryKey === "_none");
  const detailingRows = allRows.filter((r) => r.role === "detailing");
  const otherRows = allRows.filter((r) => r.role !== "detailing" && r.categoryKey !== "_none");

  const selectedRow = selectedRowKey ? rowsByKey[selectedRowKey] : null;

  const Column = ({ title, accent, rowsForColumn }) => (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#101215", border: `1px solid ${COLORS.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `2px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 17, color: accent }}>{title}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, background: `${accent}22`, borderRadius: 999, padding: "2px 10px" }}>{rowsForColumn.length}</div>
      </div>
      <div style={{ padding: 14, overflowY: "auto", flex: 1, minHeight: 200 }}>
        {rowsForColumn.length === 0 ? (
          <div style={{ textAlign: "center", color: COLORS.muted, fontSize: 13, marginTop: 30 }}>Nothing here right now</div>
        ) : (
          rowsForColumn.map((r, i) => {
            const key = rowKey(r.job.id, r.categoryKey);
            return (
              <DispatchJobCard
                key={key}
                row={r}
                ticketNo={i + 1}
                isDone={!!r.job.serviceDone[r.categoryKey]}
                isStarted={!!r.job.serviceStarted[r.categoryKey]}
                startedAt={r.job.serviceStarted[r.categoryKey] || null}
                now={nowTick}
                assignedName={r.job.assignedTo[r.categoryKey] ? (team.find((m) => m.id === r.job.assignedTo[r.categoryKey])?.name || r.job.assignedTo[r.categoryKey]) : null}
                onClick={() => setSelectedRowKey(key)}
              />
            );
          })
        )}
      </div>
    </div>
  );

  const selectedTicketNo = selectedRow
    ? (selectedRow.categoryKey === "_none" ? unclassifiedRows : selectedRow.role === "detailing" ? detailingRows : otherRows).findIndex((r) => rowKey(r.job.id, r.categoryKey) === selectedRowKey) + 1
    : null;

  return (
    <div className="mrcap-view" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, minHeight: "calc(100vh - 80px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 20, color: COLORS.ink }}>Dispatch Board</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
            {loading ? "Loading…" : `${sortOrder === "priority" ? "Priority" : sortOrder === "oldest" ? "Oldest" : "Newest"} first · updates automatically · last checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, background: COLORS.panel2, borderRadius: 10, padding: 3 }}>
          {["oldest", "newest", "priority"].map((opt) => (
            <button
              key={opt}
              onClick={() => setSortOrder(opt)}
              className="mrcap-press"
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                background: sortOrder === opt ? COLORS.gold : "transparent",
                color: sortOrder === opt ? COLORS.darkText : COLORS.muted,
                fontSize: 12.5, fontWeight: 700, textTransform: "capitalize",
              }}
            >
              {opt === "priority" ? "Priority first" : `${opt} first`}
            </button>
          ))}
        </div>
      </div>
      {unclassifiedRows.length > 0 && (
        <div style={{ background: "#1a1408", border: `1px solid ${COLORS.gold}55`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.goldBright, marginBottom: 10 }}>
            ⚠ {unclassifiedRows.length} job{unclassifiedRows.length === 1 ? "" : "s"} need{unclassifiedRows.length === 1 ? "s" : ""} a service type — tap to classify
          </div>
          <div style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 2 }}>
            {unclassifiedRows.map((r) => (
              <div
                key={rowKey(r.job.id, r.categoryKey)}
                onClick={() => setSelectedRowKey(rowKey(r.job.id, r.categoryKey))}
                className="mrcap-press"
                style={{
                  flexShrink: 0, minWidth: 160, background: COLORS.panel, border: `1px solid ${COLORS.line}`,
                  borderRadius: 10, padding: 10, cursor: "pointer",
                }}
              >
                <div style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 13, color: COLORS.ink }}>{r.job.plate}</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted }}>{r.job.makeModel}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0, flexWrap: "wrap" }}>
        <Column title="Detailing" accent={COLORS.red} rowsForColumn={detailingRows} />
        <Column title="Denting / Bodyshop / PPF" accent={COLORS.blue} rowsForColumn={otherRows} />
      </div>
      {selectedRow && (
        <DispatchDetailModal
          row={selectedRow}
          ticketNo={selectedTicketNo}
          isDone={!!selectedRow.job.serviceDone[selectedRow.categoryKey]}
          isStarted={!!selectedRow.job.serviceStarted[selectedRow.categoryKey]}
          startedAt={selectedRow.job.serviceStarted[selectedRow.categoryKey] || null}
          now={nowTick}
          assignedId={selectedRow.job.assignedTo[selectedRow.categoryKey] || null}
          assignedName={selectedRow.job.assignedTo[selectedRow.categoryKey] ? (team.find((m) => m.id === selectedRow.job.assignedTo[selectedRow.categoryKey])?.name || selectedRow.job.assignedTo[selectedRow.categoryKey]) : null}
          staffOptions={staffForRole(team, selectedRow.role)}
          moveOptions={SERVICES.filter((s) => s.key !== selectedRow.categoryKey)}
          onClose={() => setSelectedRowKey(null)}
          onToggleDone={toggleDone}
          onToggleStarted={toggleStarted}
          onAssign={assign}
          onMove={moveCategory}
          saving={saving}
        />
      )}
    </div>
  );
}
