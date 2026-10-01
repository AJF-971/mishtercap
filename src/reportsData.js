// Pure number-crunching for the Reports screen (ReportsDashboard.jsx).
// No React, no network, no DOM - so every figure the boss sees can be
// checked by a plain node script against fixture jobs.
//
// Every rule here mirrors a rule that already exists in GarageApp.jsx; where
// a rule is new (period comparison, category split, due-back, WIP aging,
// daily close-out, PPF film) it is written out in HOW_NUMBERS_WORK so the
// screen can state it.
//
// Three rules hold everywhere in this file:
//   1. All calendar boundaries (day / week / month) are ASIA/DUBAI, whatever
//      timezone the device is set to (Dubai is UTC+4, no daylight saving).
//   2. Time spent is counted in SHOP hours (9am-7pm, Sunday closed), the same
//      rule the Dispatch Board uses, not wall-clock hours.
//   3. Jobs completed, revenue and average ticket are all counted from ONE
//      group of jobs: the ones "closed" in the period (see closedAt below).

import { computeTotals, paymentSummary } from "./billing.js";
import { scopeKeys } from "./ppfDiagram.js";

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
const MONTH_MS = 30.4375 * DAY;

/* ------------------------------------------------------------ thresholds */
// Tune these here; everything on screen follows. All "H" values are SHOP hours.

export const SHOP_OPEN_HOUR = 9;   // same as the Dispatch Board
export const SHOP_CLOSE_HOUR = 19;
export const SHOP_DAY_H = SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR; // one "shop day" = 10 shop hours
export const VAT_RATE = 0.05;

export const WIP_READY_UNCOLLECTED_H = 24; // Ready for Collection, not collected, for longer than this
export const WIP_QC_WAIT_H = 2;            // "Sent to QC" with no "QC passed" for longer than this
export const WIP_UNASSIGNED_H = 1;         // nobody on a service after the car has been open this long (same as the TV board)
export const WIP_LOOKBACK_DAYS = 180;      // older unfinished jobs are treated as abandoned records, not listed
// A service that has been started and not finished for longer than this
// (per category; PPF depends on the body type) is "in service too long".
export const SERVICE_TARGET_H = { default: 20, detailing: 20, ppf_narrow: 25, ppf_wide: 40, dentrepair: 30, bodyshop: 60, upholstery: 40 };
// Services done outside with no installer assigned in the app: never "unassigned".
export const EXTERNAL_SERVICE_KEYS = ["bodyshop", "upholstery"];

