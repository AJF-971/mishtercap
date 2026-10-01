/* ---------------------------------------------------------------
   Customer-facing pages — the job card (?approve=<token>) and the
   quotation (?quote=<id>). These are what a customer opens from
   WhatsApp, so they represent the brand.

   Kept in their own module (no import of GarageApp.jsx) so main.jsx can
   load them on their own: a customer downloads a few tens of KB instead of
   the whole staff app. The only piece that still needs the staff bundle is
   the PDF builder, and that is loaded on demand when "Download PDF" is
   tapped.
--------------------------------------------------------------- */
import React, { useState, useEffect, useCallback } from "react";
import { Phone, MessageCircle, Download, AlertCircle } from "lucide-react";
import { COLORS, FONT_IMPORT, DISPLAY_FONT, MONO_FONT, BODY_FONT, RADIUS, FONT_SIZE, TAP, SHOP_CONTACT } from "./theme.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseConfig.js";
import { formatLongDate, VAT_RATE_DEFAULT } from "./billing.js";

const JOB_APPROVAL_URL = `${SUPABASE_URL}/functions/v1/job-approval`;

// The job-approval edge function: read-only `view` (job card) and `quote`.
async function jobApprovalCall(payload) {
  try {
    const res = await fetch(JOB_APPROVAL_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) return { ok: false, notFound: res.status === 404, error: data.error || text.slice(0, 200) };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "offline" };
  }
}

// One money format for both customer documents: AED 1,312.50, always 2 decimals.
const aed = (n) => `AED ${(Number(n) || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Labels for the quote page (the customer never loads the staff price list).
const SERVICE_LABELS = { detailing: "Detailing", ppf: "PPF & Films", dentrepair: "Dent Repair", bodyshop: "Body Work", upholstery: "Upholstery (Beneloom)" };
const TWO_WORD_MAKES = ["Land Rover", "Aston Martin", "Alfa Romeo", "Rolls Royce", "Mercedes Benz"];

// Vehicle fields of a snapshot; an old snapshot only has the combined
// makeModel string, so split it on the make.
function snapshotVehicle(s) {
  if (s.make) return { make: s.make, model: s.model || "", modelYear: s.modelYear || "", color: s.color || "" };
  const text = String(s.makeModel || "").trim();
  const two = TWO_WORD_MAKES.find((m) => text.toLowerCase().startsWith(m.toLowerCase() + " "));
  if (two) return { make: text.slice(0, two.length), model: text.slice(two.length).trim(), modelYear: "", color: "" };
  const words = text.split(/\s+/).filter(Boolean);
  return { make: words[0] || "", model: words.slice(1).join(" "), modelYear: "", color: "" };
}

const PUBLIC_STYLES = `
${FONT_IMPORT}
@keyframes mrcapGoldSweep { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
html, body { background: ${COLORS.paper}; }
body { margin: 0; color: ${COLORS.ink}; font-family: ${BODY_FONT}; font-size: ${FONT_SIZE.customerBody}px; -webkit-font-smoothing: antialiased; }
* { -webkit-tap-highlight-color: transparent; }
button { font-family: inherit; }
button:focus-visible, a:focus-visible { outline: 2px solid ${COLORS.goldBright}; outline-offset: 2px; }
.mrcap-skeleton { background: linear-gradient(90deg, ${COLORS.panel} 25%, ${COLORS.panel2} 50%, ${COLORS.panel} 75%); background-size: 200% 100%; animation: mrcapGoldSweep 1.4s ease-in-out infinite; border-radius: 14px; }
.mrcap-press { transition: transform 0.14s ease, opacity 0.14s ease; }
.mrcap-press:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) { .mrcap-skeleton { animation: none !important; } .mrcap-press { transition: none !important; } }
`;

const primaryBtn = { minHeight: 52, padding: "13px 16px", borderRadius: RADIUS.md, border: "none", background: COLORS.gold, color: COLORS.darkText, fontWeight: 700, fontSize: 16, cursor: "pointer" };
const secondaryBtn = { minHeight: 52, padding: "13px 16px", borderRadius: RADIUS.md, border: `1px solid ${COLORS.line}`, background: COLORS.panel2, color: COLORS.ink, fontWeight: 600, fontSize: 16, cursor: "pointer" };

function SkeletonRows({ count = 3, height = 56 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => <div key={i} className="mrcap-skeleton" style={{ height, border: `1px solid ${COLORS.line}` }} />)}
    </div>
  );
}

// Call / WhatsApp the shop. `context` is a short line for the WhatsApp text.
function ContactBar({ context }) {
  const text = `Hello Mr.CAP${context ? `, about ${context}` : ""}`;
  const btn = { flex: 1, minHeight: 52, borderRadius: RADIUS.md, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 700, fontSize: 16, textDecoration: "none", boxSizing: "border-box" };
  return (
    <div data-testid="contact-bar" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, background: "rgba(10,10,9,0.96)", borderTop: `1px solid ${COLORS.line}`, padding: "10px 16px", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", display: "flex", gap: 10 }}>
        <a href={`tel:${SHOP_CONTACT.phoneTel}`} className="mrcap-press" style={{ ...btn, border: `1.5px solid ${COLORS.gold}`, background: "transparent", color: COLORS.gold }}>
          <Phone size={20} /> Call
        </a>
        <a href={`https://wa.me/${SHOP_CONTACT.whatsapp}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="mrcap-press" style={{ ...btn, border: "none", background: "#25D366", color: "#0D2A17" }}>
          <MessageCircle size={20} /> WhatsApp us
        </a>
      </div>
    </div>
  );
}

