/* ---------------- Reports dashboard ----------------
 * The owner-facing Reports screen: headline numbers against the previous
 * period, revenue over time and by service, where the time goes, the team
 * and Smartech, customers (returning/new, top spenders, due back) and the
 * old audit lists. All number-crunching lives in reportsData.js (pure, unit
 * tested); this file only fetches, lays out and exports.
 *
 * PROP CONTRACT (wired from GarageApp.jsx):
 *   session        the logged-in session ({ id, name, role }); only the name is used (PDF footer)
 *   team           team members array ({ id, name, ... }); maps assignee ids to names
 *   onBack()       back button (e.g. () => window.history.back()); button hidden when omitted
 *   onOpenJob(id)  open a job card (top customers, due-back rows, pending Smartech cars)
 *   canSeeBilling  hasPermission(session, team, "billing"); shows the Outstanding tile and is
 *                  the ONLY case in which gkGet is called (proformas / proforma_payments)
 *   canSeeRevenue  OPTIONAL, default true. Pass false to hide every AED figure (revenue, avg
 *                  ticket, revenue charts, team revenue, top customers' spend) for people who
 *                  have Reports but should not see money (the old Reports showed counts only).
 *   api            { sbFetch, gkGet } - GarageApp's own fetch helpers:
 *                    sbFetch(path) -> { ok, data, stale?, cachedAt? }   (anon REST read, cached offline)
 *                    gkGet(path)   -> { ok, data, error?, stale? }      (gatekeeper read, billing only)
 *   ui             { COLORS, DISPLAY_FONT, MONO_FONT, inputStyle } - theme tokens (fallbacks built in)
 *   catalog        { STAGES, getServices: () => SERVICES } - pipeline stages and live service catalog
 *
 * Reads (all GET):
 *   jobs?select=<narrow list, never photo/signature columns>&order=created_at.asc,id.asc&limit=1000&offset=N
 *   quotes?select=id,plate,make_model,customer_name,updated_at&status=eq.declined&order=updated_at.desc&limit=25  (same as old ReportsScreen)
 *   deletion_log?select=*&order=deleted_at.desc&limit=25                                                     (same as old ReportsScreen)
 *   gatekeeper: proformas?status=eq.issued&... and proforma_payments?...  (only when canSeeBilling)
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { jsPDF } from "jspdf";
import {
  ChevronLeft, FileText, FileSpreadsheet, ChevronDown, RefreshCw, MessageCircle, AlertTriangle, Hourglass, Info,
} from "lucide-react";
import {
  PERIODS, periodRange, deriveJob, computeReport, computeDueBack, computeOutstanding, delta, localDateKey,
  fmtAED, fmtCompact, fmtHours, fmtDays, reportCsv, HOW_NUMBERS_WORK, DUE_BACK_RULES, dueBackMessage, whatsappLink, DAY,
} from "./reportsData.js";

const JOB_COLUMNS = [
  "id", "customer_id", "plate", "make_model", "customer_name", "customer_phone",
  "service_types", "treatments", "treatment_prices", "smartech_pieces", "discount_percent",
  "assigned_to", "assigned_team", "service_started", "service_done", "stage_index",
  "invoice_amount", "history", "created_at", "updated_at",
  "smartech_flag", "smartech_status", "smartech_status_at", "smartech_started_at",
].join(",");
const PAGE = 1000; // PostgREST caps every response at 1000 rows server-side

const DEFAULT_STAGES = [
  { key: "intake", label: "Intake" }, { key: "parts_removal", label: "Parts Removal" }, { key: "service", label: "Service" },
  { key: "qc", label: "QC" }, { key: "ready", label: "Ready for Collection" }, { key: "collected", label: "Collected" },
];

async function fetchAllJobs(sbFetch) {
  let all = [];
  let stale = false, cachedAt = null;
  for (let offset = 0, guard = 0; guard < 100; guard++, offset += PAGE) {
    const res = await sbFetch(`jobs?select=${JOB_COLUMNS}&order=created_at.asc,id.asc&limit=${PAGE}&offset=${offset}`);
    if (!res || !res.ok) return { ok: false };
    if (res.stale) { stale = true; cachedAt = res.cachedAt || cachedAt; }
    const rows = Array.isArray(res.data) ? res.data : [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
  }
  return { ok: true, data: all, stale, cachedAt };
}

function theme(ui) {
  const C = (ui && ui.COLORS) || {};
  return {
    ink: C.ink || "#E9E4D4", dark: C.darkText || "#0D0C08", paper: C.paper || "#0A0A09", panel: C.panel || "#141311",
    panel2: C.panel2 || "#1C1A16", gold: C.gold || "#C9A227", goldBright: C.goldBright || "#E8C34A", line: C.line || "#2C2A24",
    muted: C.muted || "#8C8573",
    // chart series (validated on #141311: dataviz validate_palette, dark mode)
    cur: "#B08A18", curHover: "#C9A227", prev: "#3D8BD9", single: C.gold || "#C9A227", stage: "#6E6552",
    good: "#7FB08C", bad: "#E58A76", axis: "#3A3526",
    display: (ui && ui.DISPLAY_FONT) || "'Playfair Display', serif",
    mono: (ui && ui.MONO_FONT) || "'IBM Plex Mono', monospace",
  };
}

function css(t, kpiCount) {
  return `
.rpt-cq{container-type:inline-size;container-name:rpt;width:100%;min-width:0;box-sizing:border-box}
.rpt{box-sizing:border-box;width:100%;max-width:1400px;margin:0 auto;padding:4px 16px 48px;color:${t.ink};display:flex;flex-direction:column;gap:14px;--rpt-kpis:${kpiCount}}
.rpt *,.rpt *::before,.rpt *::after{box-sizing:border-box}
.rpt button,.rpt input,.rpt summary{font-family:inherit}
.rpt :focus-visible{outline:2px solid ${t.goldBright};outline-offset:2px}
.rpt-head{display:flex;flex-direction:column;gap:12px}
.rpt-titlebox{display:flex;align-items:center;gap:8px;min-width:0}
.rpt-h1{font-family:${t.display};font-size:28px;font-weight:700;margin:0;line-height:1.15;color:${t.ink}}
.rpt-period{font-size:13px;color:${t.muted};margin-top:3px}
.rpt-iconbtn{flex:none;width:44px;height:44px;border-radius:12px;border:1px solid ${t.line};background:${t.panel};color:${t.ink};display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.rpt-controls{display:flex;flex-direction:column;gap:10px;min-width:0}
.rpt-seg{position:relative;display:flex;padding:3px;border-radius:12px;background:${t.panel};border:1px solid ${t.line};gap:2px;min-width:0}
.rpt-seg>button{position:relative;z-index:1;flex:1 1 auto;min-height:44px;padding:0 6px;border:none;background:none;color:${t.muted};font-size:13px;border-radius:9px;cursor:pointer;white-space:nowrap}
.rpt-seg>button[aria-pressed="true"]{color:${t.dark};font-weight:700}
.rpt-thumb{position:absolute;top:3px;bottom:3px;border-radius:9px;background:${t.gold};transition:left .22s ease,width .22s ease;pointer-events:none}
.rpt-exports{display:flex;gap:8px}
.rpt-btn{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid ${t.line};background:${t.panel};color:${t.ink};font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;text-decoration:none;white-space:nowrap}
.rpt-btn:disabled{opacity:.5;cursor:default}
.rpt-btn-gold{background:${t.gold};border-color:${t.gold};color:${t.dark};font-weight:700}
.rpt-exports .rpt-btn{flex:1}
.rpt-custom{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:${t.panel};border:1px solid ${t.line};border-radius:14px;padding:12px}
.rpt-custom label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:${t.muted};flex:1 1 140px;min-width:0}
.rpt-custom input{min-height:44px;border-radius:10px;border:1px solid ${t.line};background:${t.panel2};color:${t.ink};padding:0 10px;font-size:14px;color-scheme:dark;width:100%}
.rpt-note{font-size:12.5px;color:${t.muted};background:${t.panel};border:1px solid ${t.line};border-radius:12px;padding:10px 12px;display:flex;gap:8px;align-items:flex-start}
.rpt-error{background:rgba(168,64,47,.15);border:1px solid #A8402F;border-radius:14px;padding:14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;color:#F0B4A6;font-size:13.5px}
.rpt-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rpt-kpi{background:${t.panel};border:1px solid ${t.line};border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.rpt-kpi-label{font-size:12px;color:${t.muted}}
.rpt-kpi-value{font-family:${t.mono};font-size:20px;font-weight:600;line-height:1.2;color:${t.ink};overflow-wrap:anywhere}
.rpt-kpi-delta{font-size:12px;line-height:1.35;color:${t.muted}}
.rpt-grid2,.rpt-grid3{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.rpt-card{background:${t.panel};border:1px solid ${t.line};border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.rpt-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px 12px;flex-wrap:wrap}
.rpt-card-head>div:first-child{flex:1 1 180px}
.rpt-card-head>button{flex:none}
.rpt-h2{margin:0;font-size:15px;font-weight:600;color:${t.ink};line-height:1.3}
.rpt-sub{font-size:12px;color:${t.muted};line-height:1.45}
.rpt-legend{display:flex;gap:14px;font-size:12px;color:${t.muted};flex-wrap:wrap}
.rpt-legend span{display:inline-flex;align-items:center;gap:6px}
.rpt-toggle{min-height:44px;padding:0 2px 0 10px;margin:-10px 0;border:none;background:none;color:${t.gold};font-size:12.5px;cursor:pointer;border-radius:8px;white-space:nowrap}
.rpt-empty{font-size:13px;color:${t.muted};padding:22px 8px;text-align:center;line-height:1.5}
.rpt-table{width:100%;border-collapse:collapse;font-size:13px}
.rpt-table th{font-size:11px;color:${t.muted};font-weight:500;letter-spacing:.5px;text-transform:uppercase;text-align:right;padding:6px 4px;border-bottom:1px solid ${t.line};white-space:nowrap}
.rpt-table td{padding:8px 4px;text-align:right;font-family:${t.mono};font-variant-numeric:tabular-nums;border-bottom:1px solid rgba(44,42,36,.7);color:${t.ink};white-space:nowrap}
.rpt-table th:first-child,.rpt-table td:first-child{text-align:left;white-space:normal;font-family:inherit}
.rpt-tablewrap{overflow-x:auto;max-width:100%}
.rpt-hbar{display:grid;grid-template-columns:minmax(78px,118px) minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px;min-height:28px}
.rpt-hbar-label{overflow-wrap:anywhere;line-height:1.25}
.rpt-hbar-val{font-family:${t.mono};text-align:right;font-variant-numeric:tabular-nums;line-height:1.2}
.rpt-hbar-val small{display:block;font-size:11px;color:${t.muted}}
.rpt-bar{height:10px;border-radius:0 4px 4px 0;min-width:2px}
.rpt-chip{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:${t.goldBright};border:1px solid #5A4A1A;background:#1F1A0C;border-radius:999px;padding:2px 7px;margin-left:6px;vertical-align:middle}
.rpt-smartech{padding:12px;border-radius:12px;background:${t.panel2};border:1px solid ${t.axis};display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.rpt-stat{display:flex;flex-direction:column;gap:2px;min-width:0}
.rpt-stat b{font-family:${t.mono};font-size:18px;font-weight:600;color:${t.ink}}
.rpt-stat span{font-size:11.5px;color:${t.muted}}
.rpt-list{display:flex;flex-direction:column}
.rpt-row{display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(44,42,36,.7);min-height:52px}
.rpt-row:last-child{border-bottom:none}
.rpt-rowbtn{flex:1;min-width:0;min-height:52px;display:flex;flex-direction:column;justify-content:center;gap:2px;text-align:left;border:none;background:none;color:${t.ink};padding:6px 0;cursor:pointer;font-size:13.5px}
.rpt-rowbtn:disabled{cursor:default}
.rpt-rowbtn small{font-size:12px;color:${t.muted};overflow-wrap:anywhere}
.rpt-wa{flex:none;min-height:44px;padding:0 14px;border-radius:10px;border:none;background:#25D366;color:#0D0C08;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.rpt-rules{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12px;color:${t.muted};line-height:1.45}
.rpt-rules b{color:${t.ink};font-weight:600}
.rpt-donut{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.rpt-details{background:${t.panel};border:1px solid ${t.line};border-radius:16px}
.rpt-details>summary{list-style:none;cursor:pointer;min-height:52px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;font-weight:600;color:${t.ink}}
.rpt-details>summary::-webkit-details-marker{display:none}
.rpt-details[open]>summary svg{transform:rotate(180deg)}
.rpt-details-body{padding:0 16px 16px;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.rpt-skel{background:linear-gradient(90deg,#1A1916 25%,#24221D 50%,#1A1916 75%);background-size:200% 100%;animation:rpt-sh 1.3s ease-in-out infinite;border-radius:8px}
.rpt-dim{opacity:.55;transition:opacity .2s}
.rpt-tip{position:absolute;top:0;z-index:5;pointer-events:none;background:#0F0E0C;border:1px solid ${t.axis};border-radius:10px;padding:8px 10px;font-size:12px;min-width:170px;box-shadow:0 10px 24px -10px rgba(0,0,0,.8)}
.rpt-tip-row{display:flex;align-items:center;gap:7px;margin-top:4px;color:${t.muted}}
.rpt-tip-row b{font-family:${t.mono};color:${t.ink};font-weight:600;margin-left:auto;padding-left:10px}
.rpt-foot dl{margin:0;display:grid;grid-template-columns:minmax(0,1fr);gap:8px 16px}
.rpt-foot dt{font-size:12.5px;font-weight:600;color:${t.ink}}
.rpt-foot dd{margin:0 0 6px;font-size:12.5px;color:${t.muted};line-height:1.5}
@keyframes rpt-sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion: reduce){.rpt-skel{animation:none}.rpt-thumb{transition:none}}
@container rpt (min-width:640px){.rpt-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.rpt-smartech{grid-template-columns:repeat(4,minmax(0,1fr))}}
@container rpt (min-width:760px){.rpt-grid3{grid-template-columns:repeat(2,minmax(0,1fr))}.rpt-details-body{grid-template-columns:repeat(2,minmax(0,1fr))}.rpt-foot dl{grid-template-columns:170px minmax(0,1fr)}.rpt-foot dd{margin:0}}
@container rpt (min-width:1000px){
  .rpt{padding:8px 32px 56px;gap:18px}
  .rpt-head{flex-direction:row;justify-content:space-between;align-items:flex-end;gap:16px}
  .rpt-controls{flex-direction:row;align-items:center}
  .rpt-seg>button{min-height:36px;padding:0 13px}
  .rpt-btn{min-height:40px}
  .rpt-exports .rpt-btn{flex:none}
  .rpt-h1{font-size:32px}
  .rpt-kpis{grid-template-columns:repeat(var(--rpt-kpis),minmax(0,1fr));gap:14px}
  .rpt-kpi{padding:18px}
  .rpt-kpi-value{font-size:25px}
  .rpt-grid2{grid-template-columns:minmax(0,1.65fr) minmax(0,1fr)}
  .rpt-grid3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rpt-card{padding:20px}
  .rpt-smartech{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rpt-toggle{min-height:32px}
  .rpt-duegrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}
  .rpt-duegrid .rpt-row:nth-last-child(2):nth-child(odd){border-bottom:none}
}
@container rpt (min-width:1240px){.rpt-smartech{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
}

/* ---------------- small helpers ---------------- */