// Same parser GarageApp.jsx uses for invoice_amount (a text column that has
// held "1575.0", "AED 945", "" and null over the years).
export function parseAED(v) {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function toMs(v) {
  if (v === null || v === undefined || v === "" || v === false) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Loops, not Math.min(...array): spreading a few thousand jobs into call
// arguments can overflow the stack.
function minOf(a) { let m = null; for (let i = 0; i < a.length; i++) if (m === null || a[i] < m) m = a[i]; return m; }
function maxOf(a) { let m = null; for (let i = 0; i < a.length; i++) if (m === null || a[i] > m) m = a[i]; return m; }

/* -------------------------------------------------------- Asia/Dubai time */

export const DUBAI_OFFSET_MS = 4 * HOUR;

// Calendar parts of an instant, read in Dubai (not the device's timezone).
export function dubaiParts(ms) {
  const d = new Date(ms + DUBAI_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours() };
}
// The instant of a Dubai wall-clock time (month/day may overflow, like Date).
export function dubaiMs(y, m, d, h = 0, mi = 0) {
  return Date.UTC(y, m, d, h, mi) - DUBAI_OFFSET_MS;
}
export function dubaiStartOfDay(ms) {
  const p = dubaiParts(ms);
  return dubaiMs(p.y, p.m, p.d);
}
// "YYYY-MM-DD" for the Dubai calendar day of an instant (Date or ms).
export function dubaiDateKey(v = Date.now()) {
  const p = dubaiParts(v instanceof Date ? v.getTime() : v);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
export const localDateKey = dubaiDateKey; // old name, same Dubai rule
// "YYYY-MM-DD" -> instant of that Dubai day's midnight, or null.
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  return m ? dubaiMs(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
// First instant of the Dubai month that is `back` months before the one containing `ms`.
export function dubaiMonthStart(ms, back = 0) {
  const p = dubaiParts(ms);
  return dubaiMs(p.y, p.m - back, 1);
}
export function dubaiMonthKey(ms) {
  const p = dubaiParts(ms);
  return `${p.y}-${p.m}`;
}
// Start of the admin dashboard's range presets, in Dubai time.
export function dubaiRangeStart(key, nowMs) {
  const p = dubaiParts(nowMs);
  const today = dubaiMs(p.y, p.m, p.d);
  switch (key) {
    case "today": return today;
    case "7d": return today - 6 * DAY;
    case "30d": return today - 29 * DAY;
    case "month": return dubaiMs(p.y, p.m, 1);
    case "90d": return today - 89 * DAY;
    case "6m": return dubaiMs(p.y, p.m - 5, 1);
    default: return 0;
  }
}

// Shop time between two instants: 9am-7pm, Monday-Saturday, Sunday closed,
// all read in Dubai. Same rule as businessMsElapsed() on the Dispatch Board.
export function businessMsElapsed(fromMs, toMs, openHour = SHOP_OPEN_HOUR, closeHour = SHOP_CLOSE_HOUR) {
  if (!fromMs || !(toMs > fromMs)) return 0;
  let total = 0, from = fromMs;
  // Any 7 days hold exactly six open days, so whole weeks are counted in one step.
  const weeks = Math.floor((toMs - from) / (7 * DAY));
  if (weeks > 0) { total += weeks * 6 * (closeHour - openHour) * HOUR; from += weeks * 7 * DAY; }
  let day = dubaiStartOfDay(from);
  for (let guard = 0; day < toMs && guard < 10; guard++, day += DAY) {
    if (new Date(day + DUBAI_OFFSET_MS).getUTCDay() === 0) continue; // Sunday
    const a = Math.max(from, day + openHour * HOUR);
    const b = Math.min(toMs, day + closeHour * HOUR);
    if (b > a) total += b - a;
  }
  return total;
}
export const businessHours = (fromMs, toMs) => businessMsElapsed(fromMs, toMs) / HOUR;

/* ------------------------------------------------------------------ periods */

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

function addUnit(ms, unit, n) {
  if (unit === "hour") return ms + n * HOUR;
  const p = dubaiParts(ms);
  if (unit === "day") return dubaiMs(p.y, p.m, p.d + n, p.h);
  if (unit === "week") return dubaiMs(p.y, p.m, p.d + 7 * n, p.h);
  return dubaiMs(p.y, p.m + n, p.d, p.h); // month
}

// The selected period runs from the start of the current Dubai calendar unit
// up to now. It is compared with the SAME stretch of the previous unit: 1-22
// Sep against 1-22 Aug, Mon-Wed this week against Mon-Wed last week. A custom
// range is compared with the equally long stretch right before it.
export function periodRange(key, nowMs, custom) {
  const p = dubaiParts(nowMs);
  const { y, m, d } = p;
  let start, prevStart, end = nowMs, bucketUnit;
  if (key === "today") { start = dubaiMs(y, m, d); prevStart = dubaiMs(y, m, d - 1); bucketUnit = "hour"; }
  else if (key === "week") { const dow = (p.dow + 6) % 7; start = dubaiMs(y, m, d - dow); prevStart = dubaiMs(y, m, d - dow - 7); bucketUnit = "day"; }
  else if (key === "quarter") { const qm = m - (m % 3); start = dubaiMs(y, qm, 1); prevStart = dubaiMs(y, qm - 3, 1); bucketUnit = "week"; }
  else if (key === "year") { start = dubaiMs(y, 0, 1); prevStart = dubaiMs(y - 1, 0, 1); bucketUnit = "month"; }
  else if (key === "custom") {
    const from = parseDateKey(custom && custom.from) ?? dubaiMs(y, m, d - 29);
    let to = parseDateKey(custom && custom.to) ?? dubaiMs(y, m, d);
    if (to < from) to = from;
    start = from;
    end = Math.min(to + DAY, Math.max(nowMs, start + 1));
    const len = end - start;
    const days = len / DAY;
    bucketUnit = days <= 2 ? "hour" : days <= 62 ? "day" : days <= 400 ? "week" : "month";
    return finish({ key, start, end, prevStart: start - len, prevEnd: start, bucketUnit });
  } else { start = dubaiMs(y, m, 1); prevStart = dubaiMs(y, m - 1, 1); bucketUnit = "day"; key = "month"; }
  const len = end - start;
  const prevEnd = Math.min(prevStart + len, start);
  return finish({ key, start, end, prevStart, prevEnd, bucketUnit });
}
function finish(r) {
  return { ...r, label: rangeLabel(r.start, r.end), prevLabel: rangeLabel(r.prevStart, r.prevEnd) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "1-22 Sep 2026", "29 Jun - 5 Jul 2026", "22 Sep 2026" (end is exclusive).
export function rangeLabel(startMs, endMs) {
  const a = dubaiParts(startMs);
  const b = dubaiParts(Math.max(startMs, endMs - 1));
  if (a.y === b.y && a.m === b.m) {
    if (a.d === b.d) return `${a.d} ${MON[a.m]} ${a.y}`;
    return `${a.d}–${b.d} ${MON[a.m]} ${a.y}`;
  }
  if (a.y === b.y) return `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${b.y}`;
  return `${a.d} ${MON[a.m]} ${a.y} – ${b.d} ${MON[b.m]} ${b.y}`;
}
// "Tue 22 Sep 2026" (Dubai day of an instant).
export function dubaiDayLabel(ms) {
  const p = dubaiParts(ms);
  return `${WD[p.dow]} ${p.d} ${MON[p.m]} ${p.y}`;
}
// "Sep 26" for month charts.
export function dubaiMonthLabel(ms) {
  const p = dubaiParts(ms);
  return `${MON[p.m]} ${String(p.y).slice(2)}`;
}

function bucketLabels(ms, unit) {
  const p = dubaiParts(ms);
  const dd = p.d, mm = MON[p.m];
  if (unit === "hour") return { label: `${p.h}:00`, full: `${WD[p.dow]} ${dd} ${mm}, ${p.h}:00–${p.h + 1}:00` };
  if (unit === "day") return { label: String(dd), full: `${WD[p.dow]} ${dd} ${mm}` };
  if (unit === "week") return { label: `${dd} ${mm}`, full: `Week of ${dd} ${mm}` };
  return { label: mm, full: `${mm} ${p.y}` };
}

// Current-period buckets plus, for each, the matching stretch of the
// previous period (same offset from its start), or null past its end.
export function buildBuckets(range) {
  const out = [];
  for (let i = 0; i < 400; i++) {
    const s = addUnit(range.start, range.bucketUnit, i);
    if (s >= range.end) break;
    const e = Math.min(addUnit(range.start, range.bucketUnit, i + 1), range.end);
    const ps = addUnit(range.prevStart, range.bucketUnit, i);
    const pe = Math.min(addUnit(range.prevStart, range.bucketUnit, i + 1), range.prevEnd);
    const prev = ps < range.prevEnd ? { start: ps, end: pe, ...bucketLabels(ps, range.bucketUnit) } : null;
    out.push({ i, start: s, end: e, ...bucketLabels(s, range.bucketUnit), prev });
  }
  return out;
}

/* ------------------------------------------------------------- per job facts */

const DEFAULT_STAGES = [
  { key: "intake", label: "Intake" }, { key: "parts_removal", label: "Parts Removal" }, { key: "service", label: "Service" },
  { key: "qc", label: "QC" }, { key: "ready", label: "Ready for Collection" }, { key: "collected", label: "Collected" },
];

// The same rule as jobRoutesToSmartech() in GarageApp.jsx, plus the stored flag.
export function smartechKeysOf(row) {
  const keys = [];
  if ((row.service_types || []).includes("bodyshop")) keys.push("bodyshop");
  if (((row.treatments || {}).dentrepair || []).includes("Dent & Paint")) keys.push("dentrepair");
  return keys;
}
export function isSmartechJob(row) {
  return !!row.smartech_flag || smartechKeysOf(row).length > 0;
}

// How a job's invoice amount is split across its service categories: in
// proportion to the priced treatments picked in each (price x pieces for
// per-piece treatments - exactly the lines buildInvoiceLineItems prints).
// Discount applies to every line alike, so it does not change the shares;
// parts/fees follow the same split. No priced treatments -> even split
// across the job's services; no services -> "_other".
export function categoryShares(row, services) {
  const types = row.service_types || [];
  const tp = row.treatment_prices || {};
  const pieces = row.smartech_pieces || {};
  const sums = {};
  let total = 0;
  for (const s of services || []) {
    if (!types.includes(s.key)) continue;
    for (const name of (row.treatments || {})[s.key] || []) {
      const key = `${s.key}::${name}`;
      const perPiece = !!(s.treatments || []).find((t) => t.name === name)?.perPiece;
      const qty = perPiece ? Math.max(1, Number(pieces[key]) || 1) : 1;
      const amt = (Number(tp[key]) || 0) * qty;
      if (amt > 0) { sums[s.key] = (sums[s.key] || 0) + amt; total += amt; }
    }
  }
  if (total > 0) return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / total]));
  if (types.length) return Object.fromEntries(types.map((k) => [k, 1 / types.length]));
  return { _other: 1 };
}

function lastAt(hist, pred) {
  let t = null;
  for (const e of hist) {
    if (!e || !pred(e)) continue;
    const at = toMs(e.at);
    if (at !== null && (t === null || at > t)) t = at;
  }
  return t;
}
function firstAt(hist, pred) {
  let t = null;
  for (const e of hist) {
    if (!e || !pred(e)) continue;
    const at = toMs(e.at);
    if (at !== null && (t === null || at < t)) t = at;
  }
  return t;
}

// Normalises one raw jobs row into everything the report needs. Stage
// times come from the history entries JobDetail's advance() writes:
// { stage: <stage being LEFT>, label: <that stage's label>, at }. The
// latest such entry wins, so a job sent back and re-done counts its last pass.
//
// closedAt is THE date a job counts on in every headline figure:
//   1. invoice_finalized_at (the day the tax invoice was issued), else
//   2. the day the car was collected (the Ready -> Collected history entry,
//      or a "collected" entry on legacy rows), else
//   3. updated_at - only for a collected job with no history at all (an old
//      import), because any later edit would move it.
// A job that is neither finalized nor collected has no closedAt and adds
// nothing to revenue, however big its invoice_amount is.
export function deriveJob(row, { stages = DEFAULT_STAGES, services = [] } = {}) {
  const hist = Array.isArray(row.history) ? row.history : [];
  const lastIdx = stages.length - 1;
  const stageIndex = Number.isFinite(row.stage_index) ? row.stage_index : 0;
  const createdAt = toMs(row.created_at);
  const updatedAt = toMs(row.updated_at);
  const finalizedAt = toMs(row.invoice_finalized_at);
  const left = {};
  stages.forEach((s, i) => {
    left[s.key] = i < stageIndex ? lastAt(hist, (e) => e.stage === s.key && e.label === s.label) : null;
  });

  let collectedAt = null, timed = false;
  if (stageIndex >= lastIdx) {
    const ready = left[stages[lastIdx - 1].key];
    if (ready !== null) { collectedAt = ready; timed = true; }
    else collectedAt = lastAt(hist, (e) => e.stage === stages[lastIdx].key) ?? updatedAt; // historical import / legacy rows
  }
  const closedAt = finalizedAt ?? collectedAt;

  // Shop hours spent in each stage, only when the whole path was recorded.
  const stageHours = {};
  if (timed && createdAt !== null) {
    for (let i = 0; i < lastIdx; i++) {
      const from = i === 0 ? createdAt : left[stages[i - 1].key];
      const to = left[stages[i].key];
      if (from !== null && to !== null && to >= from) stageHours[stages[i].key] = businessHours(from, to);
    }
  }
  // Shop days (10 shop hours each) from the job card opening to collection.
  const turnaroundDays = timed && createdAt !== null && collectedAt >= createdAt ? businessHours(createdAt, collectedAt) / SHOP_DAY_H : null;

  const amount = parseAED(row.invoice_amount);
  const shares = categoryShares(row, services);
  const labelOf = (k) => (services.find((s) => s.key === k) || {}).label || k;

  // People credited per service: the lead (assigned_to) plus the Dispatch
  // Board team (assigned_team), de-duplicated.
  const people = {};
  const cats = new Set([...Object.keys(row.assigned_to || {}), ...Object.keys(row.assigned_team || {}), ...Object.keys(shares)]);
  for (const k of cats) {
    const lead = (row.assigned_to || {})[k];
    const crew = (row.assigned_team || {})[k];
    const ids = [...(lead ? [lead] : []), ...(Array.isArray(crew) ? crew : [])].filter((x) => typeof x === "string" && x);
    people[k] = [...new Set(ids)];
  }
  // Hands-on time per service: Started -> Marked done, in shop hours.
  const serviceHours = {};
  for (const k of Object.keys(people)) {
    const label = labelOf(k);
    const done = lastAt(hist, (e) => e.stage === "service" && e.label === label && e.note === "Marked done");
    const started = toMs((row.service_started || {})[k]) ?? firstAt(hist, (e) => e.stage === "service" && e.label === label && e.note === "Started");
    if (done !== null && started !== null && done > started) serviceHours[k] = businessHours(started, done);
  }

  // Smartech facts.
  const stKeys = smartechKeysOf(row);
  const smartech = isSmartechJob(row);
  let smartechPieces = 0, smartechStart = null, smartechEnd = null, smartechDone = false;
  if (smartech) {
    for (const k of stKeys) {
      for (const name of (row.treatments || {})[k] || []) {
        if (k === "dentrepair" && name !== "Dent & Paint") continue;
        smartechPieces += Math.max(1, Number((row.smartech_pieces || {})[`${k}::${name}`]) || 1);
      }
    }
    const labels = stKeys.map(labelOf);
    smartechStart = toMs(row.smartech_started_at)
      ?? stKeys.map((k) => toMs((row.service_started || {})[k])).filter((x) => x !== null).sort((a, b) => a - b)[0]
      ?? firstAt(hist, (e) => e.stage === "service" && labels.includes(e.label) && e.note === "Started");
    const statusDone = row.smartech_status === "done" || row.smartech_status === "ready_for_collection";
    const allDone = stKeys.length > 0 && stKeys.every((k) => (row.service_done || {})[k] === true);
    smartechEnd = statusDone ? toMs(row.smartech_status_at) : null;
    if (smartechEnd === null && allDone) smartechEnd = lastAt(hist, (e) => e.stage === "service" && labels.includes(e.label) && e.note === "Marked done");
    const serviceIdx = stages.findIndex((s) => s.key === "service");
    smartechDone = statusDone || allDone || (serviceIdx >= 0 && stageIndex > serviceIdx);
  }

  return {
    id: row.id, row, createdAt, updatedAt, stageIndex, collected: stageIndex >= lastIdx, collectedAt, timed,
    finalizedAt, closedAt, leftAt: left,
    stageHours, turnaroundDays: turnaroundDays !== null && turnaroundDays < 120 ? turnaroundDays : null,
    amount, revenueAt: closedAt, shares, people, serviceHours,
    smartech, smartechPieces, smartechStart, smartechEnd, smartechDone,
    customerKey: customerKeyOf(row),
  };
}

export function customerKeyOf(row) {
  if (row.customer_id) return `c:${row.customer_id}`;
  const ph = normalizeUaePhone(row.customer_phone);
  if (ph) return `p:${ph}`;
  if (row.plate) return `v:${String(row.plate).replace(/\s+/g, "").toUpperCase()}`;
  return `j:${row.id}`;
}

/* ------------------------------------------------------------------ report */

const inside = (t, a, b) => t !== null && t !== undefined && t >= a && t < b;

// ONE cohort per period: the jobs closed in it (see closedAt). Jobs
// completed = its size, revenue = the money on it, average ticket = revenue
// over its invoiced jobs, turnaround = those of them already collected.
function periodSlice(derived, a, b) {
  const completed = derived.filter((j) => inside(j.closedAt, a, b));
  const revenueJobs = completed.filter((j) => j.amount > 0);
  const revenue = revenueJobs.reduce((s, j) => s + j.amount, 0);
  const tat = completed.map((j) => j.turnaroundDays).filter((x) => x !== null);
  return {
    revenue, revenueJobs, invoiced: revenueJobs.length,
    avgTicket: revenueJobs.length ? revenue / revenueJobs.length : null,
    completed, jobsCompleted: completed.length,
    turnaroundDays: mean(tat), turnaroundN: tat.length,
  };
}

// The whole report for one period. `derived` = jobs already run through deriveJob.
export function computeReport(derived, range, { team = [], services = [], stages = DEFAULT_STAGES, now = Date.now() } = {}) {
  const cur = periodSlice(derived, range.start, range.end);
  const prev = periodSlice(derived, range.prevStart, range.prevEnd);
  const nameOf = (id) => (team.find((m) => m.id === id) || {}).name || id;
  const labelOf = (k) => (k === "_other" ? "No service recorded" : (services.find((s) => s.key === k) || {}).label || k);

  // Revenue over time.
  const buckets = buildBuckets(range).map((b) => ({
    ...b,
    cur: cur.revenueJobs.filter((j) => inside(j.closedAt, b.start, b.end)).reduce((s, j) => s + j.amount, 0),
    prevValue: b.prev ? prev.revenueJobs.filter((j) => inside(j.closedAt, b.prev.start, b.prev.end)).reduce((s, j) => s + j.amount, 0) : null,
  }));

  // Revenue by service category.
  const catSum = {};
  for (const j of cur.revenueJobs) for (const [k, f] of Object.entries(j.shares)) catSum[k] = (catSum[k] || 0) + j.amount * f;
  const byCategory = Object.entries(catSum)
    .map(([key, amount]) => ({ key, label: labelOf(key), amount, pct: cur.revenue > 0 ? (amount / cur.revenue) * 100 : 0 }))
    .filter((r) => r.amount > 0.005)
    .sort((a, b) => b.amount - a.amount);

  // Where time goes (cars collected in the period with a full recorded path).
  const lastIdx = stages.length - 1;
  const workStages = stages.slice(0, lastIdx - 1); // intake .. qc
  const readyStage = stages[lastIdx - 1];
  const timedJobs = cur.completed.filter((j) => j.collected && j.timed);
  const stageStats = workStages.map((s) => {
    const xs = timedJobs.map((j) => j.stageHours[s.key]).filter((x) => x !== undefined);
    return { key: s.key, label: s.label, avgH: mean(xs), medianH: median(xs), n: xs.length };
  });
  const pickupXs = timedJobs.map((j) => j.stageHours[readyStage.key]).filter((x) => x !== undefined);
  const pickup = { key: readyStage.key, label: "Waiting for pickup", avgH: mean(pickupXs), medianH: median(pickupXs), n: pickupXs.length };
  const withAvg = stageStats.filter((s) => s.avgH !== null);
  const bottleneck = withAvg.length ? withAvg.reduce((a, b) => (b.avgH > a.avgH ? b : a)).key : null;

  // Team.
  const teamMap = {};
  const person = (id) => (teamMap[id] ||= { id, name: nameOf(id), jobs: 0, revenue: 0, hours: [] });
  let unassignedRevenue = 0;
  for (const j of cur.completed) {
    const ids = new Set(Object.values(j.people).flat());
    ids.forEach((id) => { person(id).jobs += 1; });
    for (const [k, list] of Object.entries(j.people)) {
      if (j.serviceHours[k] !== undefined) list.forEach((id) => person(id).hours.push(j.serviceHours[k]));
    }
  }
  for (const j of cur.revenueJobs) {
    for (const [k, f] of Object.entries(j.shares)) {
      const list = j.people[k] || [];
      const part = j.amount * f;
      if (!list.length) { unassignedRevenue += part; continue; }
      list.forEach((id) => { person(id).revenue += part / list.length; });
    }
  }
  const teamRows = Object.values(teamMap)
    .map((p) => ({ id: p.id, name: p.name, jobs: p.jobs, revenue: p.revenue, avgH: mean(p.hours), timedN: p.hours.length }))
    .filter((p) => p.jobs > 0 || p.revenue > 0.005)
    .sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue || a.name.localeCompare(b.name));

  // Smartech.
  const stJobs = derived.filter((j) => j.smartech);
  const stSent = stJobs.filter((j) => inside(j.createdAt, range.start, range.end));
  const stFinished = stJobs.filter((j) => j.smartechStart !== null && j.smartechEnd !== null && j.smartechEnd > j.smartechStart && inside(j.smartechEnd, range.start, range.end));
  const stPending = stJobs.filter((j) => !j.collected && !j.smartechDone);
  const smartech = {
    cars: stSent.length,
    pieces: stSent.reduce((s, j) => s + j.smartechPieces, 0),
    avgDays: mean(stFinished.map((j) => (j.smartechEnd - j.smartechStart) / DAY)),
    timedN: stFinished.length,
    pending: stPending.length,
    pendingJobs: stPending.map((j) => ({ id: j.id, plate: j.row.plate || "", makeModel: j.row.make_model || "", since: j.smartechStart ?? j.createdAt })),
  };

  // Customers: whoever had a job opened in the period. Returning = had a job
  // on file before the period started; New = their first job is in it.
  const firstSeen = {};
  for (const j of derived) {
    if (j.createdAt === null) continue;
    if (firstSeen[j.customerKey] === undefined || j.createdAt < firstSeen[j.customerKey]) firstSeen[j.customerKey] = j.createdAt;
  }
  const visitors = new Set(derived.filter((j) => inside(j.createdAt, range.start, range.end)).map((j) => j.customerKey));
  let returning = 0, fresh = 0;
  visitors.forEach((k) => { if (firstSeen[k] < range.start) returning += 1; else fresh += 1; });
  const spend = {};
  for (const j of cur.revenueJobs) {
    const c = (spend[j.customerKey] ||= { key: j.customerKey, name: "", plate: "", spend: 0, jobs: 0, lastJobId: null, lastAt: -Infinity });
    c.spend += j.amount; c.jobs += 1;
    const t = j.createdAt ?? 0;
    if (t >= c.lastAt) { c.lastAt = t; c.lastJobId = j.id; c.name = j.row.customer_name || c.name; c.plate = j.row.plate || c.plate; }
  }
  const topCustomers = Object.values(spend).sort((a, b) => b.spend - a.spend).slice(0, 5)
    .map((c) => ({ key: c.key, name: c.name || "Unknown", plate: c.plate, spend: c.spend, jobs: c.jobs, lastJobId: c.lastJobId }));
  const firstRecord = minOf(derived.map((j) => j.createdAt).filter((t) => t !== null));

  return {
    range, now,
    kpi: {
      revenue: { cur: cur.revenue, prev: prev.revenue, prevN: prev.invoiced },
      jobs: { cur: cur.jobsCompleted, prev: prev.jobsCompleted },
      avgTicket: { cur: cur.avgTicket, prev: prev.avgTicket, n: cur.invoiced },
      turnaround: { cur: cur.turnaroundDays, prev: prev.turnaroundDays, n: cur.turnaroundN, prevN: prev.turnaroundN },
    },
    buckets, byCategory,
    stages: stageStats, pickup, bottleneck, timedJobs: timedJobs.length,
    team: teamRows, unassignedRevenue,
    smartech,
    customers: { returning, fresh, total: returning + fresh, top: topCustomers, firstRecord },
  };
}

/* ------------------------------------------------------------ KPI deltas */

// { dir: "up" | "down" | "flat" | "none", text } - never colour alone:
// the arrow and the words carry the direction.
export function delta(cur, prev, { kind = "pct", goodWhen = "up", unit = "" } = {}) {
  if (cur === null || cur === undefined) return { dir: "none", good: null, text: "" };
  if (prev === null || prev === undefined || (kind === "pct" && prev === 0)) return { dir: "none", good: null, text: "No data to compare" };
  const diff = cur - prev;
  if (Math.abs(diff) < 1e-9) return { dir: "flat", good: null, text: "No change" };
  const dir = diff > 0 ? "up" : "down";
  const good = goodWhen === "up" ? diff > 0 : diff < 0;
  const arrow = diff > 0 ? "▲" : "▼";
  let text;
  if (kind === "pct") text = `${arrow} ${Math.abs(Math.round((diff / prev) * 100))}%`;
  else if (kind === "count") text = `${arrow} ${Math.abs(Math.round(diff))}${unit ? ` ${unit}` : ""}`;
  else if (kind === "days") text = `${arrow} ${Math.abs(round1(diff))} ${Math.abs(round1(diff)) === 1 ? "day" : "days"} ${diff < 0 ? "faster" : "slower"}`;
  else text = `${arrow} ${Math.abs(round1(diff))}`;
  return { dir, good, text };
}

/* ------------------------------------------------------------ QC credit */

// Who the "Marked done" history entry is credited to when a QC approver passes
// a service on the Dispatch Board: the installers who DID the work (lead first,
// then the rest of the team on that service), never the approver. Returns
// { by, role, doneBy: [names] }, or null when nobody is assigned (the caller
// then keeps the approver as `by`, as before). `team` = team_members rows.
export function qcDoneCredit(job, categoryKey, team = []) {
  const crew = ((job && job.assigned_team) || {})[categoryKey];
  const ids = [((job && job.assigned_to) || {})[categoryKey], ...(Array.isArray(crew) ? crew : [])].filter((x) => typeof x === "string" && x);
  const doers = [...new Set(ids)].map((id) => team.find((m) => m.id === id)).filter(Boolean);
  if (!doers.length) return null;
  return { by: doers[0].name, role: doers[0].role, doneBy: doers.map((m) => m.name) };
}

/* ------------------------------------------------------------ WIP aging */

export const WIP_REASONS = [
  { key: "ready_uncollected", label: "Ready, not collected" },
  { key: "slow_service", label: "In service too long" },
  { key: "qc_pending", label: "Waiting on QC" },
  { key: "on_hold", label: "On hold" },
  { key: "unassigned", label: "Nobody on it" },
];

export function serviceTargetH(catKey, bodyType) {
  if (catKey === "ppf") return bodyType === "suv" || bodyType === "pickup" ? SERVICE_TARGET_H.ppf_wide : SERVICE_TARGET_H.ppf_narrow;
  return SERVICE_TARGET_H[catKey] ?? SERVICE_TARGET_H.default;
}

// Shop hours as people say them: "45 min", "6.5 h", "2.3 shop days".
export function fmtShopHours(h) {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < SHOP_DAY_H) return `${h.toFixed(1)} h`;
  const d = h / SHOP_DAY_H;
  return `${d.toFixed(1)} shop ${round1(d) === 1 ? "day" : "days"}`;
}

// The latest QC entry for a service since its latest "Started" (same rule as
// the Dispatch Board, so the two never disagree).
function latestQcEntry(hist, key, label) {
  const matches = (h) => (h.cat ? h.cat === key : h.label === label);
  let startIdx = -1;
  for (let i = 0; i < hist.length; i++) { const h = hist[i]; if (h && h.stage === "service" && matches(h) && h.note === "Started") startIdx = i; }
  let qc = null;
  for (let i = startIdx + 1; i < hist.length; i++) { const h = hist[i]; if (h && h.stage === "qc" && matches(h)) qc = h; }
  return qc;
}

// Cars that are stuck, right now. Nothing here needs money, so managers see it.
export function computeWip(derived, { now = Date.now(), stages = DEFAULT_STAGES, services = [] } = {}) {
  const lastIdx = stages.length - 1;
  const readyIdx = lastIdx - 1;
  const labelOf = (k) => (services.find((s) => s.key === k) || {}).label || k;
  const rows = [];
  let tooOld = 0;
  for (const j of derived) {
    if (j.collected) continue;
    const ref = j.createdAt ?? j.updatedAt;
    if (ref !== null && ref < now - WIP_LOOKBACK_DAYS * DAY) { tooOld += 1; continue; }
    const row = j.row;
    const hist = Array.isArray(row.history) ? row.history : [];
    const reasons = [];

    if (j.stageIndex === readyIdx) {
      const since = (readyIdx >= 1 ? j.leftAt[stages[readyIdx - 1].key] : null) ?? j.updatedAt;
      const h = since !== null ? businessHours(since, now) : 0;
      if (h > WIP_READY_UNCOLLECTED_H) reasons.push({ key: "ready_uncollected", label: "Ready, not collected", detail: `Ready for ${fmtShopHours(h)}`, hours: h });
    }
    if (j.stageIndex < readyIdx) {
      const types = row.service_types || [];
      const done = row.service_done || {};
      const started = row.service_started || {};
      for (const k of types) {
        if (done[k] === true || !started[k]) continue;
        const label = labelOf(k);
        const startedAt = toMs(started[k]) ?? firstAt(hist, (e) => e.stage === "service" && e.label === label && e.note === "Started") ?? j.updatedAt;
        if (startedAt === null) continue;
        const qc = latestQcEntry(hist, k, label);
        if (qc && qc.note === "Sent to QC") {
          const qcAt = toMs(qc.at) ?? startedAt;
          const h = businessHours(qcAt, now);
          if (h > WIP_QC_WAIT_H) reasons.push({ key: "qc_pending", label: "Waiting on QC", detail: `${label} sent to QC ${fmtShopHours(h)} ago, not passed`, hours: h });
          continue;
        }
        const h = businessHours(startedAt, now);
        const target = serviceTargetH(k, row.body_type);
        if (h > target) reasons.push({ key: "slow_service", label: "In service too long", detail: `${label} ${fmtShopHours(h)} in service (target ${fmtShopHours(target)})`, hours: h });
      }
      // Nobody on a service the shop does itself.
      const external = new Set([...EXTERNAL_SERVICE_KEYS, ...smartechKeysOf(row)]);
      const openH = j.createdAt !== null ? businessHours(j.createdAt, now) : 0;
      if (openH > WIP_UNASSIGNED_H) {
        const nobody = types.filter((k) => !external.has(k) && done[k] !== true && !(j.people[k] || []).length);
        if (nobody.length) reasons.push({ key: "unassigned", label: "Nobody on it", detail: `No one assigned to ${nobody.map(labelOf).join(", ")}`, hours: openH });
      }
    }
    if (row.on_hold) {
      const since = toMs(row.on_hold_since);
      const h = since !== null ? businessHours(since, now) : 0;
      reasons.push({ key: "on_hold", label: "On hold", detail: `On hold${since !== null ? ` for ${fmtShopHours(h)}` : ""}${row.on_hold_note ? `: ${row.on_hold_note}` : ""}`, hours: h });
    }
    if (!reasons.length) continue;
    const worst = maxOf(reasons.map((r) => r.hours)) || 0;
    rows.push({ id: j.id, plate: row.plate || "", makeModel: row.make_model || "", customer: row.customer_name || "", stageLabel: (stages[j.stageIndex] || {}).label || "", reasons, worst });
  }
  rows.sort((a, b) => b.reasons.length - a.reasons.length || b.worst - a.worst);
  const counts = {};
  for (const r of WIP_REASONS) counts[r.key] = rows.filter((x) => x.reasons.some((y) => y.key === r.key)).length;
  return { rows, counts, total: rows.length, tooOld };
}

/* ------------------------------------------------------------ daily close-out */

// Which stage a job was in at instant T, read from its step history. Legacy
// jobs with missing steps are treated as having passed them.
function stageAt(j, t, stages) {
  const lastIdx = stages.length - 1;
  if (j.createdAt === null || j.createdAt > t) return -1; // not opened yet
  if (j.collectedAt !== null && j.collectedAt <= t) return lastIdx; // already out
  for (let i = 0; i < lastIdx; i++) {
    if (i >= j.stageIndex) return i;
    const lt = j.leftAt[stages[i].key];
    if (lt !== null && lt > t) return i;
  }
  return lastIdx - 1;
}

export function computeDayClose(derived, dateKey, { stages = DEFAULT_STAGES, now = Date.now() } = {}) {
  const a = parseDateKey(dateKey) ?? dubaiStartOfDay(now);
  const b = a + DAY;
  const t = Math.min(now, b - 1);
  const lastIdx = stages.length - 1;
  const isToday = now >= a && now < b;
  const carsIn = derived.filter((j) => inside(j.createdAt, a, b));
  const carsOut = derived.filter((j) => j.collected && inside(j.collectedAt, a, b));
  const finalized = derived.filter((j) => inside(j.finalizedAt, a, b));
  const gross = finalized.reduce((s, j) => s + j.amount, 0);
  const net = gross / (1 + VAT_RATE);
  const wip = stages.slice(0, lastIdx).map((s) => ({ key: s.key, label: s.label, count: 0 }));
  for (const j of derived) {
    if (t < a) break;
    const idx = isToday ? (j.collected ? lastIdx : Math.min(j.stageIndex, lastIdx - 1)) : stageAt(j, t, stages);
    if (idx >= 0 && idx < lastIdx && (!isToday || j.createdAt === null || j.createdAt <= t)) wip[idx].count += 1;
  }
  const plates = (list) => list.map((j) => j.row.plate || j.row.make_model || "car");
  return {
    dateKey: dubaiDateKey(a), start: a, end: b, isToday, label: dubaiDayLabel(a),
    carsIn: carsIn.length, carsOut: carsOut.length, inPlates: plates(carsIn), outPlates: plates(carsOut),
    wip, wipTotal: wip.reduce((s, x) => s + x.count, 0),
    invoices: { count: finalized.length, gross, net, vat: gross - net },
  };
}

// Short plain text for WhatsApp. Money lines only when `showMoney`.
export function endOfDayMessage(close, { showMoney = false, stuck = null } = {}) {
  const list = (ps) => (ps.length ? ` (${ps.slice(0, 10).join(", ")}${ps.length > 10 ? ` +${ps.length - 10} more` : ""})` : "");
  const L = [];
  L.push(`Mr.CAP. end of day, ${close.label}`);
  L.push(`Cars in: ${close.carsIn}${list(close.inPlates)}`);
  L.push(`Cars out: ${close.carsOut}${list(close.outPlates)}`);
  L.push(`In the shop now: ${close.wipTotal}${close.wipTotal ? ` (${close.wip.filter((s) => s.count).map((s) => `${s.label} ${s.count}`).join(", ")})` : ""}`);
  L.push(`Invoices finalized: ${close.invoices.count}`);
  if (showMoney && close.invoices.count) {
    const f = (n) => `AED ${Math.round(n).toLocaleString("en-US")}`;
    L.push(`Invoiced today: ${f(close.invoices.gross)} incl. VAT (${f(close.invoices.net)} + ${f(close.invoices.vat)} VAT)`);
  }
  if (stuck && stuck.total) L.push(`Needs attention: ${stuck.total} ${stuck.total === 1 ? "car" : "cars"} stuck`);
  return L.join("\n");
}

// Opens WhatsApp's own "choose a chat" screen with the text filled in.
export function whatsappShareLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text || "")}`;
}

/* ------------------------------------------------------------ PPF film */

// Per make/model film use, from the PPF Room data on each job:
//   ppf_scope    { preset, edited, zones: { panelKey: "full"|"partial" }, extras, spare, setAt }
//   ppf_progress { startedAt, finishedAt (ms), zones, review: { actualKeys: [], filmMetres, rollWidth, at } }
// `review` (actual panels, film metres) is written once, when Ahmed approves
// the PPF work, so older jobs have planned panels and dates but no film.
export function computePpfReport(rows, { range = null } = {}) {
  const groups = new Map();
  const add = (key, label, m) => {
    const g = groups.get(key) || { key, label, jobs: 0, planned: [], actual: [], film: [], days: [], perPanel: [] };
    g.jobs += 1;
    if (m.planned > 0) g.planned.push(m.planned);
    if (m.actual !== null) g.actual.push(m.actual);
    if (m.film !== null) g.film.push(m.film);
    if (m.days !== null) g.days.push(m.days);
    if (m.film !== null && m.actual) g.perPanel.push(m.film / m.actual);
    groups.set(key, g);
  };
  const all = { jobs: 0, planned: [], actual: [], film: [], days: [], perPanel: [] };
  const push = (t, m) => {
    t.jobs += 1;
    if (m.planned > 0) t.planned.push(m.planned);
    if (m.actual !== null) t.actual.push(m.actual);
    if (m.film !== null) t.film.push(m.film);
    if (m.days !== null) t.days.push(m.days);
    if (m.film !== null && m.actual) t.perPanel.push(m.film / m.actual);
  };
  for (const r of rows || []) {
    const sc = r && r.ppf_scope;
    if (!sc || typeof sc !== "object") continue;
    const pr = (r.ppf_progress && typeof r.ppf_progress === "object") ? r.ppf_progress : {};
    const rv = pr.review && typeof pr.review === "object" ? pr.review : null;
    const car = { bodyShape: r.body_type || "", spare: !!sc.spare, extras: sc.extras || {}, scope: { preset: sc.preset, edited: !!sc.edited, z: sc.zones || {} } };
    const planned = scopeKeys(car).length;
    const actual = rv && Array.isArray(rv.actualKeys) ? rv.actualKeys.length : null;
    if (planned === 0 && actual === null) continue; // tint-only job: no film panels
    const startedAt = toMs(pr.startedAt) ?? toMs(sc.setAt) ?? toMs(r.created_at);
    if (range && !inside(startedAt, range.start, range.end)) continue;
    const filmRaw = rv ? rv.filmMetres : null;
    const film = filmRaw !== null && filmRaw !== undefined && filmRaw !== "" && Number.isFinite(Number(filmRaw)) ? Number(filmRaw) : null;
    const s0 = toMs(pr.startedAt), s1 = toMs(pr.finishedAt);
    const d = s0 !== null && s1 !== null && s1 > s0 ? businessHours(s0, s1) / SHOP_DAY_H : null;
    const m = { planned, actual, film, days: d };
    const make = String(r.make || "").trim(), model = String(r.model || "").trim();
    const label = (make || model) ? `${make} ${model}`.trim() : (String(r.make_model || "").trim() || "Unknown car");
    add(label.toLowerCase(), label, m);
    push(all, m);
  }
  const fin = (g) => ({
    key: g.key, label: g.label, jobs: g.jobs,
    plannedAvg: mean(g.planned), actualAvg: mean(g.actual), actualN: g.actual.length,
    filmAvg: mean(g.film), filmN: g.film.length, filmPct: g.jobs ? (g.film.length / g.jobs) * 100 : null,
    perPanel: mean(g.perPanel), daysAvg: mean(g.days), daysN: g.days.length,
  });
  const out = [...groups.values()].map(fin).sort((a, b) => b.jobs - a.jobs || a.label.localeCompare(b.label));
  return { rows: out, total: { ...fin({ ...all, key: "_all", label: "All PPF jobs" }) } };
}

/* ------------------------------------------------------------ due back */

export const DUE_BACK_RULES = [
  { key: "coating", label: "Coating maintenance", months: 11, rule: "11+ months after a MasterTreatment, FormulaU, resealant or ceramic job",
    pitch: "Your coating is due its yearly maintenance to keep the protection at its best.",
    match: (cat, name) => cat === "detailing" && /master\s*treatment|formula\s*u\b|formulau \(|resealant|ceramic|coating/i.test(name) && !/wash/i.test(name) },
  { key: "ppf", label: "PPF inspection", months: 12, rule: "12+ months after PPF",
    pitch: "Your PPF is due its yearly inspection.",
    match: (cat, name) => cat === "ppf" && /ppf|anti\s*gravel|film/i.test(name) && !/removal|tint/i.test(name) },
  { key: "detail", label: "Detailing refresh", months: 6, rule: "6+ months after any detailing job",
    pitch: "It may be a good time for a refresh detail.",
    match: (cat) => cat === "detailing" },
];

// Customers whose most recent visit (any job) was long enough ago for a
// service they have had with us. Anyone who has been back since is skipped
// automatically, because the clock runs from their latest visit.
export function computeDueBack(derived, now) {
  const byCustomer = {};
  for (const j of derived) {
    if (j.createdAt === null) continue;
    (byCustomer[j.customerKey] ||= []).push(j);
  }
  const out = [];
  for (const [key, list] of Object.entries(byCustomer)) {
    list.sort((a, b) => b.createdAt - a.createdAt);
    const last = list[0];
    const monthsSince = (now - last.createdAt) / MONTH_MS;
    let hit = null;
    for (const rule of DUE_BACK_RULES) {
      if (monthsSince < rule.months) continue;
      for (const j of list) {
        const picks = Object.entries(j.row.treatments || {}).flatMap(([cat, names]) => (Array.isArray(names) ? names : []).map((n) => [cat, n]));
        const pick = picks.find(([cat, n]) => rule.match(cat, n));
        if (pick) { hit = { rule, job: j, service: pick[1] }; break; }
        if (rule.key === "detail" && (j.row.service_types || []).includes("detailing")) { hit = { rule, job: j, service: "Detailing" }; break; }
      }
      if (hit) break;
    }
    if (!hit) continue;
    const phone = list.map((j) => j.row.customer_phone).find((p) => normalizeUaePhone(p));
    const name = list.map((j) => j.row.customer_name).find((n) => n && String(n).trim() && n !== "—") || "Customer";
    const lifetime = list.reduce((s, j) => s + j.amount, 0);
    out.push({
      key, name, phone: phone || null, waNumber: normalizeUaePhone(phone),
      plate: last.row.plate || "", makeModel: last.row.make_model || "",
      lastVisit: last.createdAt, months: Math.floor(monthsSince), ruleKey: hit.rule.key, ruleLabel: hit.rule.label,
      service: hit.service, lifetime, lastJobId: last.id, visits: list.length,
    });
  }
  return out.sort((a, b) => b.lifetime - a.lifetime || b.months - a.months);
}

/* ------------------------------------------------------------ WhatsApp */

// UAE numbers in any of the shapes staff type them: 050 123 4567,
// +971 50 123 4567, 00971501234567, 971 050..., 501234567.
export function normalizeUaePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("9710")) d = `971${d.slice(4)}`;
  if (d.startsWith("971")) return d.length >= 11 && d.length <= 12 ? d : null;
  if (d.startsWith("05") && d.length === 10) return `971${d.slice(1)}`;
  if (d.startsWith("5") && d.length === 9) return `971${d}`;
  if (d.startsWith("0") && d.length === 9) return `971${d.slice(1)}`; // landline 04 xxx xxxx
  return d.length >= 10 && d.length <= 15 ? d : null; // already international
}

export function dueBackMessage(item) {
  const rule = DUE_BACK_RULES.find((r) => r.key === item.ruleKey) || DUE_BACK_RULES[2];
  const first = String(item.name || "").trim().split(/\s+/)[0] || "";
  const hello = first && !/^(mr|mrs|ms|dr)\.?$/i.test(first) ? `Hello ${first},` : `Hello ${String(item.name || "").trim() || "there"},`;
  const car = item.makeModel ? `your ${item.makeModel}` : "your car";
  return `${hello} this is Mr.CAP. It has been about ${item.months} months since we last looked after ${car}. ${rule.pitch} Just reply here and we will find a time that suits you. Thank you!`;
}

export function whatsappLink(phone, text) {
  const n = normalizeUaePhone(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text || "")}`;
}

