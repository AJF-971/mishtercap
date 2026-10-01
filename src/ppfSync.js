/* ================================================================
   PPF Room — conflict-free merging of the tablet's taps.

   The PPF tablet, Ahmed's review and Ahmed's scope editor all write
   whole jsonb objects (ppf_progress, service_done, service_reviewed).
   Writing one of those from a copy that is minutes or hours old wipes
   out whatever somebody else did in the meantime. So nothing in the
   PPF Room writes a finished object any more. It writes small "ops"
   ("panel X done at T", "start", "finish", "crew is A+B", "send back",
   "review"), and each op is applied on top of a fresh copy read from
   the server right before the write.

   Per-panel rule: last write wins, by the op's own timestamp. The
   append-only ppf_progress.log is the record of when each panel last
   changed, so no tombstones are needed. Applying the same op twice is a
   no-op (a retry after a lost response cannot double up).

   Everything here is pure (no network, no React) so the tablet can
   show "server copy + my pending taps" with the exact same maths the
   server write uses, and so it can be unit-tested.
================================================================ */

export const PPF_ROOM_BY = "PPF Room";

export function emptyProgress() {
  return { zones: {}, history: [], log: [] };
}

// When did this panel last change? Newest of its current tick and any log line.
export function zoneLastAt(pr, key) {
  let t = 0;
  const z = pr && pr.zones && pr.zones[key];
  if (z && z.doneAt) t = z.doneAt;
  const log = (pr && pr.log) || [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e && e.key === key && e.at > t) t = e.at;
  }
  return t;
}

// op: { t:"zone", key, action:"done"|"skipped"|"undone", at }
// Returns the new progress, or null when nothing changes (exact repeat).
export function applyZoneOp(pr, op) {
  const base = pr || emptyProgress();
  const log0 = base.log || [];
  if (log0.some((e) => e && e.key === op.key && e.at === op.at && e.action === op.action)) return null;
  const last = zoneLastAt(base, op.key);
  const zones = { ...(base.zones || {}) };
  let history = (base.history || []).slice();
  if (op.at >= last) {
    if (op.action === "done") { zones[op.key] = { doneAt: op.at }; history = history.filter((k) => k !== op.key); history.push(op.key); }
    else if (op.action === "skipped") { zones[op.key] = { doneAt: op.at, skipped: true }; history = history.filter((k) => k !== op.key); history.push(op.key); }
    else { delete zones[op.key]; const i = history.lastIndexOf(op.key); if (i > -1) history.splice(i, 1); }
  }
  const log = [...log0, { key: op.key, action: op.action, at: op.at }];
  log.sort((a, b) => (a.at || 0) - (b.at || 0)); // stable: equal stamps keep their order
  return { ...base, zones, history, log };
}

const sameHist = (a, b) => a && b && a.at === b.at && a.note === b.note && a.stage === b.stage;

// row: { ppf_progress, service_done, service_reviewed, history } as stored.
// Returns the new values plus which columns actually changed.
export function applyOpToRow(row, op) {
  let pr = row.ppf_progress || null;
  let sd = row.service_done || {};
  let sr = row.service_reviewed || {};
  let addHist = [];
  const out = { pr: false, sd: false, sr: false };
  switch (op.t) {
    case "zone": {
      const r = applyZoneOp(pr, op);
      if (r) { pr = r; out.pr = true; }
      break;
    }
    case "start": {
      if (pr && pr.startedAt) break;
      const b = pr || emptyProgress();
      pr = { ...b, startedAt: op.at, zones: b.zones || {}, history: b.history || [], log: [...(b.log || []), { key: "job", action: "started", at: op.at }] };
      out.pr = true;
      addHist.push({ stage: "ppf_room", label: "PPF Room", by: PPF_ROOM_BY, role: "ppf", note: "PPF started", at: op.at });
      break;
    }
    case "finish": {
      if (pr && pr.finishedAt && sd.ppf) break;
      const b = pr || emptyProgress();
      pr = { ...b, finishedAt: op.at, zones: b.zones || {}, history: b.history || [], log: [...(b.log || []), { key: "job", action: "finished", at: op.at }] };
      sd = { ...sd, ppf: true };
      out.pr = true; out.sd = true;
      addHist.push({ stage: "ppf_room", label: "PPF Room", by: PPF_ROOM_BY, role: "ppf", note: "PPF finished — sent to Ahmed", at: op.at });
      break;
    }
    case "crew": {
      const b = pr || emptyProgress();
      if (op.at < (b.crewAt || 0)) break;
      if (b.crewAt === op.at && JSON.stringify(b.crew || null) === JSON.stringify(op.ids)) break;
      pr = { ...b, zones: b.zones || {}, history: b.history || [], log: b.log || [], crew: op.ids.slice(), crewAt: op.at };
      out.pr = true;
      break;
    }
    case "reopen": {
      if (!(pr && pr.finishedAt) && !sd.ppf) break;
      const b = pr || emptyProgress();
      const next = { ...b, reopened: { at: op.at, by: op.by || "Ahmed", reason: op.reason || "" }, log: [...(b.log || []), { key: "job", action: "reopened", at: op.at }] };
      delete next.finishedAt;
      pr = next;
      sd = { ...sd, ppf: false };
      out.pr = true; out.sd = true;
      addHist.push({ stage: "ppf_room", label: "PPF Room", by: op.by || "Ahmed", role: "intake", note: `Sent back to PPF Room${op.reason ? ": " + op.reason : ""}`, at: op.at });
      break;
    }
    case "review": {
      if (sr.ppf) break;
      const b = pr || emptyProgress();
      pr = { ...b, review: op.review };
      sr = { ...sr, ppf: { by: op.review.by, at: op.review.at } };
      out.pr = true; out.sr = true;
      break;
    }
    default:
  }
  const hist0 = row.history || [];
  const freshHist = addHist.filter((h) => !hist0.some((x) => sameHist(x, h)));
  return { pr, sd, sr, history: freshHist.length ? [...hist0, ...freshHist] : hist0, changed: { ...out, history: freshHist.length > 0 } };
}

// Apply a list of ops in order on top of a row; aggregate what changed.
export function applyOpsToRow(row, ops) {
  let cur = { ppf_progress: row.ppf_progress || null, service_done: row.service_done || {}, service_reviewed: row.service_reviewed || {}, history: row.history || [] };
  const changed = { pr: false, sd: false, sr: false, history: false };
  for (const op of ops) {
    const r = applyOpToRow(cur, op);
    cur = { ppf_progress: r.pr, service_done: r.sd, service_reviewed: r.sr, history: r.history };
    for (const k of Object.keys(changed)) if (r.changed[k]) changed[k] = true;
  }
  return { ppf_progress: cur.ppf_progress, service_done: cur.service_done, service_reviewed: cur.service_reviewed, history: cur.history, changed };
}

// Sort rank for the tablet's car list: stable, by when each car was first
// sent to the PPF Room (not by "last updated", which shuffles cards).
export function ppfSentAt(job) {
  const sc = job.ppfScope;
  return (sc && (sc.firstSentAt || sc.setAt)) || 0;
}
