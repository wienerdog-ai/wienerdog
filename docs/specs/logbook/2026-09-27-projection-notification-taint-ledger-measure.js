#!/usr/bin/env node
'use strict';
// RE-MEASUREMENT for WP-dream-projection-notification-taint, Table N rows N6-N7 —
// COUNTS ONLY.
//
//   node docs/specs/logbook/2026-09-27-projection-notification-taint-ledger-measure.js [--days N] [--projects DIR]
//
// Runs THIS TREE's `parsePrimaryWithOutcome` over the local Claude transcripts
// (default ~/.claude/projects, files modified in the last N days; N defaults to
// 5; 0 means every file) and, for every (session, invoked skill) pair — the
// unit the learnings-ledger gate derives trust for — reports whether its
// invocation windows are tainted by an external tool_result (the rule before
// this package) and whether the session's gate value carries
// `task_notification` (row N7), and how many pairs row N7 moves from clean to
// tainted. The tool_result half of the window rule is re-implemented here as a
// MEASUREMENT device over the gate value only; the product rule is
// `invocationWindowTainted` in src/core/dream/validate.js.
//
// PRIVACY: it reads only the text-free gate projection (roles, indices, the
// notification key). It prints no transcript text, no path, no session id and
// no skill name — counts only. Inert: no dependency, no network, no write.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..', '..');
const { parsePrimaryWithOutcome, newRunBudget } = require(path.join(repo, 'src/core/transcripts'));

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const days = Number(opt('--days', '5'));
const projectsDir = opt('--projects', path.join(os.homedir(), '.claude', 'projects'));
const since = days > 0 ? Date.now() - days * 864e5 : null;

const files = [];
let dirs = [];
try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { /* none */ }
for (const d of dirs) {
  if (!d.isDirectory()) continue;
  let entries = [];
  try { entries = fs.readdirSync(path.join(projectsDir, d.name), { withFileTypes: true }); } catch { continue; }
  for (const f of entries) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
    const p = path.join(projectsDir, d.name, f.name);
    const st = fs.statSync(p);
    if (since === null || st.mtimeMs > since) files.push({ path: p, size: st.size });
  }
}

/** The tool_result half of the window rule (the rule before this package). */
function toolTainted(gate, skill) {
  const msgs = gate.messages;
  const invs = gate.skill_invocations || [];
  const starts = invs.map((si) => si.index).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  for (const inv of invs) {
    if (inv.skill !== skill) continue;
    if (!Number.isInteger(inv.index) || inv.index < 0 || inv.index >= msgs.length) return true;
    const next = starts.find((n) => n > inv.index);
    const end = next === undefined ? msgs.length : next;
    const ri = inv.resultIndex;
    if (!Number.isInteger(ri) || ri < inv.index || ri >= end) return true;
    for (let i = inv.index; i < end; i++) if (i !== ri && msgs[i].role === 'tool_result') return true;
  }
  return false;
}

let sessions = 0;
let withNotes = 0;
let pairs = 0;
let pairsInNoteSessions = 0;
let cleanBefore = 0;
let moved = 0;
for (const f of files) {
  const { gateExtract: gate, parse } = parsePrimaryWithOutcome({ harness: 'claude', path: f.path, size: f.size }, newRunBudget());
  if (parse.outcome !== 'ok') continue;
  sessions += 1;
  const noted = gate.task_notification !== undefined;
  if (noted) withNotes += 1;
  for (const skill of new Set((gate.skill_invocations || []).map((si) => si.skill))) {
    pairs += 1;
    if (noted) pairsInNoteSessions += 1;
    if (!toolTainted(gate, skill)) {
      cleanBefore += 1;
      if (noted) moved += 1;
    }
  }
}
console.log(`sessions ${sessions} | carrying task_notification in the gate value ${withNotes}`);
console.log(`(session, invoked skill) pairs ${pairs} | in sessions carrying it ${pairsInNoteSessions}`);
console.log(`pairs clean before this package (no external tool_result in any window) ${cleanBefore}`);
console.log(`  of them tainted by row N7 ${moved}`);