// Tab title + "don't index" for a customer link.
function usePublicMeta(title) {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "robots"); document.head.appendChild(meta); }
    meta.setAttribute("content", "noindex, nofollow");
  }, [title]);
}

export function PublicPageShell({ children, context }) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.paper, fontFamily: BODY_FONT, color: COLORS.ink, display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 16px 120px", boxSizing: "border-box" }}>
      <style>{PUBLIC_STYLES}</style>
      <div style={{ width: 200, height: 62, borderRadius: RADIUS.md, background: "#fff", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", boxSizing: "border-box", border: `1px solid ${COLORS.line}`, boxShadow: "0 0 0 1px rgba(201,162,39,0.15), 0 12px 30px -12px rgba(0,0,0,0.6)" }}>
        <img src="/logo-header.png" alt="Mr.CAP." style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ width: "100%", maxWidth: 440 }}>{children}</div>
      <ContactBar context={context} />
    </div>
  );
}

// Branded dead end: what happened + a way to reach the shop (the contact bar
// is always on the page) + Try again when it may just be the connection.
function PublicProblem({ title, body, onRetry }) {
  return (
    <PublicPageShell>
      <div role="alert" style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: RADIUS.lg, padding: 24, textAlign: "center" }}>
        <AlertCircle size={34} color={COLORS.gold} style={{ marginBottom: 10 }} />
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 21, color: COLORS.ink, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.muted, marginTop: 10, lineHeight: 1.5 }}>{body}</div>
        <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.ink, marginTop: 12, lineHeight: 1.5 }}>Call or WhatsApp us below and we will sort it out straight away.</div>
        {onRetry && <button onClick={onRetry} className="mrcap-press" style={{ ...secondaryBtn, width: "100%", marginTop: 16 }}>Try again</button>}
      </div>
    </PublicPageShell>
  );
}

