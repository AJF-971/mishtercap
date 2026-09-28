// Pure number-crunching for the Reports screen (ReportsDashboard.jsx).
// No React, no network, no DOM - so every figure the boss sees can be
// checked by a plain node script against fixture jobs.
//
// Every rule here mirrors a rule that already exists in GarageApp.jsx; where
// a rule is new (period comparison, category split, due-back) it is written
// out in HOW_NUMBERS_WORK so the screen can state it.

import { computeTotals, paymentSummary } from "./billing.js";

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
const MONTH_MS = 30.4375 * DAY;

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

/* ------------------------------------------------------------------ periods */

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

// Local calendar date "YYYY-MM-DD" (NOT toISOString - Dubai is UTC+4).
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function addUnit(date, unit, n) {
  const d = new Date(date.getTime());
  if (unit === "hour") d.setHours(d.getHours() + n);
  else if (unit === "day") d.setDate(d.getDate() + n);
  else if (unit === "week") d.setDate(d.getDate() + 7 * n);
  else if (unit === "month") d.setMonth(d.getMonth() + n);
  return d;
}

// The selected period runs from the start of the current calendar unit up to
// now. It is compared with the SAME stretch of the previous unit: 1-22 Sep
// against 1-22 Aug, Mon-Wed this week against Mon-Wed last week. A custom
// range is compared with the equally long stretch right before it.
export function periodRange(key, nowMs, custom) {
  const now = new Date(nowMs);
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  let start, prevStart, end = nowMs, bucketUnit;
  if (key === "today") { start = new Date(y, m, d); prevStart = new Date(y, m, d - 1); bucketUnit = "hour"; }
  else if (key === "week") { const dow = (now.getDay() + 6) % 7; start = new Date(y, m, d - dow); prevStart = new Date(y, m, d - dow - 7); bucketUnit = "day"; }
  else if (key === "quarter") { const qm = m - (m % 3); start = new Date(y, qm, 1); prevStart = new Date(y, qm - 3, 1); bucketUnit = "week"; }
  else if (key === "year") { start = new Date(y, 0, 1); prevStart = new Date(y - 1, 0, 1); bucketUnit = "month"; }
  else if (key === "custom") {
    const from = parseDateKey(custom && custom.from) || new Date(y, m, d - 29);
    let to = parseDateKey(custom && custom.to) || new Date(y, m, d);
    if (to < from) to = from;
    start = from;
    end = Math.min(addUnit(to, "day", 1).getTime(), Math.max(nowMs, start.getTime() + 1));
    const len = end - start.getTime();
    prevStart = new Date(start.getTime() - len);
    const days = len / DAY;
    bucketUnit = days <= 2 ? "hour" : days <= 62 ? "day" : days <= 400 ? "week" : "month";
    return finish({ key, start: start.getTime(), end, prevStart: prevStart.getTime(), prevEnd: start.getTime(), bucketUnit });
  } else { start = new Date(y, m, 1); prevStart = new Date(y, m - 1, 1); bucketUnit = "day"; key = "month"; }
  const len = end - start.getTime();
  const prevEnd = Math.min(prevStart.getTime() + len, start.getTime());
  return finish({ key, start: start.getTime(), end, prevStart: prevStart.getTime(), prevEnd, bucketUnit });
}
function finish(r) {
  return { ...r, label: rangeLabel(r.start, r.end), prevLabel: rangeLabel(r.prevStart, r.prevEnd) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "1-22 Sep 2026", "29 Jun - 5 Jul 2026", "22 Sep 2026" (end is exclusive).
export function rangeLabel(startMs, endMs) {
  const a = new Date(startMs);
  const b = new Date(Math.max(startMs, endMs - 1));
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    if (a.getDate() === b.getDate()) return `${a.getDate()} ${MON[a.getMonth()]} ${a.getFullYear()}`;
    return `${a.getDate()}–${b.getDate()} ${MON[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${MON[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}`;
}

function bucketLabels(date, unit) {
  const dd = date.getDate(), mm = MON[date.getMonth()];
  if (unit === "hour") { const h = date.getHours(); return { label: `${h}:00`, full: `${WD[date.getDay()]} ${dd} ${mm}, ${h}:00–${h + 1}:00` }; }
  if (unit === "day") return { label: String(dd), full: `${WD[date.getDay()]} ${dd} ${mm}` };
  if (unit === "week") return { label: `${dd} ${mm}`, full: `Week of ${dd} ${mm}` };
  return { label: mm, full: `${mm} ${date.getFullYear()}` };
}

// Current-period buckets plus, for each, the matching stretch of the
// previous period (same offset from its start), or null past its end.
export function buildBuckets(range) {
  const out = [];
  const s0 = new Date(range.start), p0 = new Date(range.prevStart);
  for (let i = 0; i < 400; i++) {
    const s = addUnit(s0, range.bucketUnit, i);
    if (s.getTime() >= range.end) break;
    const e = Math.min(addUnit(s0, range.bucketUnit, i + 1).getTime(), range.end);
    const ps = addUnit(p0, range.bucketUnit, i).getTime();
    const pe = Math.min(addUnit(p0, range.bucketUnit, i + 1).getTime(), range.prevEnd);
    const prev = ps < range.prevEnd ? { start: ps, end: pe, ...bucketLabels(new Date(ps), range.bucketUnit) } : null;
    out.push({ i, start: s.getTime(), end: e, ...bucketLabels(s, range.bucketUnit), prev });
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
export function deriveJob(row, { stages = DEFAULT_STAGES, services = [] } = {}) {
  const hist = Array.isArray(row.history) ? row.history : [];
  const lastIdx = stages.length - 1;
  const stageIndex = Number.isFinite(row.stage_index) ? row.stage_index : 0;
  const createdAt = toMs(row.created_at);
  const updatedAt = toMs(row.updated_at);
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

  // Hours spent in each stage, only when the whole path was recorded.
  const stageHours = {};
  if (timed && createdAt !== null) {
    for (let i = 0; i < lastIdx; i++) {
      const from = i === 0 ? createdAt : left[stages[i - 1].key];
      const to = left[stages[i].key];
      if (from !== null && to !== null && to >= from) stageHours[stages[i].key] = (to - from) / HOUR;
    }
  }
  const turnaroundDays = timed && createdAt !== null && collectedAt >= createdAt ? (collectedAt - createdAt) / DAY : null;

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
  // Hands-on time per service: Started -> Marked done.
  const serviceHours = {};
  for (const k of Object.keys(people)) {
    const label = labelOf(k);
    const done = lastAt(hist, (e) => e.stage === "service" && e.label === label && e.note === "Marked done");
    const started = toMs((row.service_started || {})[k]) ?? firstAt(hist, (e) => e.stage === "service" && e.label === label && e.note === "Started");
    if (done !== null && started !== null && done > started) serviceHours[k] = (done - started) / HOUR;
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
    stageHours, turnaroundDays: turnaroundDays !== null && turnaroundDays < 120 ? turnaroundDays : null,
    amount, revenueAt: updatedAt, shares, people, serviceHours,
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

const inside = (t, a, b) => t !== null && t >= a && t < b;

function periodSlice(derived, a, b) {
  const revenueJobs = derived.filter((j) => j.amount > 0 && inside(j.revenueAt, a, b));
  const revenue = revenueJobs.reduce((s, j) => s + j.amount, 0);
  const completed = derived.filter((j) => j.collected && inside(j.collectedAt, a, b));
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
    cur: cur.revenueJobs.filter((j) => inside(j.revenueAt, b.start, b.end)).reduce((s, j) => s + j.amount, 0),
    prevValue: b.prev ? prev.revenueJobs.filter((j) => inside(j.revenueAt, b.prev.start, b.prev.end)).reduce((s, j) => s + j.amount, 0) : null,
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
  const timedJobs = cur.completed.filter((j) => j.timed);
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
  const allCreated = derived.map((j) => j.createdAt).filter((t) => t !== null);
  const firstRecord = allCreated.length ? Math.min(...allCreated) : null;

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
  if (d < 1) return `${(d * 24).toFixed(1)} h`;
  return `${d.toFixed(1)} days`;
}

/* ------------------------------------------------------------ CSV */

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const n2 = (v) => (v === null || v === undefined ? "" : Math.round(v * 100) / 100);

// One flat sheet Excel opens directly (UTF-8 BOM so Arabic names survive).
export function reportCsv(report, { outstanding = null, dueBack = [], showRevenue = true, generatedAt = new Date() } = {}) {
  const k = report.kpi;
  const rows = [];
  rows.push(["Mr.CAP. Reports"]);
  rows.push(["Generated", generatedAt.toLocaleString("en-GB")]);
  rows.push(["Period", report.range.label]);
  rows.push(["Compared with", report.range.prevLabel]);
  rows.push([]);
  rows.push(["Headline", "This period", "Previous period"]);
  if (showRevenue) rows.push(["Revenue (AED)", n2(k.revenue.cur), n2(k.revenue.prev)]);
  rows.push(["Jobs completed", k.jobs.cur, k.jobs.prev]);
  if (showRevenue) rows.push(["Average ticket (AED)", n2(k.avgTicket.cur), n2(k.avgTicket.prev)]);
  rows.push(["Average turnaround (days)", n2(k.turnaround.cur), n2(k.turnaround.prev)]);
  if (outstanding) rows.push(["Outstanding on issued proformas (AED, all time)", n2(outstanding.amount), ""]);
  if (showRevenue) {
    rows.push([]);
    rows.push(["Revenue over time", "This period (AED)", "Previous period (AED)", "Previous period dates"]);
    report.buckets.forEach((b) => rows.push([b.full, n2(b.cur), b.prevValue === null ? "" : n2(b.prevValue), b.prev ? b.prev.full : ""]));
    rows.push([]);
    rows.push(["Revenue by service", "AED", "% of revenue"]);
    report.byCategory.forEach((c) => rows.push([c.label, n2(c.amount), n2(c.pct)]));
  }
  rows.push([]);
  rows.push(["Where time goes", "Average hours", "Median hours", "Jobs measured"]);
  report.stages.forEach((s) => rows.push([s.label + (report.bottleneck === s.key ? " (bottleneck)" : ""), n2(s.avgH), n2(s.medianH), s.n]));
  rows.push([`${report.pickup.label} (Ready -> Collected)`, n2(report.pickup.avgH), n2(report.pickup.medianH), report.pickup.n]);
  rows.push([]);
  rows.push(showRevenue ? ["Team", "Jobs completed", "Revenue attributed (AED)", "Avg service hours"] : ["Team", "Jobs completed", "Avg service hours"]);
  report.team.forEach((p) => rows.push(showRevenue ? [p.name, p.jobs, n2(p.revenue), n2(p.avgH)] : [p.name, p.jobs, n2(p.avgH)]));
  if (showRevenue && report.unassignedRevenue > 0.005) rows.push(["(not assigned)", "", n2(report.unassignedRevenue), ""]);
  rows.push([]);
  rows.push(["Smartech", "Value"]);
  rows.push(["Cars sent", report.smartech.cars]);
  rows.push(["Pieces", report.smartech.pieces]);
  rows.push(["Average turnaround (days)", n2(report.smartech.avgDays)]);
  rows.push(["Pending now", report.smartech.pending]);
  rows.push([]);
  rows.push(["Customers", "Count"]);
  rows.push(["Returning", report.customers.returning]);
  rows.push(["New", report.customers.fresh]);
  if (showRevenue) {
    rows.push([]);
    rows.push(["Top customers", "Plate", "Jobs", "Spend (AED)"]);
    report.customers.top.forEach((c) => rows.push([c.name, c.plate, c.jobs, n2(c.spend)]));
  }
  rows.push([]);
  rows.push(["Due back", "Reason", "Months since last visit", "Car", "Plate"]);
  dueBack.forEach((d) => rows.push([d.name, d.ruleLabel, d.months, d.makeModel, d.plate]));
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export const HOW_NUMBERS_WORK = [
  ["Revenue", "The invoice amount saved on each job (VAT included, after the job's discount, parts and fees included: the total the tax invoice prints). Only jobs with an amount above zero count, and each counts on the date the job was last updated. This is the same rule the Admin Dashboard uses. Jobs without an invoice amount yet add nothing."],
  ["Jobs completed", "Cars moved to Collected during the period (the moment of the Ready → Collected step)."],
  ["Average ticket", "Revenue divided by the number of jobs carrying revenue in the period."],
  ["Turnaround", "From the job card being opened to Collected, for cars collected in the period. Clock time, nights and days off included. Jobs imported from old records have no step times and are left out."],
  ["Compared with", "The same stretch of the previous period: 1–22 Sep against 1–22 Aug, Monday to Wednesday against the Monday to Wednesday before. A custom range is compared with the equally long stretch just before it."],
  ["Revenue by service", "Each job's amount is split across its services in proportion to the prices of the treatments picked; parts and fees follow the same split. A job with no priced treatments is split evenly across its services."],
  ["Where time goes", "Average clock hours between the recorded stage steps, for cars collected in the period whose every step was recorded."],
  ["Team", "Everyone assigned to a service (lead or team) is credited with the job, and that service's share of the revenue is split evenly between them. Average time is Started → Marked done on their service."],
  ["Smartech", "Jobs with Body Work or Dent & Paint. Cars sent = jobs opened in the period. Turnaround = Started → Marked done (or marked done/ready by Smartech). Pending = not done yet, right now."],
  ["Customers", "Everyone with a job opened in the period. Returning = had a job with us before the period; New = their first job on record is in it."],
  ["Outstanding", "Unpaid balance on issued proformas, all time, same as the Billing screen: cash and transfers count when recorded, cheques once cleared."],
];