/* ------------------------------------------------------------ billing */

// Same numbers as the Billing screen's "Outstanding": the unpaid balance on
// every ISSUED proforma (drafts and voids excluded), cash/transfer counted
// when recorded, cheques only once cleared (paymentSummary in billing.js).
export function computeOutstanding(proformas, payments) {
  const paysBy = {};
  for (const x of payments || []) (paysBy[x.proforma_id] ||= []).push(x);
  let amount = 0, count = 0;
  for (const p of proformas || []) {
    if (p.status !== "issued") continue;
    const vat = Number(p.vat_rate);
    const totalIncl = p.totals && typeof p.totals.totalIncl === "number"
      ? p.totals.totalIncl
      : computeTotals(p.lines, Number.isFinite(vat) ? vat : 0.05).totalIncl;
    const s = paymentSummary(totalIncl, paysBy[p.id]);
    if (s.balance > 0) { amount += s.balance; count += 1; }
  }
  return { amount: Math.round(amount * 100) / 100, count };
}

/* ------------------------------------------------------------ formatting */

export function fmtAED(n) {
  return `AED ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}
export function fmtCompact(n) {
  const v = Math.abs(Number(n) || 0), sign = n < 0 ? "-" : "";
  if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(v >= 1e7 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  if (v >= 1e4) return `${sign}${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}${Math.round(v)}`;
}
export function fmtHours(h) {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}
export function fmtDays(d) {
  if (d === null || d === undefined) return "—";
  if (d < 1) return `${(d * SHOP_DAY_H).toFixed(1)} h`;
  return `${d.toFixed(1)} days`;
}

/* ------------------------------------------------------------ Excel workbook */

const n2 = (v) => (v === null || v === undefined ? "" : Math.round(v * 100) / 100);

// One sheet per section, as plain data: { name, head: [...], rows: [[...]], widths: [...] }.
// ReportsDashboard.jsx writes these into a real .xlsx with exceljs (lazy-loaded);
// keeping the content here lets a node script check every cell.
// Money sheets/columns are left out unless `showRevenue`.
export function reportSheets(report, { outstanding = null, dueBack = [], wip = null, close = null, ppf = null, showRevenue = true, generatedAt = new Date() } = {}) {
  const k = report.kpi;
  const sheets = [];
  const sum = [
    ["Period", report.range.label, ""],
    ["Compared with", report.range.prevLabel, ""],
    ["Generated", generatedAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) + " (Dubai)", ""],
  ];
  if (showRevenue) sum.push(["Revenue (AED)", n2(k.revenue.cur), n2(k.revenue.prev)]);
  sum.push(["Jobs completed", k.jobs.cur, k.jobs.prev]);
  if (showRevenue) sum.push(["Average ticket (AED)", n2(k.avgTicket.cur), n2(k.avgTicket.prev)]);
  sum.push(["Average turnaround (shop days)", n2(k.turnaround.cur), n2(k.turnaround.prev)]);
  if (outstanding) sum.push(["Outstanding on issued proformas (AED, all time)", n2(outstanding.amount), ""]);
  sheets.push({ name: "Summary", head: ["Metric", "This period", "Previous period"], rows: sum, widths: [46, 26, 26] });
  if (showRevenue) {
    sheets.push({ name: "Revenue over time", head: ["Period", "This period (AED)", "Previous period (AED)", "Previous period dates"], widths: [26, 20, 22, 26],
      rows: report.buckets.map((b) => [b.full, n2(b.cur), b.prevValue === null ? "" : n2(b.prevValue), b.prev ? b.prev.full : ""]) });
    sheets.push({ name: "Revenue by service", head: ["Service", "AED", "% of revenue"], widths: [30, 16, 16], rows: report.byCategory.map((c) => [c.label, n2(c.amount), n2(c.pct)]) });
  }
  sheets.push({ name: "Where time goes", head: ["Stage", "Average shop hours", "Median shop hours", "Jobs measured"], widths: [38, 20, 20, 16],
    rows: [...report.stages.map((s) => [s.label + (report.bottleneck === s.key ? " (bottleneck)" : ""), n2(s.avgH), n2(s.medianH), s.n]),
      [`${report.pickup.label} (Ready to Collected)`, n2(report.pickup.avgH), n2(report.pickup.medianH), report.pickup.n]] });
  const teamRows = report.team.map((p) => (showRevenue ? [p.name, p.jobs, n2(p.revenue), n2(p.avgH)] : [p.name, p.jobs, n2(p.avgH)]));
  if (showRevenue && report.unassignedRevenue > 0.005) teamRows.push(["(not assigned)", "", n2(report.unassignedRevenue), ""]);
  sheets.push({ name: "Team", head: showRevenue ? ["Name", "Jobs completed", "Revenue attributed (AED)", "Avg service shop hours"] : ["Name", "Jobs completed", "Avg service shop hours"], widths: [24, 16, 24, 22], rows: teamRows });
  sheets.push({ name: "Smartech", head: ["Measure", "Value"], widths: [30, 16], rows: [
    ["Cars sent", report.smartech.cars], ["Pieces", report.smartech.pieces], ["Average turnaround (days)", n2(report.smartech.avgDays)], ["Pending now", report.smartech.pending]] });
  sheets.push({ name: "Customers", head: ["Customers", "Count"], widths: [24, 12], rows: [["Returning", report.customers.returning], ["New", report.customers.fresh]] });
  if (showRevenue) sheets.push({ name: "Top customers", head: ["Customer", "Plate", "Jobs", "Spend (AED)"], widths: [28, 16, 8, 16], rows: report.customers.top.map((c) => [c.name, c.plate, c.jobs, n2(c.spend)]) });
  sheets.push({ name: "Due back", head: ["Customer", "Reason", "Months since last visit", "Car", "Plate"], widths: [26, 24, 22, 26, 16], rows: dueBack.map((d) => [d.name, d.ruleLabel, d.months, d.makeModel, d.plate]) });
  if (wip) {
    sheets.push({ name: "Stuck cars", head: ["Plate", "Car", "Stage", "Problem", "Detail"], widths: [16, 26, 20, 24, 60],
      rows: wip.rows.flatMap((r) => r.reasons.map((x) => [r.plate, r.makeModel, r.stageLabel, x.label, x.detail])) });
  }
  if (close) {
    const rows = [["Day", close.label, ""], ["Cars in", close.carsIn, ""], ["Cars out", close.carsOut, ""],
      ...close.wip.map((s) => [`In the shop: ${s.label}`, s.count, ""]), ["Invoices finalized", close.invoices.count, ""]];
    if (showRevenue) rows.push(["Invoiced, incl. VAT (AED)", n2(close.invoices.gross), ""], ["Net of VAT (AED)", n2(close.invoices.net), ""], ["VAT 5% (AED)", n2(close.invoices.vat), ""]);
    sheets.push({ name: "Daily close-out", head: ["Measure", "Value", ""], widths: [32, 22, 4], rows });
  }
  if (ppf) {
    const line = (r) => [r.label, r.jobs, n2(r.plannedAvg), n2(r.actualAvg), n2(r.filmAvg), r.filmPct === null ? "" : Math.round(r.filmPct), n2(r.perPanel), n2(r.daysAvg)];
    sheets.push({ name: "PPF film", head: ["Make / model", "PPF jobs", "Avg planned panels", "Avg actual panels", "Avg film (m)", "% with film recorded", "Film per panel (m)", "Avg shop days start to finish"], widths: [28, 10, 18, 18, 14, 20, 18, 26],
      rows: [...ppf.rows.map(line), line(ppf.total)] });
  }
  return sheets;
}

export const HOW_NUMBERS_WORK = [
  ["Dates and times", "Every day, week and month is cut at midnight Dubai time, whatever timezone the phone or computer is set to. Time spent (turnaround, stage times, waiting) is counted in shop hours: 9am to 7pm, Monday to Saturday, Sunday closed, like the TV board. Ten shop hours make one shop day."],
  ["Jobs counted", "Jobs completed, revenue and average ticket all use the same group of jobs: the ones closed in the period. A job closes on the day its tax invoice was finalized; a job with no invoice closes the day the car was collected. Editing a job later never moves it to another period."],
  ["Revenue", "The invoice amount saved on each closed job (VAT included, after the job's discount, parts and fees included: the total the tax invoice prints). A job with no invoice amount adds nothing, and a job that is neither finalized nor collected is not revenue yet."],
  ["Jobs completed", "How many jobs closed in the period (see Jobs counted), including cars whose invoice is finalized but are still waiting for pickup."],
  ["Average ticket", "Revenue divided by the number of closed jobs that carry an invoice amount."],
  ["Turnaround", "Shop days from the job card being opened to Collected, for closed jobs that were collected. Jobs imported from old records have no step times and are left out."],
  ["Compared with", "The same stretch of the previous period: 1–22 Sep against 1–22 Aug, Monday to Wednesday against the Monday to Wednesday before. A custom range is compared with the equally long stretch just before it."],
  ["Revenue by service", "Each job's amount is split across its services in proportion to the prices of the treatments picked; parts and fees follow the same split. A job with no priced treatments is split evenly across its services."],
  ["Where time goes", "Average shop hours between the recorded stage steps, for closed, collected jobs whose every step was recorded."],
  ["Team", "Everyone assigned to a service (lead or team) is credited with the job, and that service's share of the revenue is split evenly between them. Average time is Started → Marked done on their service, in shop hours."],
  ["Smartech", "Jobs with Body Work or Dent & Paint. Cars sent = jobs opened in the period. Turnaround = Started → Marked done (or marked done/ready by Smartech). Pending = not done yet, right now."],
  ["Customers", "Everyone with a job opened in the period. Returning = had a job with us before the period; New = their first job on record is in it."],
  ["Outstanding", "Unpaid balance on issued proformas, all time, same as the Billing screen: cash and transfers count when recorded, cheques once cleared."],
  ["Stuck cars", `Cars not collected yet that need a push. Ready and not collected for more than ${WIP_READY_UNCOLLECTED_H} shop hours; a service started and not finished for longer than its target (PPF ${SERVICE_TARGET_H.ppf_narrow} shop hours, ${SERVICE_TARGET_H.ppf_wide} on an SUV or pickup; other services ${SERVICE_TARGET_H.default}); sent to QC more than ${WIP_QC_WAIT_H} shop hours ago without a QC pass; on hold; or nobody assigned after ${WIP_UNASSIGNED_H} shop hour. Jobs older than ${WIP_LOOKBACK_DAYS} days are treated as old records and not listed.`],
  ["Daily close-out", "One Dubai day: cars in = job cards opened that day, cars out = cars collected that day, in the shop = where every open car stood at the end of it, invoices = tax invoices finalized that day. Net and VAT are worked back from the invoice total at 5%."],
  ["PPF film", "Per make and model, from the PPF Room: planned panels are what Ahmed scoped, actual panels and film metres are what he recorded when approving the job (older jobs have none), and days are shop days from PPF started to finished."],
];
