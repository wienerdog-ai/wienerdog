'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Append-only durable failure log under state/alerts.jsonl. Replaces the
// transient digest banner (WP-020) whose regeneration erased it. One JSON object
// per line; every recorded entry is "unresolved" by construction. ADR-0012 part 3:
// mechanics, not vault — plain job-status facts, no transcript/tool-result content.

const ALERTS_FILE = 'alerts.jsonl';

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function alertsPath(paths) {
  return path.join(paths.state, ALERTS_FILE);
}

/** Append one unresolved failure alert (atomic append; creates state/ if needed).
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{job:string, at:string, reason:string, log_hint:string}} record */
function appendAlert(paths, record) {
  fs.mkdirSync(paths.state, { recursive: true });
  fs.appendFileSync(alertsPath(paths), `${JSON.stringify(record)}\n`);
}

/** All unresolved alerts, oldest first. Missing file → []; malformed lines skipped.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {Array<{job:string, at:string, reason:string, log_hint:string}>} */
function readAlerts(paths) {
  let text;
  try {
    text = fs.readFileSync(alertsPath(paths), 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/** Remove all alerts for `job` (called when that job next succeeds). Atomic
 *  temp+rename. Removes the file when no alerts remain.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} job */
function clearAlerts(paths, job) {
  const remaining = readAlerts(paths).filter((a) => a.job !== job);
  const file = alertsPath(paths);
  if (remaining.length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, remaining.map((a) => JSON.stringify(a)).join('\n') + '\n');
  fs.renameSync(tmp, file);
}

module.exports = { appendAlert, readAlerts, clearAlerts, ALERTS_FILE };
