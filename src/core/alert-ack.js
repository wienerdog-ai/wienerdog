'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { writeFilePrivate } = require('./private-fs');

// The acknowledgement store: an attended `wienerdog alerts ack` silences a
// specific (job, reason) pair in the SESSION DIGEST ONLY (Table B). It never
// changes what any job verifies, what it exits, or what it writes to
// alerts.jsonl (WP-attended-alert-acknowledgement, Table A/B/C).

/** Basename of the acknowledgement store under state/. */
const ACK_FILE = 'alerts-ack.json';
/** Hard cap on stored acknowledgements; a write keeps the NEWEST this many. */
const MAX_ACKS = 100;

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function ackPath(paths) {
  return path.join(paths.state, ACK_FILE);
}

/** The acknowledgement key for one alert: lowercase hex sha256 over the
 *  canonical JSON of the [job, reason] PAIR. The job is inside the hash, so an
 *  acknowledgement for one job can never suppress another job's alert, and a
 *  single byte of change in `reason` produces a different key (Table B).
 *  @param {string} job @param {string} reason @returns {string} 64 lowercase hex chars */
function ackKey(job, reason) {
  return crypto.createHash('sha256').update(JSON.stringify([job, reason])).digest('hex');
}

/** Every VALID acknowledgement record on file, in stored order (oldest first).
 *  FAILS OPEN: a missing, unreadable, non-JSON, wrong-schema or wrong-shaped
 *  file yields [] — which suppresses nothing (Table A). Invalid individual
 *  records are ignored, never repaired and never written back.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {Array<{job:string, key:string, at:string}>} */
function readAcks(paths) {
  let text;
  try {
    text = fs.readFileSync(ackPath(paths), 'utf8');
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  if (parsed.schema !== 1) return [];
  if (!Array.isArray(parsed.acked)) return [];
  const out = [];
  for (const r of parsed.acked) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.job !== 'string') continue;
    if (typeof r.key !== 'string' || !/^[0-9a-f]{64}$/.test(r.key)) continue;
    if (typeof r.at !== 'string') continue;
    out.push({ job: r.job, key: r.key, at: r.at });
  }
  return out;
}

/** Acknowledge every distinct (job, reason) pair in `alerts`. Keys already on
 *  file are NOT re-added and their `at` is left alone, so calling this twice with
 *  the same input is a no-op on the second call. Writes 0600 via
 *  writeFilePrivate. Returns how many NEW records were stored.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {Array<{job:string, reason:string}>} alerts
 *  @returns {{added:number}} */
function addAcks(paths, alerts) {
  const existing = readAcks(paths);
  const seenKeys = new Set(existing.map((r) => r.key));
  const now = new Date().toISOString();
  const additions = [];
  const addedKeys = new Set();
  for (const a of alerts) {
    const key = ackKey(a.job, a.reason);
    if (seenKeys.has(key) || addedKeys.has(key)) continue;
    addedKeys.add(key);
    additions.push({ job: a.job, key, at: now });
  }
  if (additions.length === 0) return { added: 0 };
  const combined = existing.concat(additions).slice(-MAX_ACKS);
  const obj = { schema: 1, acked: combined };
  writeFilePrivate(ackPath(paths), `${JSON.stringify(obj, null, 2)}\n`);
  return { added: additions.length };
}

/** Drop every acknowledgement whose `job` equals `job`; delete the file when
 *  none remain. Called by clearAlerts when that job next succeeds, so an
 *  acknowledgement never outlives the alert it silenced (Table A). A no-op
 *  when nothing is pruned (no matching `job`), so an unrelated job's success
 *  never rewrites the store. Best-effort: never throws out of this function.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} job */
function pruneAcksForJob(paths, job) {
  try {
    const existing = readAcks(paths);
    const remaining = existing.filter((r) => r.job !== job);
    if (remaining.length === existing.length) return;
    const file = ackPath(paths);
    if (remaining.length === 0) {
      fs.rmSync(file, { force: true });
      return;
    }
    writeFilePrivate(file, `${JSON.stringify({ schema: 1, acked: remaining }, null, 2)}\n`);
  } catch {
    /* best-effort — never throw out of clearAlerts' lifecycle hook */
  }
}

/** `alerts` minus every entry whose (job, reason) is acknowledged. Pure: reads
 *  the store, allocates a new array, mutates nothing. A non-array `alerts`
 *  returns []. This is the ONLY suppression point (Table B).
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {Array<{job:string, at:string, reason:string, log_hint:string}>} alerts
 *  @returns {Array<{job:string, at:string, reason:string, log_hint:string}>} */
function unacknowledgedAlerts(paths, alerts) {
  if (!Array.isArray(alerts)) return [];
  const acked = new Set(readAcks(paths).map((r) => r.key));
  return alerts.filter((a) => !acked.has(ackKey(a.job, a.reason)));
}

module.exports = {
  ACK_FILE,
  MAX_ACKS,
  ackPath,
  ackKey,
  readAcks,
  addAcks,
  pruneAcksForJob,
  unacknowledgedAlerts,
};
