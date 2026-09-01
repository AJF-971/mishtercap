// Monthly database backup — runs automatically on Netlify's schedule (see
// `config` at the bottom), needs no button press, no manual step.
//
// What it does:
//   1. Pulls every row from every table in the Supabase database, using
//      the SERVICE ROLE key — a powerful key that must NEVER be put in the
//      app's client code (unlike the anon key, which is already public).
//      It only lives here, as a Netlify environment variable, so it never
//      reaches a browser and can't be stolen off the website.
//   2. Builds one Excel workbook with one sheet per table.
//   3. Emails that workbook as an attachment to whoever you configure.
//
// ---- One-time setup (do this in the Netlify dashboard, Site settings ->
// Environment variables) ----
//   SUPABASE_URL              = https://naweqyzfrxhmpvnlznbs.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (Supabase dashboard -> Project Settings ->
//                                API -> "service_role" key — NOT the anon
//                                key already in the app. Keep this secret.)
//   RESEND_API_KEY             = (free at resend.com — used only to send
//                                 the backup email, nothing else)
//   BACKUP_EMAIL_TO            = the email address that should receive it
//                                 (e.g. the owner's email — can be a
//                                 comma-separated list for more than one)
//   BACKUP_EMAIL_FROM          = a "from" address Resend lets you send as
//                                 (their setup guide covers this — a free
//                                 Resend account can send from their test
//                                 domain immediately, no domain needed to
//                                 start)
//
// Every table backed up here is exactly what the app itself reads and
// writes — nothing else, and nothing sent anywhere except the one email
// address you configure above.

import ExcelJS from "exceljs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BACKUP_EMAIL_TO = process.env.BACKUP_EMAIL_TO;
const BACKUP_EMAIL_FROM = process.env.BACKUP_EMAIL_FROM;

// Every table the app uses. If you add a new table later (e.g. through a
// future feature), add its name here too or it won't be included.
const TABLES = [
  "jobs",
  "customers",
  "vehicles",
  "team_members",
  "quotations",
  "service_roles",
  "service_categories",
  "service_treatments",
  "deletion_log",
];

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Excel cells can't hold nested objects/arrays directly, so JSON columns
// (history, service_types, etc.) are written as their JSON text — still
// fully readable, just not "native" Excel columns.
function flattenValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mr.CAP Backup";
  workbook.created = new Date();

  for (const table of TABLES) {
    const sheet = workbook.addWorksheet(table.slice(0, 31)); // Excel sheet name limit
    let rows;
    try {
      rows = await fetchTable(table);
    } catch (err) {
      sheet.addRow([`Could not fetch this table: ${err.message}`]);
      continue;
    }
    if (!rows.length) {
      sheet.addRow(["(no rows)"]);
      continue;
    }
    const columns = Object.keys(rows[0]);
    const headerRow = sheet.addRow(columns);
    headerRow.font = { bold: true };
    for (const row of rows) {
      sheet.addRow(columns.map((c) => flattenValue(row[c])));
    }
    sheet.columns.forEach((col) => { col.width = 24; });
  }

  return workbook;
}

async function sendBackupEmail(buffer) {
  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const base64 = Buffer.from(buffer).toString("base64");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: BACKUP_EMAIL_FROM,
      to: BACKUP_EMAIL_TO.split(",").map((s) => s.trim()),
      subject: `Mr.CAP Database Backup — ${monthLabel}`,
      text: `Attached is the full Mr.CAP database backup for ${monthLabel} (as of ${dateStamp}).\n\nThis contains everything currently in the system — job cards, customers, vehicles, team, quotations, and service pricing. Keep it somewhere safe (e.g. a dated folder in Google Drive) in case it's ever needed to restore or check against the live system.`,
      attachments: [
        {
          filename: `mrcap-backup-${dateStamp}.xlsx`,
          content: base64,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}

export default async () => {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "BACKUP_EMAIL_TO", "BACKUP_EMAIL_FROM"]
    .filter((key) => !process.env[key]);
  if (missing.length) {
    console.error("Monthly backup skipped — missing environment variables:", missing.join(", "));
    return new Response(`Missing environment variables: ${missing.join(", ")}`, { status: 500 });
  }

  try {
    const workbook = await buildWorkbook();
    const buffer = await workbook.xlsx.writeBuffer();
    await sendBackupEmail(buffer);
    console.log("Monthly backup sent successfully.");
    return new Response("Backup sent successfully", { status: 200 });
  } catch (err) {
    console.error("Monthly backup failed:", err);
    return new Response(`Backup failed: ${err.message}`, { status: 500 });
  }
};

// Runs at 03:00 UTC (07:00 Dubai time) on the 1st of every month.
export const config = {
  schedule: "0 3 1 * *",
};