/* ---------------- Customer job card (?approve=<token>) ---------------- */
function PublicJobApprovalView({ token }) {
  usePublicMeta("Mr.CAP — Your job card");
  const [state, setState] = useState("loading"); // loading | ok | notfound | error
  const [data, setData] = useState(null);
  const [pdfError, setPdfError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false); // full-size view of the inspection picture

  const load = useCallback(async () => {
    const r = await jobApprovalCall({ action: "view", token });
    if (r.ok) { setData(r); setState("ok"); } else setState(r.notFound ? "notfound" : "error");
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!diagramOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setDiagramOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [diagramOpen]);

  if (state === "loading") return <PublicPageShell><SkeletonRows count={3} height={64} /></PublicPageShell>;
  if (state === "notfound") {
    return <PublicProblem title="We couldn't find this job card" body="The link may have been replaced by a newer one — please check your latest WhatsApp message from us." />;
  }
  if (state !== "ok") {
    return <PublicProblem title="This page didn't load" body="Something went wrong loading your job card. Please check your connection and try again." onRetry={() => { setState("loading"); load(); }} />;
  }

  const s = data.snapshot || {};
  const items = s.items || [];
  const veh = snapshotVehicle(s);
  const received = s.intakeDate || s.sentAt;
  const row = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: FONT_SIZE.customerBody, color: COLORS.muted, padding: "5px 0" };
  const vehRows = [["Make", veh.make], ["Model", veh.model], ["Year", veh.modelYear], ["Colour", veh.color], ["Plate", s.plate]].filter((r) => r[1]);
  // Services listed but nothing priced yet: don't show AED 0.00 amounts and a zero total as if they were real.
  const priced = items.length > 0 && Number(s.grandTotal) > 0;
  const markedPanels = Array.isArray(s.damagePanels) ? s.damagePanels.filter(Boolean) : [];
  const panelBox = { background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: RADIUS.sm, padding: "11px 13px", marginBottom: 12 };

  const downloadPdf = async () => {
    setPdfError(false); setPdfBusy(true);
    try {
      // The PDF builder lives in the staff bundle; it is only fetched now.
      const mod = await import("./GarageApp.jsx");
      mod.generateCustomerJobCardPDF(s).save(`MrCAP-JobCard-${s.jobRef || "copy"}.pdf`);
    } catch (e) { setPdfError(true); }
    setPdfBusy(false);
  };

  return (
    <PublicPageShell context={`job card${s.jobRef ? ` ${s.jobRef}` : ""}${s.plate ? ` (${s.plate})` : ""}`}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: RADIUS.lg, padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 26, color: COLORS.ink }}>Job Card</div>
          {s.jobRef && <div style={{ fontFamily: MONO_FONT, fontSize: 15, color: COLORS.gold, marginTop: 3 }}>Ref {s.jobRef}</div>}
          {s.customerName && <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.muted, marginTop: 8 }}>Prepared for {s.customerName}</div>}
        </div>

        <div data-testid="job-status" style={{ background: "rgba(74,122,87,0.14)", border: `1px solid ${COLORS.green}`, borderRadius: RADIUS.md, padding: "12px 14px", marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.successText }}>Your car is checked in with us</div>
          <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.ink, marginTop: 3 }}>
            {received ? `Received ${formatLongDate(new Date(received))}` : "We have your job card"}
            {s.revisedAt ? ` · updated ${formatLongDate(new Date(s.revisedAt))}` : ""}
          </div>
        </div>

        <div style={panelBox}>
          {received && <div style={{ ...row, color: COLORS.ink }}><span style={{ color: COLORS.muted }}>Date received</span><span>{formatLongDate(new Date(received))}</span></div>}
          {s.revisedAt && <div style={{ ...row, color: COLORS.ink }}><span style={{ color: COLORS.muted }}>Updated</span><span>{formatLongDate(new Date(s.revisedAt))}</span></div>}
          {vehRows.map(([k, val]) => <div key={k} style={{ ...row, color: COLORS.ink }}><span style={{ color: COLORS.muted }}>{k}</span><span style={k === "Plate" ? { fontFamily: MONO_FONT, color: COLORS.gold } : undefined}>{val}</span></div>)}
        </div>

        {(s.description || s.damageNotes) && (
          <div style={{ ...panelBox, fontSize: FONT_SIZE.customerBody, color: COLORS.ink, lineHeight: 1.5 }}>
            {s.description && <div><span style={{ color: COLORS.muted }}>Work requested: </span>{s.description}</div>}
            {s.damageNotes && <div style={{ marginTop: s.description ? 6 : 0 }}><span style={{ color: COLORS.muted }}>Condition noted: </span>{s.damageNotes}</div>}
          </div>
        )}

        {(s.diagram || markedPanels.length > 0) && (
          <div style={panelBox}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>Vehicle inspection</div>
            {s.diagram && (
              <button onClick={() => setDiagramOpen(true)} aria-label="Open the vehicle inspection picture full size" className="mrcap-press" style={{ display: "block", width: "100%", padding: 0, border: `1px solid ${COLORS.line}`, borderRadius: RADIUS.sm, overflow: "hidden", background: "#fff", cursor: "zoom-in" }}>
                <img src={s.diagram} alt="Vehicle inspection — marked parts" style={{ width: "100%", height: "auto", display: "block" }} />
              </button>
            )}
            {s.diagram && <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6, textAlign: "center" }}>Tap the picture to enlarge</div>}
            {markedPanels.length > 0 && (
              <div style={{ marginTop: s.diagram ? 10 : 0 }}>
                <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 6 }}>Marked parts</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {markedPanels.map((p) => <span key={p} style={{ background: "rgba(168,64,47,0.22)", color: COLORS.dangerText, fontWeight: 600, fontSize: 14, padding: "5px 11px", borderRadius: 999 }}>{p}</span>)}
                </div>
              </div>
            )}
          </div>
        )}

        {items.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {items.map((it, i) => (
              <div key={i} style={{ ...panelBox, marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: FONT_SIZE.customerBody, fontWeight: 600, color: COLORS.ink }}>{it.desc}</div>
                  {(it.qty > 1 || it.discount > 0) && <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 2 }}>{it.qty > 1 ? `${it.qty} × ${aed(it.price)}` : ""}{it.qty > 1 && it.discount > 0 ? " · " : ""}{it.discount > 0 ? `${it.discount}% off` : ""}</div>}
                </div>
                {priced && <div style={{ fontFamily: MONO_FONT, fontSize: FONT_SIZE.customerBody, color: COLORS.gold, whiteSpace: "nowrap" }}>{aed(it.amountExcl)}</div>}
              </div>
            ))}
            {!priced && <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.muted, textAlign: "center", marginTop: 8 }}>Pricing will be confirmed with you by the team.</div>}
          </div>
        ) : (
          <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.muted, textAlign: "center", marginBottom: 12 }}>Pricing will be confirmed with you by the team.</div>
        )}

        {priced && <div style={{ borderTop: `1px dashed ${COLORS.line}`, paddingTop: 10 }}>
          <div style={row}><span>Subtotal</span><span style={{ fontFamily: MONO_FONT }}>{aed(s.subtotal)}</span></div>
          <div style={row}><span>VAT {Math.round((s.vatRate == null ? VAT_RATE_DEFAULT : s.vatRate) * 100)}%</span><span style={{ fontFamily: MONO_FONT }}>{aed(s.vatTotal)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 4px" }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink }}>Total</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 21, color: COLORS.gold }}>{aed(s.grandTotal)}</span>
          </div>
        </div>}

        <button onClick={downloadPdf} disabled={pdfBusy} className="mrcap-press" style={{ ...secondaryBtn, width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: pdfBusy ? 0.7 : 1 }}>
          <Download size={18} /> {pdfBusy ? "Preparing…" : "Download PDF"}
        </button>
        {pdfError && <div role="alert" style={{ fontSize: 14, color: COLORS.dangerText, marginTop: 8, textAlign: "center" }}>Couldn't create the PDF on this device — please try again.</div>}

        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: RADIUS.md, background: COLORS.panel2, border: `1px solid ${COLORS.line}`, fontSize: 14, color: COLORS.muted, lineHeight: 1.55, textAlign: "center" }}>
          This job card is for your information. It is not a tax invoice — your tax invoice is issued on the day of payment. If extra work is agreed, this page updates.
        </div>
      </div>
      {diagramOpen && s.diagram && (
        <div role="dialog" aria-modal="true" aria-label="Vehicle inspection picture" onClick={() => setDiagramOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 14 }}>
          <img src={s.diagram} alt="Vehicle inspection — marked parts, full size" style={{ maxWidth: "100%", maxHeight: "78vh", width: "auto", height: "auto", background: "#fff", borderRadius: RADIUS.sm }} />
          <button autoFocus onClick={() => setDiagramOpen(false)} className="mrcap-press" style={{ ...secondaryBtn, marginTop: 14, minWidth: 140, minHeight: TAP }}>Close</button>
        </div>
      )}
    </PublicPageShell>
  );
}

