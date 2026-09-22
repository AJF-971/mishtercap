// Pure billing logic for proforma invoices — no React, no network, no PDF —
// so the numbers that end up on a customer's document can be tested on their
// own (verify/billing-test.mjs checks them against three real proformas).

export const VAT_RATE_DEFAULT = 0.05;

// Round to 2 decimals the way a calculator would. The epsilon stops values
// like 1.005 from rounding down because of floating-point representation.
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// A line is { desc, qty, uom, price, discType: "aed" | "pct", discValue }.
// `price` is the unit price excluding VAT. A discount is either a fixed AED
// amount off the whole line or a percentage — the shop's own proformas show
// AED discounts converted to a percentage (AED 200 off 700 prints 28.57).
export function computeLine(line, vatRate = VAT_RATE_DEFAULT) {
  const qty = num(line.qty) || 1;
  const price = num(line.price);
  const gross = r2(qty * price);
  const raw = line.discType === "pct" ? gross * (num(line.discValue) / 100) : num(line.discValue);
  const discount = r2(Math.min(Math.max(raw, 0), gross));
  const excl = r2(gross - discount);
  const vat = r2(excl * num(vatRate));
  return {
    qty, price, gross, discount,
    discountPct: gross > 0 ? (discount / gross) * 100 : 0,
    excl, vat, incl: r2(excl + vat),
  };
}

export function computeTotals(lines, vatRate = VAT_RATE_DEFAULT) {
  const rows = (lines || []).map((l) => ({ ...l, ...computeLine(l, vatRate) }));
  const sum = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
  return {
    rows,
    hasDiscount: rows.some((r) => r.discount > 0),
    totalDiscount: sum("discount"),
    subtotalExcl: sum("excl"),
    totalVat: sum("vat"),
    totalIncl: sum("incl"),
  };
}

export const fmtMoney = (n) =>
  num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 20 -> "20", 100 -> "100", 28.5714 -> "28.57", 0 -> "-" (as the shop's sheet shows)
export function fmtPct(p) {
  const v = r2(p);
  if (v === 0) return "-";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function chunkWords(n) {
  const parts = [];
  if (n >= 100) { parts.push(ONES[Math.floor(n / 100)], "hundred"); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)]); n %= 10; }
  if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

// "Three thousand two hundred fifty five AED ONLY" — the wording on the
// shop's proformas (sentence case, no "and", "AED ONLY" at the end). Fils,
// when there are any, are added as "and 50 fils" before "ONLY".
export function amountInWords(amount) {
  const total = Math.round(num(amount) * 100);
  const whole = Math.floor(total / 100);
  const fils = total % 100;
  let words;
  if (whole === 0) words = "zero";
  else {
    const scales = [[1000000000, "billion"], [1000000, "million"], [1000, "thousand"]];
    let rest = whole;
    const out = [];
    for (const [size, name] of scales) {
      if (rest >= size) { out.push(chunkWords(Math.floor(rest / size)), name); rest %= size; }
    }
    if (rest > 0) out.push(chunkWords(rest));
    words = out.join(" ");
  }
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  return fils ? `${sentence} AED and ${fils} fils ONLY` : `${sentence} AED ONLY`;
}

// ZBPI26-00000384: entity code + "PI" + two-digit year + 8-digit sequence —
// the same shape the shop's accounting system (First Bit) uses.
export function proformaNumber(entity, year, seq) {
  return `${entity}PI${String(year).slice(-2)}-${String(seq).padStart(8, "0")}`;
}
export function receiptNumber(year, seq) {
  return `RC${String(year).slice(-2)}-${String(seq).padStart(6, "0")}`;
}
// The counter key used with next_invoice_number(): "ZBPI", "ZHPI" or "RC".
export const proformaCounterKey = (entity) => `${entity}PI`;

export const PAYMENT_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "cheque", label: "Cheque" },
  { key: "transfer", label: "Bank transfer" },
];
export const CHEQUE_STATUSES = [
  { key: "received", label: "Received" },
  { key: "deposited", label: "Deposited" },
  { key: "cleared", label: "Cleared" },
  { key: "returned", label: "Returned" },
];

// What has actually been collected. Cash and bank transfers count the moment
// they are recorded. A cheque is not money until it clears, so received and
// deposited cheques are reported separately as "expected", and a returned
// cheque counts for nothing.
export function paymentSummary(totalIncl, payments) {
  let collected = 0;
  let pendingCheques = 0;
  let returnedCheques = 0;
  for (const p of payments || []) {
    const amount = num(p.amount);
    if (p.method === "cheque") {
      if (p.cheque_status === "cleared") collected += amount;
      else if (p.cheque_status === "returned") returnedCheques += amount;
      else pendingCheques += amount;
    } else {
      collected += amount;
    }
  }
  collected = r2(collected);
  const total = r2(totalIncl);
  const balance = r2(Math.max(total - collected, 0));
  let status = "unpaid";
  if (total > 0 && collected >= total - 0.005) status = "paid";
  else if (collected > 0) status = "part";
  return { collected, balance, status, pendingCheques: r2(pendingCheques), returnedCheques: r2(returnedCheques) };
}

// Builds proforma lines from the same rows the tax invoice uses
// (buildInvoiceLineItems in GarageApp.jsx). A job-level discount percentage
// carries over as a percentage on every line.
export function linesFromInvoiceRows(rows) {
  return (rows || []).map((r) => ({
    desc: r.desc,
    qty: r.qty || 1,
    uom: "Pcs",
    price: r2(r.price),
    discType: "pct",
    discValue: num(r.discount),
  }));
}

export function blankLine() {
  return { desc: "", qty: 1, uom: "Pcs", price: "", discType: "aed", discValue: "" };
}

// Fields that must be present before a number is issued. Returns a list of
// plain-English problems; empty means good to go.
export function issueProblems(p) {
  const problems = [];
  if (!String(p.bill_to?.name || "").trim()) problems.push("Add the client name.");
  const lines = (p.lines || []).filter((l) => String(l.desc || "").trim() || num(l.price));
  if (!lines.length) problems.push("Add at least one line.");
  if ((p.lines || []).some((l) => !String(l.desc || "").trim() && num(l.price))) problems.push("Every line needs a description.");
  if ((p.lines || []).some((l) => String(l.desc || "").trim() && !(num(l.price) > 0))) problems.push("Every line needs a price above zero.");
  return problems;
}

// ---- First Bit reconciliation export ---------------------------------------

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const RECONCILE_COLUMNS = [
  ["Type", "type"], ["Number", "number"], ["Date", "date"], ["Client", "client"], ["Client TRN", "trn"],
  ["Plate", "plate"], ["Total excl. VAT (AED)", "excl"], ["VAT (AED)", "vat"], ["Total incl. VAT (AED)", "incl"],
  ["Collected (AED)", "collected"], ["Payment", "payment"], ["Job / proforma ref", "ref"],
];

export function reconcileCsv(items) {
  const head = RECONCILE_COLUMNS.map((c) => csvCell(c[0])).join(",");
  const body = (items || []).map((it) => RECONCILE_COLUMNS.map((c) => csvCell(it[c[1]])).join(","));
  // BOM so Excel opens it as UTF-8 (client names can contain non-English text).
  return "﻿" + [head, ...body].join("\r\n");
}

export function formatLongDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