function niceCeil(v) {
  if (!(v > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return [ref, width];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const shortDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeOf = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Skel({ h = 16, w = "100%", style }) {
  return <div className="rpt-skel" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

function Card({ title, sub, actions, children, className = "", label, testId }) {
  return (
    <section className={`rpt-card ${className}`} aria-label={label || title} data-testid={testId}>
      {(title || actions) && (
        <div className="rpt-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="rpt-h2">{title}</h2>}
            {sub && <div className="rpt-sub" style={{ marginTop: 3 }}>{sub}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

function TableToggle({ on, onToggle, what }) {
  return (
    <button type="button" className="rpt-toggle" aria-pressed={on} onClick={onToggle} aria-label={on ? `Show ${what} as a chart` : `View ${what} as a table`}>
      {on ? "View as chart" : "View as table"}
    </button>
  );
}

/* ---------------- period switch (sliding highlight) ---------------- */

function Segmented({ options, value, onChange, label }) {
  const trackRef = useRef(null);
  const btnRefs = useRef({});
  const [thumb, setThumb] = useState(null);
  const place = useCallback(() => {
    const el = btnRefs.current[value];
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  useLayoutEffect(() => { place(); }, [place, options.length]);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => place());
    ro.observe(el);
    return () => ro.disconnect();
  }, [place]);
  return (
    <div className="rpt-seg" ref={trackRef} role="group" aria-label={label}>
      {thumb && <div className="rpt-thumb" style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => (
        <button key={o.key} type="button" ref={(el) => { btnRefs.current[o.key] = el; }} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- KPI tile ---------------- */

function Kpi({ id, label, value, d, vs, sub, t, loading, valueColor, children }) {
  const color = !d || d.dir === "none" || d.dir === "flat" || d.good === null ? t.muted : d.good ? t.good : t.bad;
  return (
    <div className="rpt-kpi" data-kpi={id}>
      <span className="rpt-kpi-label">{label}</span>
      {loading ? <Skel h={26} w="70%" /> : <span className="rpt-kpi-value" data-kpi-value style={valueColor ? { color: valueColor } : undefined}>{value}</span>}
      {loading ? <Skel h={12} w="55%" /> : (
        <span className="rpt-kpi-delta">
          {d && d.text && <span style={{ color }} data-kpi-delta>{d.text}</span>}
          {d && d.text && d.dir !== "none" && <span> vs {vs || "previous"}</span>}
          {sub && <span style={{ display: "block", marginTop: 2 }}>{sub}</span>}
        </span>
      )}
      {children}
    </div>
  );
}

/* ---------------- revenue over time (bars + previous-period line) ---------------- */

const UNIT_WORD = { hour: "hour", day: "day", week: "week", month: "month" };

function RevenueChart({ report, t }) {
  const [wrapRef, measured] = useElementWidth();
  const [active, setActive] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const svgRef = useRef(null);
  const buckets = report.buckets;
  const unit = report.range.bucketUnit;
  const W = Math.max(260, measured || 640);
  const H = W < 520 ? 210 : 250;
  const padL = 46, padR = 10, padT = 24, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = Math.max(1, buckets.length);
  const maxV = Math.max(0, ...buckets.map((b) => b.cur), ...buckets.map((b) => b.prevValue || 0));
  // Clean ticks: a 1/2/2.5/5 x 10^n step, 2-5 gridlines, top = a whole step.
  const tickStep = niceCeil(maxV / 4);
  const tickCount = Math.max(1, Math.ceil(maxV / tickStep - 1e-9));
  const top = tickStep * tickCount;
  const slot = plotW / n;
  const barW = Math.max(2, Math.min(24, slot - Math.max(2, slot * 0.34)));
  const cx = (i) => padL + slot * (i + 0.5);
  const y = (v) => padT + plotH - (v / top) * plotH;
  const labelSpace = unit === "week" ? 52 : unit === "hour" ? 42 : unit === "month" ? 34 : 26;
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / labelSpace))));
  const maxIdx = buckets.reduce((m, b, i) => (b.cur > (buckets[m] ? buckets[m].cur : -1) ? i : m), 0);
  const hasAny = buckets.some((b) => b.cur > 0 || (b.prevValue || 0) > 0);
  const prevPts = buckets.map((b, i) => (b.prevValue === null ? null : [cx(i), y(b.prevValue)])).filter(Boolean);
  const total = buckets.reduce((s, b) => s + b.cur, 0);

  const pick = (clientX) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = (clientX - r.left) * (W / r.width);
    const i = Math.floor((x - padL) / slot);
    setActive(i >= 0 && i < buckets.length ? i : null);
  };
  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => {
        const base = a === null ? (e.key === "ArrowRight" ? -1 : buckets.length) : a;
        return Math.min(buckets.length - 1, Math.max(0, base + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setActive(null);
  };
  const barPath = (i, v) => {
    const h = Math.max(0, (v / top) * plotH);
    const x0 = cx(i) - barW / 2, y0 = padT + plotH - h, r = Math.min(4, barW / 2, h);
    if (h <= 0) return null;
    return `M${x0},${padT + plotH}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${padT + plotH}Z`;
  };
  const a = active !== null ? buckets[active] : null;
  const tipLeft = a ? Math.min(Math.max(0, cx(active) - 95), Math.max(0, W - 190)) : 0;

  return (
    <Card
      title={`Revenue by ${UNIT_WORD[unit]}, AED`}
      testId="revenue-chart"
      actions={<TableToggle on={asTable} onToggle={() => setAsTable((v) => !v)} what="revenue over time" />}
    >
      <div className="rpt-legend" aria-hidden={asTable}>
        <span><span style={{ width: 10, height: 10, borderRadius: 3, background: t.cur }} />This period</span>
        <span><span style={{ width: 16, height: 2, borderRadius: 1, background: t.prev }} />Previous period</span>
      </div>
      <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      {asTable ? (
        <div className="rpt-tablewrap">
          <table className="rpt-table">
            <thead><tr><th scope="col">{UNIT_WORD[unit]}</th><th scope="col">This period</th><th scope="col">Previous</th></tr></thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.i}><td>{b.full}</td><td>{fmtAED(b.cur)}</td><td>{b.prevValue === null ? "—" : fmtAED(b.prevValue)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !hasAny ? (
        <div className="rpt-empty">No revenue recorded in this period or the one before it.</div>
      ) : (
        <div style={{ position: "relative", width: "100%" }}>
          {a && (
            <div className="rpt-tip" style={{ left: tipLeft }} aria-hidden="true">
              <div style={{ color: t.ink, fontWeight: 600 }}>{a.full}</div>
              <div className="rpt-tip-row"><span style={{ width: 12, height: 2, background: t.cur }} />This period<b>{fmtAED(a.cur)}</b></div>
              <div className="rpt-tip-row"><span style={{ width: 12, height: 2, background: t.prev }} />{a.prev ? a.prev.full : "Previous"}<b>{a.prevValue === null ? "—" : fmtAED(a.prevValue)}</b></div>
            </div>
          )}
          <svg
            ref={svgRef}
            width={W} height={H} viewBox={`0 0 ${W} ${H}`}
            style={{ display: "block", width: "100%", height: "auto", touchAction: "pan-y", outline: "none" }}
            role="img" tabIndex={0}
            aria-label={`Revenue by ${UNIT_WORD[unit]} for ${report.range.label}, total ${fmtAED(total)}, compared with ${report.range.prevLabel}. Use left and right arrow keys to read each ${UNIT_WORD[unit]}, or View as table.`}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}
            onKeyDown={onKey}
            onFocus={() => setActive((v) => (v === null ? buckets.length - 1 : v))}
            onBlur={() => setActive(null)}
          >
            <g>
              {Array.from({ length: tickCount + 1 }, (_, k) => k).map((k) => {
                const v = tickStep * k, yy = Math.round(y(v)) + 0.5;
                return (
                  <g key={k}>
                    <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke={k === 0 ? t.axis : t.line} strokeWidth="1" />
                    <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize="11" fill={t.muted} style={{ fontFamily: t.mono, fontVariantNumeric: "tabular-nums" }}>{fmtCompact(v)}</text>
                  </g>
                );
              })}
            </g>
            {a && <rect x={cx(active) - slot / 2} y={padT} width={slot} height={plotH} fill="#FFFFFF" opacity="0.035" />}
            <g>
              {buckets.map((b, i) => {
                const d = barPath(i, b.cur);
                return d ? <path key={b.i} d={d} fill={active === i ? t.curHover : t.cur} /> : null;
              })}
            </g>
            {prevPts.length > 1 && (
              <polyline points={prevPts.map((p) => p.join(",")).join(" ")} fill="none" stroke={t.prev} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {prevPts.length > 0 && (() => {
              const idx = active !== null && buckets[active] && buckets[active].prevValue !== null ? active : null;
              const p = idx !== null ? [cx(idx), y(buckets[idx].prevValue)] : prevPts[prevPts.length - 1];
              return <circle cx={p[0]} cy={p[1]} r="4" fill={t.prev} stroke={t.panel} strokeWidth="2" />;
            })()}
            {buckets[maxIdx] && buckets[maxIdx].cur > 0 && (
              <text x={Math.min(Math.max(cx(maxIdx), padL + 14), W - padR - 14)} y={Math.max(12, y(buckets[maxIdx].cur) - 7)} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={t.ink} style={{ fontFamily: t.mono }}>
                {fmtCompact(buckets[maxIdx].cur)}
              </text>
            )}
            <g>
              {buckets.map((b, i) => (i % step === 0 ? (
                <text key={b.i} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={active === i ? t.ink : t.muted}>{b.label}</text>
              ) : null))}
            </g>
          </svg>
        </div>
      )}
      </div>
    </Card>
  );
}

/* ---------------- revenue by service ---------------- */

function CategoryBars({ report, t }) {
  const [asTable, setAsTable] = useState(false);
  const rows = report.byCategory;
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card title="Revenue by service" testId="revenue-by-service" actions={rows.length ? <TableToggle on={asTable} onToggle={() => setAsTable((v) => !v)} what="revenue by service" /> : null}>
      {!rows.length ? <div className="rpt-empty">No revenue in this period.</div> : asTable ? (
        <div className="rpt-tablewrap">
          <table className="rpt-table">
            <thead><tr><th scope="col">Service</th><th scope="col">AED</th><th scope="col">Share</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td>{Math.round(r.amount).toLocaleString("en-US")}</td><td>{r.pct.toFixed(1)}%</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} role="list">
          {rows.map((r) => (
            <div key={r.key} className="rpt-hbar" role="listitem" title={`${r.label}: ${fmtAED(r.amount)} (${r.pct.toFixed(1)}%)`}>
              <span className="rpt-hbar-label">{r.label}</span>
              <span style={{ display: "block", minWidth: 0 }}><span className="rpt-bar" style={{ display: "block", width: `${Math.max(1.5, (r.amount / max) * 100)}%`, background: t.single }} /></span>
              <span className="rpt-hbar-val">{Math.round(r.pct)}%<small>{fmtCompact(r.amount)}</small></span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- where time goes ---------------- */

function StageBars({ report, t, stages }) {
  const [asTable, setAsTable] = useState(false);
  const rows = report.stages;
  const pickup = report.pickup;
  const all = [...rows, pickup].filter((r) => r.avgH !== null);
  const max = Math.max(0.01, ...all.map((r) => r.avgH));
  const shortLabel = (r) => (r.key === "parts_removal" ? "Parts off" : r.label);
  const bn = rows.find((r) => r.key === report.bottleneck);
  const hasData = all.length > 0;
  const completed = report.kpi.jobs.cur;
  const row = (r, isPickup) => {
    const isBn = !isPickup && r.key === report.bottleneck;
    return (
      <div key={r.key + (isPickup ? "-p" : "")} className="rpt-hbar" role="listitem" title={r.avgH === null ? `${r.label}: no data` : `${r.label}: ${fmtHours(r.avgH)} average, ${fmtHours(r.medianH)} median, ${r.n} cars`}>
        <span className="rpt-hbar-label" style={isBn ? { color: t.goldBright, fontWeight: 600 } : undefined}>{isPickup ? "Waiting for pickup" : shortLabel(r)}</span>
        <span style={{ display: "block", minWidth: 0 }}>
          {r.avgH !== null && <span className="rpt-bar" style={{ display: "block", width: `${Math.max(1.5, (r.avgH / max) * 100)}%`, background: isBn ? t.goldBright : t.stage }} />}
        </span>
        <span className="rpt-hbar-val">{fmtHours(r.avgH)}</span>
      </div>
    );
  };
  return (
    <Card
      title="Where time goes"
      sub={hasData ? `Average clock hours per stage · ${report.timedJobs} ${report.timedJobs === 1 ? "car" : "cars"} collected` : "Average clock hours per stage"}
      testId="where-time-goes"
      actions={hasData ? <TableToggle on={asTable} onToggle={() => setAsTable((v) => !v)} what="time per stage" /> : null}
    >
      {!hasData ? (
        <div className="rpt-empty">{completed ? "No car collected in this period has every step recorded yet." : "No jobs completed in this period."}</div>
      ) : asTable ? (
        <div className="rpt-tablewrap">
          <table className="rpt-table">
            <thead><tr><th scope="col">Stage</th><th scope="col">Average</th><th scope="col">Median</th><th scope="col">Cars</th></tr></thead>
            <tbody>
              {[...rows, pickup].map((r) => (
                <tr key={r.key}><td>{r === pickup ? "Waiting for pickup (Ready → Collected)" : r.label}{r.key === report.bottleneck && r !== pickup ? " (bottleneck)" : ""}</td><td>{fmtHours(r.avgH)}</td><td>{fmtHours(r.medianH)}</td><td>{r.n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }} role="list">
            {rows.map((r) => row(r, false))}
            <div style={{ borderTop: `1px dashed ${t.line}`, margin: "2px 0" }} aria-hidden="true" />
            {row(pickup, true)}
          </div>
          <div className="rpt-sub" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Hourglass size={13} color={t.goldBright} style={{ flex: "none", marginTop: 2 }} aria-hidden="true" />
            <span>
              {bn ? <>Bottleneck: <b style={{ color: t.ink, fontWeight: 600 }}>{bn.label}</b> ({fmtHours(bn.avgH)} on average).</> : null}
              {pickup.avgH !== null ? <> Cars then wait {fmtHours(pickup.avgH)} for pickup after Ready.</> : null}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- team + Smartech ---------------- */

function TeamCard({ report, t, showRevenue, onOpenJob }) {
  const rows = report.team;
  const st = report.smartech;
  const [showPending, setShowPending] = useState(false);
  return (
    <Card title="Team" sub="Jobs completed and revenue credited this period" testId="team">
      {!rows.length ? <div className="rpt-empty">No jobs completed in this period.</div> : (
        <div className="rpt-tablewrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Jobs</th>
                {showRevenue && <th scope="col">Revenue</th>}
                <th scope="col" title="Average Started → Marked done on their service">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.jobs}</td>
                  {showRevenue && <td>{fmtCompact(p.revenue)}</td>}
                  <td>{p.avgH === null ? "—" : fmtHours(p.avgH)}</td>
                </tr>
              ))}
              {showRevenue && report.unassignedRevenue > 0.5 && (
                <tr><td style={{ color: t.muted }}>Not assigned</td><td /><td>{fmtCompact(report.unassignedRevenue)}</td><td /></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="rpt-smartech" data-testid="smartech">
        <div className="rpt-stat" style={{ gridColumn: "1 / -1" }}>
          <span style={{ fontSize: 11, color: t.gold, fontWeight: 700, letterSpacing: 0.6 }}>SMARTECH</span>
        </div>
        <div className="rpt-stat"><b>{st.cars}</b><span>{st.cars === 1 ? "car sent" : "cars sent"}</span></div>
        <div className="rpt-stat"><b>{st.pieces}</b><span>{st.pieces === 1 ? "piece" : "pieces"}</span></div>
        <div className="rpt-stat"><b>{st.avgDays === null ? "—" : `${st.avgDays.toFixed(1)}d`}</b><span title={st.timedN ? `Measured on ${st.timedN} ${st.timedN === 1 ? "car" : "cars"}` : undefined}>avg turnaround</span></div>
        <div className="rpt-stat">
          <b>{st.pending}</b>
          {st.pending > 0 ? (
            <button type="button" className="rpt-toggle" style={{ margin: "-12px 0 -12px -10px", textAlign: "left", fontSize: 11.5 }} aria-expanded={showPending} onClick={() => setShowPending((v) => !v)}>
              pending now {showPending ? "▴" : "▾"}
            </button>
          ) : <span>pending now</span>}
        </div>
      </div>
      {showPending && st.pendingJobs.length > 0 && (
        <div className="rpt-list" aria-label="Cars pending at Smartech">
          {st.pendingJobs.map((j) => (
            <div key={j.id} className="rpt-row">
              <button type="button" className="rpt-rowbtn" onClick={() => onOpenJob && onOpenJob(j.id)} disabled={!onOpenJob}>
                <span style={{ fontFamily: t.mono }}>{j.plate || "—"}</span>
                <small>{j.makeModel || "Car"} · since {j.since ? shortDate(j.since) : "—"}</small>
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- customers ---------------- */

function Donut({ a, b, t }) {
  const r = 48, C = 2 * Math.PI * r, total = a + b;
  const gap = a > 0 && b > 0 ? 3 : 0;
  const la = total ? (a / total) * C : 0;
  const lb = total ? (b / total) * C : 0;
  const pct = total ? Math.round((a / total) * 100) : 0;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${pct}% returning customers (${a}), ${100 - pct}% new (${b})`} style={{ flex: "none" }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke={t.panel2} strokeWidth="14" />
      {la > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke={t.cur} strokeWidth="14" strokeDasharray={`${Math.max(0, la - gap)} ${C}`} transform="rotate(-90 60 60)" />}
      {lb > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke={t.prev} strokeWidth="14" strokeDasharray={`${Math.max(0, lb - gap)} ${C}`} strokeDashoffset={-la} transform="rotate(-90 60 60)" />}
      <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="600" fill={t.ink} style={{ fontFamily: t.mono }}>{pct}%</text>
      <text x="60" y="76" textAnchor="middle" fontSize="10.5" fill={t.muted}>returning</text>
    </svg>
  );
}

function CustomersCard({ report, t, showRevenue, onOpenJob }) {
  const c = report.customers;
  const [asTable, setAsTable] = useState(false);
  const pct = (x) => (c.total ? Math.round((x / c.total) * 100) : 0);
  const recentRecords = c.firstRecord !== null && c.firstRecord > report.range.start - 365 * DAY;
  return (
    <Card
      title="Customers"
      sub={c.total ? `${c.total} ${c.total === 1 ? "customer" : "customers"} brought a car in this period` : undefined}
      testId="customers"
      actions={c.total ? <TableToggle on={asTable} onToggle={() => setAsTable((v) => !v)} what="returning and new customers" /> : null}
    >
      {!c.total ? <div className="rpt-empty">No new jobs opened in this period.</div> : asTable ? (
        <table className="rpt-table">
          <thead><tr><th scope="col">Customers</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
          <tbody>
            <tr><td>Returning</td><td>{c.returning}</td><td>{pct(c.returning)}%</td></tr>
            <tr><td>New</td><td>{c.fresh}</td><td>{pct(c.fresh)}%</td></tr>
          </tbody>
        </table>
      ) : (
        <div className="rpt-donut">
          <Donut a={c.returning} b={c.fresh} t={t} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: t.cur, flex: "none" }} />Returning · {c.returning} ({pct(c.returning)}%)</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: t.prev, flex: "none" }} />New · {c.fresh} ({pct(c.fresh)}%)</span>
          </div>
        </div>
      )}
      {recentRecords && c.total > 0 && (
        <div className="rpt-sub">Records begin {shortDate(c.firstRecord)}, so “returning” only counts visits since then.</div>
      )}
      {showRevenue && (
        <>
          <div className="rpt-sub" style={{ letterSpacing: 0.5, textTransform: "uppercase", fontSize: 11.5, marginTop: 2 }}>Top customers by spend</div>
          {!c.top.length ? <div className="rpt-sub">No invoiced jobs in this period.</div> : (
            <div className="rpt-list">
              {c.top.map((x) => (
                <div key={x.key} className="rpt-row">
                  <button type="button" className="rpt-rowbtn" onClick={() => onOpenJob && x.lastJobId && onOpenJob(x.lastJobId)} disabled={!onOpenJob} aria-label={`Open latest job for ${x.name}`}>
                    <span style={{ overflowWrap: "anywhere" }}>{x.name}</span>
                    <small>{x.plate ? <span style={{ fontFamily: t.mono }}>{x.plate}</span> : null}{x.plate ? " · " : ""}{x.jobs} {x.jobs === 1 ? "job" : "jobs"}</small>
                  </button>
                  <span style={{ fontFamily: t.mono, fontSize: 13, flex: "none" }}>{fmtAED(x.spend)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function DueBackCard({ items, t, onOpenJob, firstRecord }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <Card
      title="Due back"
      sub="Customers to invite back, counted from their latest visit. Anyone who has visited since is not listed."
      testId="due-back"
    >
      <ul className="rpt-rules" aria-label="Due-back rules">
        {DUE_BACK_RULES.map((r) => <li key={r.key}><b>{r.label}</b>: {r.rule}</li>)}
      </ul>
      {!items.length ? (
        <div className="rpt-empty">
          Nobody is due back yet.{firstRecord ? ` Records begin ${shortDate(firstRecord)}; the first reminders appear 6 months after a detailing job.` : ""}
        </div>
      ) : (
        <>
          <div className="rpt-list rpt-duegrid">
            {shown.map((d) => {
              const href = whatsappLink(d.phone, dueBackMessage(d));
              return (
                <div key={d.key} className="rpt-row">
                  <button type="button" className="rpt-rowbtn" onClick={() => onOpenJob && onOpenJob(d.lastJobId)} disabled={!onOpenJob} aria-label={`Open latest job for ${d.name}`}>
                    <span style={{ overflowWrap: "anywhere" }}>{d.name}{d.plate ? <span style={{ fontFamily: t.mono, color: t.muted, fontSize: 12.5 }}> · {d.plate}</span> : null}</span>
                    <small>{d.ruleLabel} · last visit {d.months} months ago{d.service ? ` (${d.service})` : ""}</small>
                  </button>
                  {href ? (
                    <a className="rpt-wa" href={href} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${d.name}`}>
                      <MessageCircle size={15} aria-hidden="true" />WhatsApp
                    </a>
                  ) : <span className="rpt-sub" style={{ flex: "none" }}>No phone</span>}
                </div>
              );
            })}
          </div>
          {items.length > 8 && (
            <button type="button" className="rpt-btn" style={{ alignSelf: "flex-start" }} onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/* ---------------- audit (same queries as the old ReportsScreen) ---------------- */

function AuditSection({ audit, t }) {
  const n = audit.quotes.length + audit.deleted.length;
  const day = (v) => new Date(v).toLocaleDateString([], { month: "short", day: "numeric" });
  const Row = ({ label, sub }) => (
    <div className="rpt-row" style={{ minHeight: 48 }}>
      <div style={{ padding: "7px 0", minWidth: 0 }}>
        <div style={{ fontSize: 13, color: t.ink, overflowWrap: "anywhere" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: t.muted, marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <details className="rpt-details" data-testid="audit">
      <summary>
        <span>Audit: cancelled quotes and deleted jobs{audit.loading ? "" : ` (${n})`}</span>
        <ChevronDown size={18} color={t.muted} aria-hidden="true" />
      </summary>
      <div className="rpt-details-body">
        <div>
          <h3 className="rpt-h2" style={{ fontSize: 14, marginBottom: 4 }}>Cancelled quotes</h3>
          {audit.loading ? <Skel h={40} /> : audit.quotesError ? <div className="rpt-sub">Couldn't load cancelled quotes.</div> : !audit.quotes.length ? <div className="rpt-sub">No data yet.</div> : (
            <div className="rpt-list">
              {audit.quotes.map((q) => (
                <Row key={q.id} label={`${q.plate || "—"} · ${q.customer_name || "Unknown"}`} sub={`${q.make_model || ""}${q.make_model ? " · " : ""}declined ${day(q.updated_at)}`} />
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="rpt-h2" style={{ fontSize: 14, marginBottom: 4 }}>Deleted jobs</h3>
          {audit.loading ? <Skel h={40} /> : audit.deletedError ? <div className="rpt-sub">Couldn't load deleted jobs.</div> : !audit.deleted.length ? <div className="rpt-sub">No data yet.</div> : (
            <div className="rpt-list">
              {audit.deleted.map((d) => (
                <Row key={d.id} label={`${d.plate || "—"} · ${d.customer_name || "Unknown"}`} sub={`deleted by ${d.deleted_by || "unknown"} · ${day(d.deleted_at)}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

/* ---------------- PDF ---------------- */

const pdfText = (s) => String(s ?? "")
  .replace(/[–—]/g, "-").replace(/→/g, "->").replace(/▲/g, "+").replace(/▼/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function signedPct(cur, prev) {
  if (cur === null || prev === null || prev === undefined || cur === undefined || prev === 0) return "n/a";
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

function exportPdf({ report, outstanding, dueBack, showRevenue, session }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight();
  const M = 40;
  const GOLD = [201, 162, 39], INK = [24, 23, 20], GREY = [110, 104, 90], RULE = [215, 208, 190];
  let y = 0;

  const header = (first) => {
    doc.setFillColor(10, 10, 9); doc.rect(0, 0, W, first ? 92 : 40, "F");
    doc.setFillColor(...GOLD); doc.rect(0, first ? 92 : 40, W, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setTextColor(...GOLD);
    if (first) {
      doc.setFontSize(22); doc.text("Mr.CAP.", M, 42);
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(170, 162, 140);
      doc.text("THE CAR APPEARANCE & RESTYLING EXPERTS", M, 56);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(233, 228, 212);
      doc.text("Reports", W - M, 40, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(200, 192, 170);
      doc.text(pdfText(report.range.label), W - M, 56, { align: "right" });
      doc.text(pdfText(`Compared with ${report.range.prevLabel}`), W - M, 69, { align: "right" });
      y = 122;
    } else {
      doc.setFontSize(12); doc.text("Mr.CAP.", M, 26);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(200, 192, 170);
      doc.text(pdfText(`Reports - ${report.range.label}`), W - M, 26, { align: "right" });
      y = 66;
    }
  };
  const ensure = (h) => { if (y + h > Hh - 50) { doc.addPage(); header(false); } };
  const section = (title) => {
    ensure(60);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...INK);
    doc.text(pdfText(title), M, y);
    doc.setFillColor(...GOLD); doc.rect(M, y + 5, 28, 2, "F");
    y += 20;
  };
  // cols: [{ label, w (fraction), align }]
  const table = (cols, rows) => {
    const tw = W - 2 * M;
    const xs = []; let acc = M;
    cols.forEach((c) => { xs.push(acc); acc += c.w * tw; });
    const drawHead = () => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...GREY);
      cols.forEach((c, i) => {
        const x = c.align === "right" ? xs[i] + c.w * tw - 4 : xs[i];
        doc.text(pdfText(c.label.toUpperCase()), x, y, { align: c.align === "right" ? "right" : "left" });
      });
      y += 6; doc.setDrawColor(...RULE); doc.line(M, y, W - M, y); y += 13;
    };
    ensure(40); drawHead();
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    if (!rows.length) { doc.setTextColor(...GREY); doc.text("No data for this period.", M, y); y += 18; return; }
    rows.forEach((r) => {
      if (y > Hh - 60) { doc.addPage(); header(false); drawHead(); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); }
      doc.setTextColor(...INK);
      cols.forEach((c, i) => {
        const txt = pdfText(r[i]);
        const maxW = c.w * tw - 8;
        const fitted = doc.getTextWidth(txt) > maxW ? doc.splitTextToSize(txt, maxW)[0] : txt;
        const x = c.align === "right" ? xs[i] + c.w * tw - 4 : xs[i];
        doc.text(fitted, x, y, { align: c.align === "right" ? "right" : "left" });
      });
      y += 5; doc.setDrawColor(236, 232, 222); doc.line(M, y, W - M, y); y += 11;
    });
    y += 12;
  };
  const R = "right";
  const k = report.kpi;
  const aed = (v) => (v === null || v === undefined ? "-" : fmtAED(v));
  const days = (v) => (v === null || v === undefined ? "-" : `${v.toFixed(1)} days`);

  header(true);
  section("Headline numbers");
  const head = [];
  if (showRevenue) head.push(["Revenue", aed(k.revenue.cur), aed(k.revenue.prev), signedPct(k.revenue.cur, k.revenue.prev)]);
  head.push(["Jobs completed", String(k.jobs.cur), String(k.jobs.prev), `${k.jobs.cur - k.jobs.prev > 0 ? "+" : ""}${k.jobs.cur - k.jobs.prev}`]);
  if (showRevenue) head.push(["Average ticket", aed(k.avgTicket.cur), aed(k.avgTicket.prev), signedPct(k.avgTicket.cur, k.avgTicket.prev)]);
  head.push(["Average turnaround", days(k.turnaround.cur), days(k.turnaround.prev), k.turnaround.cur !== null && k.turnaround.prev !== null ? `${k.turnaround.cur - k.turnaround.prev > 0 ? "+" : ""}${(k.turnaround.cur - k.turnaround.prev).toFixed(1)} days` : "n/a"]);
  if (outstanding) head.push(["Outstanding (issued proformas, all time)", aed(outstanding.amount), "", `${outstanding.count} unpaid`]);
  table([{ label: "Metric", w: 0.4 }, { label: "This period", w: 0.2, align: R }, { label: "Previous", w: 0.2, align: R }, { label: "Change", w: 0.2, align: R }], head);

  if (showRevenue) {
    section(`Revenue by ${UNIT_WORD[report.range.bucketUnit]}`);
    table(
      [{ label: UNIT_WORD[report.range.bucketUnit], w: 0.34 }, { label: "This period", w: 0.22, align: R }, { label: "Previous", w: 0.22, align: R }, { label: "Previous dates", w: 0.22, align: R }],
      report.buckets.map((b) => [b.full, aed(b.cur), b.prevValue === null ? "-" : aed(b.prevValue), b.prev ? b.prev.full : "-"]),
    );
    section("Revenue by service");
    table([{ label: "Service", w: 0.5 }, { label: "AED", w: 0.25, align: R }, { label: "Share", w: 0.25, align: R }],
      report.byCategory.map((c) => [c.label, aed(c.amount), `${c.pct.toFixed(1)}%`]));
  }
  section("Where time goes (average clock hours per stage)");
  table([{ label: "Stage", w: 0.46 }, { label: "Average", w: 0.18, align: R }, { label: "Median", w: 0.18, align: R }, { label: "Cars", w: 0.18, align: R }],
    [...report.stages.map((s) => [`${s.label}${report.bottleneck === s.key ? " (bottleneck)" : ""}`, fmtHours(s.avgH), fmtHours(s.medianH), String(s.n)]),
      ["Waiting for pickup (Ready -> Collected)", fmtHours(report.pickup.avgH), fmtHours(report.pickup.medianH), String(report.pickup.n)]]);
  section("Team");
  const teamCols = showRevenue
    ? [{ label: "Name", w: 0.4 }, { label: "Jobs", w: 0.18, align: R }, { label: "Revenue", w: 0.24, align: R }, { label: "Avg time", w: 0.18, align: R }]
    : [{ label: "Name", w: 0.5 }, { label: "Jobs", w: 0.25, align: R }, { label: "Avg time", w: 0.25, align: R }];
  const teamRows = report.team.map((p) => (showRevenue ? [p.name, String(p.jobs), aed(p.revenue), p.avgH === null ? "-" : fmtHours(p.avgH)] : [p.name, String(p.jobs), p.avgH === null ? "-" : fmtHours(p.avgH)]));
  if (showRevenue && report.unassignedRevenue > 0.5) teamRows.push(["Not assigned", "", aed(report.unassignedRevenue), ""]);
  table(teamCols, teamRows);
  section("Smartech");
  table([{ label: "Measure", w: 0.6 }, { label: "Value", w: 0.4, align: R }], [
    ["Cars sent", String(report.smartech.cars)], ["Pieces", String(report.smartech.pieces)],
    ["Average turnaround", report.smartech.avgDays === null ? "-" : `${report.smartech.avgDays.toFixed(1)} days`], ["Pending now", String(report.smartech.pending)],
  ]);
  section("Customers");
  const c = report.customers;
  table([{ label: "Customers", w: 0.6 }, { label: "Count", w: 0.2, align: R }, { label: "Share", w: 0.2, align: R }], [
    ["Returning", String(c.returning), c.total ? `${Math.round((c.returning / c.total) * 100)}%` : "-"],
    ["New", String(c.fresh), c.total ? `${Math.round((c.fresh / c.total) * 100)}%` : "-"],
  ]);
  if (showRevenue) {
    section("Top customers by spend");
    table([{ label: "Customer", w: 0.42 }, { label: "Plate", w: 0.22 }, { label: "Jobs", w: 0.12, align: R }, { label: "Spend", w: 0.24, align: R }],
      c.top.map((x) => [x.name, x.plate || "-", String(x.jobs), aed(x.spend)]));
  }
  section("Due back");
  table([{ label: "Customer", w: 0.3 }, { label: "Reason", w: 0.26 }, { label: "Car", w: 0.28 }, { label: "Months", w: 0.16, align: R }],
    dueBack.map((d) => [d.name, d.ruleLabel, [d.makeModel, d.plate].filter(Boolean).join(" "), String(d.months)]));

  section("How these numbers work");
  doc.setFontSize(8.5);
  HOW_NUMBERS_WORK.forEach(([term, text]) => {
    const lines = doc.splitTextToSize(pdfText(text), W - 2 * M - 110);
    ensure(lines.length * 11 + 6);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...INK); doc.text(pdfText(term), M, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...GREY); doc.text(lines, M + 110, y);
    y += lines.length * 11 + 6;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(150, 143, 125);
    doc.text(pdfText(`Mr.CAP. internal report - generated ${new Date().toLocaleString("en-GB")}${session && session.name ? ` by ${session.name}` : ""} - not for customer distribution`), M, Hh - 22);
    doc.text(`${p} / ${pages}`, W - M, Hh - 22, { align: "right" });
  }
  const r = report.range;
  doc.save(`MrCAP-Reports-${localDateKey(new Date(r.start))}-to-${localDateKey(new Date(r.end - 1))}.pdf`);
}

/* ---------------- main screen ---------------- */

export default function ReportsDashboard({
  session, team = [], onBack, onOpenJob, canSeeBilling = false, canSeeRevenue = true, api = {}, ui = {}, catalog = {},
}) {
  const t = theme(ui);
  const stages = (catalog && Array.isArray(catalog.STAGES) && catalog.STAGES.length >= 3) ? catalog.STAGES : DEFAULT_STAGES;
  const services = (catalog && typeof catalog.getServices === "function" && catalog.getServices()) || [];
  const sbFetch = api.sbFetch, gkGet = api.gkGet;

  const [periodKey, setPeriodKey] = useState("month");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [custom, setCustom] = useState(() => ({ from: localDateKey(new Date(Date.now() - 29 * DAY)), to: localDateKey(new Date()) }));
  const [draft, setDraft] = useState(custom);
  const [jobsState, setJobsState] = useState({ status: "loading", rows: [], stale: false, cachedAt: null });
  const [billing, setBilling] = useState({ status: canSeeBilling ? "loading" : "off", amount: 0, count: 0 });
  const [audit, setAudit] = useState({ loading: true, quotes: [], deleted: [], quotesError: false, deletedError: false });
  const [busy, setBusy] = useState("");

  const loadJobs = useCallback(async () => {
    setJobsState((s) => ({ ...s, status: s.rows.length ? "refreshing" : "loading" }));
    const res = sbFetch ? await fetchAllJobs(sbFetch) : { ok: false };
    if (!res.ok) { setJobsState((s) => ({ ...s, status: "error" })); return; }
    setNowMs(Date.now());
    setJobsState({ status: "ready", rows: res.data, stale: res.stale, cachedAt: res.cachedAt });
  }, [sbFetch]);

  const loadBilling = useCallback(async () => {
    if (!canSeeBilling || !gkGet) { setBilling({ status: "off", amount: 0, count: 0 }); return; }
    setBilling((b) => ({ ...b, status: "loading" }));
    const [pf, pay] = await Promise.all([
      gkGet("proformas?status=eq.issued&select=id,number,status,lines,vat_rate,totals,issued_at&order=issued_at.asc&limit=1000"),
      gkGet("proforma_payments?select=proforma_id,method,amount,cheque_status&limit=3000"),
    ]);
    if (!pf || !pf.ok || !pay || !pay.ok) { setBilling({ status: "error", amount: 0, count: 0 }); return; }
    const o = computeOutstanding(pf.data || [], pay.data || []);
    setBilling({ status: "ready", ...o, stale: !!(pf.stale || pay.stale) });
  }, [canSeeBilling, gkGet]);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { loadBilling(); }, [loadBilling]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!sbFetch) return;
      const [q, dj] = await Promise.all([
        sbFetch("quotes?select=id,plate,make_model,customer_name,updated_at&status=eq.declined&order=updated_at.desc&limit=25"),
        sbFetch("deletion_log?select=*&order=deleted_at.desc&limit=25"),
      ]);
      if (!alive) return;
      setAudit({
        loading: false,
        quotes: q && q.ok ? q.data || [] : [], deleted: dj && dj.ok ? dj.data || [] : [],
        quotesError: !(q && q.ok), deletedError: !(dj && dj.ok),
      });
    })();
    return () => { alive = false; };
  }, [sbFetch]);

  const derived = useMemo(() => jobsState.rows.map((r) => deriveJob(r, { stages, services })), [jobsState.rows, stages, services]);
  const range = useMemo(() => periodRange(periodKey, nowMs, custom), [periodKey, nowMs, custom]);
  const report = useMemo(() => computeReport(derived, range, { team, services, stages, now: nowMs }), [derived, range, team, services, stages, nowMs]);
  const dueBack = useMemo(() => computeDueBack(derived, nowMs), [derived, nowMs]);

  const choosePeriod = (key) => { setPeriodKey(key); setNowMs(Date.now()); };
  const applyCustom = () => {
    if (!draft.from || !draft.to) return;
    const from = draft.from <= draft.to ? draft.from : draft.to;
    const to = draft.from <= draft.to ? draft.to : draft.from;
    setCustom({ from, to }); setDraft({ from, to }); setNowMs(Date.now());
  };

  const ready = jobsState.status === "ready" || jobsState.status === "refreshing";
  const loading = jobsState.status === "loading";
  const showOutstanding = canSeeBilling && billing.status !== "off";
  const kpiCount = (canSeeRevenue ? 4 : 2) + (showOutstanding ? 1 : 0);
  const outstandingForExport = showOutstanding && billing.status === "ready" ? { amount: billing.amount, count: billing.count } : null;

  const doCsv = () => {
    const csv = reportCsv(report, { outstanding: outstandingForExport, dueBack, showRevenue: canSeeRevenue });
    const r = report.range;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `MrCAP-Reports-${localDateKey(new Date(r.start))}-to-${localDateKey(new Date(r.end - 1))}.csv`);
  };
  const doPdf = async () => {
    setBusy("pdf");
    try { exportPdf({ report, outstanding: outstandingForExport, dueBack, showRevenue: canSeeRevenue, session }); }
    finally { setBusy(""); }
  };

  const k = report.kpi;
  const dRevenue = delta(k.revenue.cur, k.revenue.prev, { kind: "pct" });
  const dJobs = delta(k.jobs.cur, k.jobs.prev, { kind: "count", unit: Math.abs(k.jobs.cur - k.jobs.prev) === 1 ? "job" : "jobs" });
  const dTicket = delta(k.avgTicket.cur, k.avgTicket.prev, { kind: "pct" });
  const dTat = delta(k.turnaround.cur, k.turnaround.prev, { kind: "days", goodWhen: "down" });
  const noPrev = (d) => (d.dir === "none" && d.text ? { ...d, text: "Nothing to compare with" } : d);

  return (
    // Layout follows the width Reports is GIVEN (container queries), not the
    // window: inside the app's narrow phone-style column it stays one column
    // even on a desktop monitor, and it spreads into the grid once the shell
    // gives it room.
    <div className="rpt-cq mrcap-view" data-testid="reports-dashboard">
      <style>{css(t, kpiCount)}</style>
      <div className="rpt">

      <header className="rpt-head">
        <div className="rpt-titlebox">
          {onBack && (
            <button type="button" className="rpt-iconbtn" onClick={onBack} aria-label="Back">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="rpt-h1">Reports</h1>
            <div className="rpt-period" data-testid="period-label">
              {range.label} <span aria-hidden="true">·</span> compared with {range.prevLabel}
            </div>
          </div>
        </div>
        <div className="rpt-controls">
          <Segmented options={PERIODS} value={periodKey} onChange={choosePeriod} label="Report period" />
          <div className="rpt-exports">
            <button type="button" className="rpt-btn" onClick={doPdf} disabled={!ready || busy === "pdf"}>
              <FileText size={15} aria-hidden="true" />{busy === "pdf" ? "Preparing…" : "Export PDF"}
            </button>
            <button type="button" className="rpt-btn" onClick={doCsv} disabled={!ready} aria-label="Excel (download CSV)">
              <FileSpreadsheet size={15} aria-hidden="true" />Excel
            </button>
          </div>
        </div>
      </header>

      {periodKey === "custom" && (
        <form className="rpt-custom" onSubmit={(e) => { e.preventDefault(); applyCustom(); }} aria-label="Custom date range">
          <label>From<input type="date" value={draft.from} max={localDateKey(new Date())} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} required /></label>
          <label>To<input type="date" value={draft.to} max={localDateKey(new Date())} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} required /></label>
          <button type="submit" className="rpt-btn rpt-btn-gold" disabled={!draft.from || !draft.to || (draft.from === custom.from && draft.to === custom.to)}>Apply</button>
        </form>
      )}

      {jobsState.stale && ready && (
        <div className="rpt-note" role="status"><Info size={15} style={{ flex: "none", marginTop: 1 }} aria-hidden="true" />Offline: showing the figures saved{jobsState.cachedAt ? ` at ${timeOf(jobsState.cachedAt)}` : " earlier"}. They will refresh when you are back online.</div>
      )}

      {jobsState.status === "error" && (
        <div className="rpt-error" role="alert">
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={16} aria-hidden="true" />Couldn't load the job records for Reports.</span>
          <button type="button" className="rpt-btn" onClick={loadJobs}><RefreshCw size={14} aria-hidden="true" />Retry</button>
        </div>
      )}

      {jobsState.status !== "error" && (
        <div className={jobsState.status === "refreshing" ? "rpt-dim" : undefined} style={{ display: "flex", flexDirection: "column", gap: "inherit" }} aria-busy={loading}>
          <section className="rpt-kpis" aria-label="Headline numbers" style={{ marginBottom: 0 }}>
            {canSeeRevenue && <Kpi id="revenue" t={t} loading={loading} label="Revenue" value={fmtAED(k.revenue.cur)} d={noPrev(dRevenue)} vs={fmtAED(k.revenue.prev)} />}
            <Kpi id="jobs" t={t} loading={loading} label="Jobs completed" value={String(k.jobs.cur)} d={noPrev(dJobs)} vs={String(k.jobs.prev)} />
            {canSeeRevenue && <Kpi id="ticket" t={t} loading={loading} label="Average ticket" value={k.avgTicket.cur === null ? "—" : fmtAED(k.avgTicket.cur)} d={noPrev(dTicket)} vs={k.avgTicket.prev === null ? undefined : fmtAED(k.avgTicket.prev)} sub={k.avgTicket.n ? `${k.avgTicket.n} invoiced ${k.avgTicket.n === 1 ? "job" : "jobs"}` : "No invoiced jobs"} />}
            <Kpi id="turnaround" t={t} loading={loading} label="Avg turnaround" value={fmtDays(k.turnaround.cur)} d={noPrev(dTat)} vs={k.turnaround.prev === null ? undefined : fmtDays(k.turnaround.prev)} sub={k.turnaround.n ? `Intake → collected · ${k.turnaround.n} ${k.turnaround.n === 1 ? "car" : "cars"}` : "Intake → collected"} />
            {showOutstanding && (
              <Kpi
                id="outstanding" t={t} loading={billing.status === "loading"} label="Outstanding"
                value={billing.status === "error" ? "—" : fmtAED(billing.amount)} valueColor={billing.status === "ready" && billing.amount > 0 ? t.gold : undefined}
                sub={billing.status === "error" ? null : `${billing.count} unpaid ${billing.count === 1 ? "proforma" : "proformas"} · all time`}
              >
                {billing.status === "error" && (
                  <button type="button" className="rpt-toggle" style={{ margin: "-8px 0 -12px -10px", alignSelf: "flex-start" }} onClick={loadBilling}>Couldn't load. Retry</button>
                )}
              </Kpi>
            )}
          </section>

          {loading ? (
            <>
              <div className="rpt-grid2">
                <div className="rpt-card"><Skel h={16} w="45%" /><Skel h={200} /></div>
                <div className="rpt-card"><Skel h={16} w="55%" />{[0, 1, 2, 3, 4].map((i) => <Skel key={i} h={14} />)}</div>
              </div>
              <div className="rpt-grid3">
                {[0, 1, 2].map((i) => <div key={i} className="rpt-card"><Skel h={16} w="50%" /><Skel h={120} /></div>)}
              </div>
            </>
          ) : (
            <>
              {canSeeRevenue && (
                <div className="rpt-grid2">
                  <RevenueChart report={report} t={t} />
                  <CategoryBars report={report} t={t} />
                </div>
              )}
              <div className="rpt-grid3">
                <StageBars report={report} t={t} stages={stages} />
                <TeamCard report={report} t={t} showRevenue={canSeeRevenue} onOpenJob={onOpenJob} />
                <CustomersCard report={report} t={t} showRevenue={canSeeRevenue} onOpenJob={onOpenJob} />
              </div>
              <DueBackCard items={dueBack} t={t} onOpenJob={onOpenJob} firstRecord={report.customers.firstRecord} />
            </>
          )}
        </div>
      )}

      <AuditSection audit={audit} t={t} />

      <details className="rpt-details rpt-foot">
        <summary><span>How these numbers work</span><ChevronDown size={18} color={t.muted} aria-hidden="true" /></summary>
        <div style={{ padding: "0 16px 16px" }}>
          <dl>
            {HOW_NUMBERS_WORK.filter(([term]) => canSeeRevenue || !/Revenue|Average ticket/.test(term)).filter(([term]) => showOutstanding || term !== "Outstanding").map(([term, text]) => (
              <React.Fragment key={term}><dt>{term}</dt><dd>{text}</dd></React.Fragment>
            ))}
          </dl>
        </div>
      </details>
      </div>
    </div>
  );
}