/* ---------------- Customer quotation (?quote=<id>) ---------------- */
// View-only: accepting a quote is a staff action. Totals follow the job card
// page: Subtotal, VAT, Total, all in the same AED format.
function PublicQuoteView({ quoteId }) {
  usePublicMeta("Mr.CAP — Your quotation");
  const [status, setStatus] = useState("loading"); // loading | ok | notfound | error
  const [quote, setQuote] = useState(null);

  const load = useCallback(async () => {
    if (!quoteId) { setStatus("notfound"); return; }
    // Via the job-approval function, which returns only customer-safe
    // fields — the quotes table itself isn't readable without signing in.
    const r = await jobApprovalCall({ action: "quote", quoteId });
    if (!r.ok) { setStatus(r.notFound ? "notfound" : "error"); return; }
    const q = r.quote;
    setQuote({
      plate: q.plate, makeModel: q.make_model, serviceTypes: q.service_types || [], treatments: q.treatments || {},
      treatmentPrices: q.treatment_prices || {}, discountPercent: q.discount_percent || 0, parts: q.parts || [], status: q.status || "draft",
    });
    setStatus("ok");
  }, [quoteId]);
  useEffect(() => { load(); }, [load]);

  if (status === "loading") return <PublicPageShell><SkeletonRows count={3} height={64} /></PublicPageShell>;
  if (status === "notfound") return <PublicProblem title="We couldn't find that quotation" body="The link may be out of date — please check your latest WhatsApp message from us." />;
  if (status === "error" || !quote) return <PublicProblem title="This page didn't load" body="Something went wrong loading your quotation. Please check your connection and try again." onRetry={() => { setStatus("loading"); load(); }} />;

  const activeServices = quote.serviceTypes.map((key) => ({ key, label: SERVICE_LABELS[key] || key }));
  const partLine = (p) => (Number(p.price) || 0) * (Number(p.qty) || 1) * (1 - (Number(p.discountPercent) || 0) / 100);
  const partsTotal = (quote.parts || []).reduce((sum, p) => sum + partLine(p), 0);
  const servicesSubtotal = Object.values(quote.treatmentPrices || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const subtotal = servicesSubtotal * (1 - (quote.discountPercent || 0) / 100) + partsTotal;
  const vat = subtotal * VAT_RATE_DEFAULT;
  const total = subtotal + vat;
  const isAccepted = quote.status === "accepted";
  const row = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: FONT_SIZE.customerBody, color: COLORS.muted, padding: "5px 0" };
  const box = { background: COLORS.panel2, border: `1px solid ${COLORS.line}`, borderRadius: RADIUS.sm, padding: "11px 13px", marginBottom: 6 };

  return (
    <PublicPageShell context={`quotation${quote.plate ? ` (${quote.plate})` : ""}`}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: RADIUS.lg, padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>Quotation for</div>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 22, color: COLORS.ink, marginTop: 4 }}>{quote.makeModel || "Vehicle"}</div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 16, color: COLORS.gold, marginTop: 3 }}>{quote.plate || ""}</div>
        </div>

        {activeServices.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {activeServices.map((s) => (
              <div key={s.key} style={box}>
                <div style={{ fontSize: FONT_SIZE.customerBody, fontWeight: 600, color: COLORS.ink }}>{s.label}</div>
                <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 2 }}>{(quote.treatments[s.key] || []).join(", ")}</div>
              </div>
            ))}
          </div>
        )}

        {(quote.parts || []).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {quote.parts.map((p, i) => (
              <div key={p.id || i} style={{ ...box, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: FONT_SIZE.customerBody, fontWeight: 600, color: COLORS.ink }}>{p.description || (p.type === "fee" ? "Fee" : "Part")}</div>
                <div style={{ fontFamily: MONO_FONT, fontSize: FONT_SIZE.customerBody, color: COLORS.gold, whiteSpace: "nowrap" }}>{aed(partLine(p))}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: `1px dashed ${COLORS.line}`, paddingTop: 10 }}>
          <div style={row}><span>Subtotal</span><span style={{ fontFamily: MONO_FONT }}>{aed(subtotal)}</span></div>
          <div style={row}><span>VAT {Math.round(VAT_RATE_DEFAULT * 100)}%</span><span style={{ fontFamily: MONO_FONT }}>{aed(vat)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 4px" }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink }}>Total</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 21, color: COLORS.gold }}>{aed(total)}</span>
          </div>
        </div>

        {isAccepted ? (
          <div style={{ marginTop: 10, textAlign: "center", padding: "14px 16px", borderRadius: RADIUS.md, background: "rgba(74,122,87,0.12)", border: `1px solid ${COLORS.green}` }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.successText }}>Accepted — thank you!</div>
            <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.muted, marginTop: 5 }}>We'll be in touch to book you in.</div>
          </div>
        ) : (
          <div style={{ marginTop: 10, textAlign: "center", padding: "14px 16px", borderRadius: RADIUS.md, background: COLORS.panel2, border: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: FONT_SIZE.customerBody, color: COLORS.muted, lineHeight: 1.5 }}>To accept this quotation, reply to us on WhatsApp or give us a call — we'll confirm it on our end.</div>
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 14, color: COLORS.muted, lineHeight: 1.5, textAlign: "center" }}>This is a quotation, not a tax invoice. Prices are subject to confirmation.</div>
      </div>
    </PublicPageShell>
  );
}

// The one thing main.jsx mounts for a customer link.
export default function PublicLinkRouter() {
  const params = new URLSearchParams(window.location.search);
  const approveToken = params.get("approve");
  if (approveToken) return <PublicJobApprovalView token={approveToken} />;
  const quoteId = params.get("quote");
  if (quoteId) return <PublicQuoteView quoteId={quoteId} />;
  return null;
}
